import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  CreaOrdineClienteInput,
  RegistraSpedizioneInput,
  StatoOrdine,
  type OrdineCliente,
  type RigaOrdine,
} from '@magazzino/shared';
import { z } from 'zod';
import type { Env } from '../index';
import { cloni, ordiniClienti, portainnesti, righeOrdine, varieta } from '../db/schema';
import { type AppVariables, requireAdmin, requireAuth } from '../auth/middleware';
import { calcolaDisponibilita } from './disponibilita';

export const ordiniRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

ordiniRoutes.use('*', requireAuth);

ordiniRoutes.get('/', async (c) => {
  const utente = c.get('utente');
  if (utente.ruolo === 'produttore') {
    return c.json({ error: 'Permesso negato' }, 403);
  }

  const db = drizzle(c.env.DB);
  const ordiniRows = await db
    .select()
    .from(ordiniClienti)
    .orderBy(desc(ordiniClienti.dataOrdine), desc(ordiniClienti.id));

  if (ordiniRows.length === 0) {
    return c.json({ ordini: [] });
  }

  const righeRows = await db
    .select({
      id: righeOrdine.id,
      ordineId: righeOrdine.ordineId,
      varietaId: righeOrdine.varietaId,
      varietaNome: varieta.nome,
      cloneId: righeOrdine.cloneId,
      cloneCodice: cloni.codice,
      portainnestoId: righeOrdine.portainnestoId,
      portainnestoCodice: portainnesti.codice,
      quantitaOrdinata: righeOrdine.quantitaOrdinata,
      quantitaSpedita: righeOrdine.quantitaSpedita,
    })
    .from(righeOrdine)
    .innerJoin(varieta, eq(righeOrdine.varietaId, varieta.id))
    .innerJoin(cloni, eq(righeOrdine.cloneId, cloni.id))
    .innerJoin(portainnesti, eq(righeOrdine.portainnestoId, portainnesti.id))
    .where(
      inArray(
        righeOrdine.ordineId,
        ordiniRows.map((o) => o.id),
      ),
    );

  const righePerOrdine = new Map<number, RigaOrdine[]>();
  for (const r of righeRows) {
    const list = righePerOrdine.get(r.ordineId) ?? [];
    list.push(r);
    righePerOrdine.set(r.ordineId, list);
  }

  const result: OrdineCliente[] = ordiniRows.map((o) => ({
    id: o.id,
    clienteNome: o.clienteNome,
    stato: o.stato,
    dataOrdine: o.dataOrdine,
    note: o.note,
    righe: righePerOrdine.get(o.id) ?? [],
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  }));

  return c.json({ ordini: result });
});

// Creazione Ordine:
// - Il Commerciale può inserire una prenotazione/proposta d'ordine (nasce sempre in stato 'bozza')
// - L'Amministrazione può crearlo già 'confermato' (o in 'bozza')
ordiniRoutes.post('/', async (c) => {
  const utente = c.get('utente');
  if (utente.ruolo !== 'admin' && utente.ruolo !== 'commerciale') {
    return c.json({ error: 'Permesso negato' }, 403);
  }

  const parsed = CreaOrdineClienteInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Dati ordine non validi', details: parsed.error.flatten() }, 400);
  }

  const db = drizzle(c.env.DB);

  // Verifica che ogni clone appartenga alla rispettiva varietà (ADR-0006)
  for (const riga of parsed.data.righe) {
    const cloneOk = await db
      .select({ id: cloni.id })
      .from(cloni)
      .where(and(eq(cloni.id, riga.cloneId), eq(cloni.varietaId, riga.varietaId)))
      .get();

    if (!cloneOk) {
      return c.json(
        { error: `Il clone #${riga.cloneId} non appartiene alla varietà #${riga.varietaId}` },
        400,
      );
    }
  }

  const statoIniziale =
    utente.ruolo === 'commerciale'
      ? 'bozza'
      : parsed.data.confermaSubito
        ? 'confermato'
        : 'bozza';

  const notaFinale =
    utente.ruolo === 'commerciale'
      ? `[Prenotato da ${utente.nome}]${parsed.data.note ? ' ' + parsed.data.note : ''}`
      : (parsed.data.note ?? null);

  const ordineInserito = await db
    .insert(ordiniClienti)
    .values({
      clienteNome: parsed.data.clienteNome,
      stato: statoIniziale,
      dataOrdine: parsed.data.dataOrdine,
      note: notaFinale,
    })
    .returning()
    .get();

  await db.insert(righeOrdine).values(
    parsed.data.righe.map((r) => ({
      ordineId: ordineInserito.id,
      varietaId: r.varietaId,
      cloneId: r.cloneId,
      portainnestoId: r.portainnestoId,
      quantitaOrdinata: r.quantitaOrdinata,
      quantitaSpedita: 0,
    })),
  );

  // Calcola eventuali avvisi di scoperto non bloccanti (ADR-0003)
  const disp = await calcolaDisponibilita(c.env.DB, { soloScoperti: true });
  const avvisiScoperto = disp.filter((d) =>
    parsed.data.righe.some(
      (r) =>
        r.varietaId === d.varietaId &&
        r.cloneId === d.cloneId &&
        r.portainnestoId === d.portainnestoId,
    ),
  );

  return c.json(
    {
      ordineId: ordineInserito.id,
      stato: statoIniziale,
      avvisiScoperto,
    },
    201,
  );
});

// Registrazione spedizione totale o parziale ("di cui spedito", ADR-0004)
ordiniRoutes.post('/:id/spedizione', requireAdmin, async (c) => {
  const ordineId = Number(c.req.param('id'));
  const parsed = RegistraSpedizioneInput.safeParse(await c.req.json().catch(() => null));
  if (!Number.isInteger(ordineId) || ordineId <= 0 || !parsed.success) {
    return c.json({ error: 'Dati spedizione non validi' }, 400);
  }

  const db = drizzle(c.env.DB);
  const ordine = await db
    .select()
    .from(ordiniClienti)
    .where(eq(ordiniClienti.id, ordineId))
    .get();

  if (!ordine) {
    return c.json({ error: 'Ordine non trovato' }, 404);
  }
  if (ordine.stato === 'annullato' || ordine.stato === 'chiuso' || ordine.stato === 'bozza') {
    return c.json(
      { error: `Impossibile spedire un ordine in stato '${ordine.stato}' (confermalo prima)` },
      400,
    );
  }

  const righeAttuali = await db
    .select()
    .from(righeOrdine)
    .where(eq(righeOrdine.ordineId, ordineId));

  const mappaAggiornamenti = new Map<number, number>();
  for (const upd of parsed.data.righe) {
    mappaAggiornamenti.set(upd.rigaId, upd.quantitaSpedita);
  }

  for (const riga of righeAttuali) {
    const nuovaSpedita = mappaAggiornamenti.get(riga.id);
    if (nuovaSpedita !== undefined) {
      if (nuovaSpedita < 0 || nuovaSpedita > riga.quantitaOrdinata) {
        return c.json(
          {
            error: `La quantità spedita (${nuovaSpedita}) deve essere compresa tra 0 e la quantità ordinata (${riga.quantitaOrdinata})`,
          },
          400,
        );
      }
      await db
        .update(righeOrdine)
        .set({ quantitaSpedita: nuovaSpedita })
        .where(eq(righeOrdine.id, riga.id));
      riga.quantitaSpedita = nuovaSpedita;
    }
  }

  const tutteComplete = righeAttuali.every((r) => r.quantitaSpedita === r.quantitaOrdinata);
  const almenoUnaSpedita = righeAttuali.some((r) => r.quantitaSpedita > 0);

  const nuovoStato = tutteComplete
    ? 'spedito'
    : almenoUnaSpedita
      ? 'parzialmente_spedito'
      : 'confermato';

  await db
    .update(ordiniClienti)
    .set({ stato: nuovoStato, updatedAt: new Date().toISOString() })
    .where(eq(ordiniClienti.id, ordineId));

  return c.json({ ok: true, stato: nuovoStato });
});

// Cambio stato ordine: conferma prenotazione ('bozza' -> 'confermato'), chiusura residuo (ADR-0004) o annullamento (ADR-0005)
const CambiaStatoInput = z.object({
  stato: StatoOrdine,
});

ordiniRoutes.post('/:id/stato', requireAdmin, async (c) => {
  const ordineId = Number(c.req.param('id'));
  const parsed = CambiaStatoInput.safeParse(await c.req.json().catch(() => null));
  if (!Number.isInteger(ordineId) || ordineId <= 0 || !parsed.success) {
    return c.json({ error: 'Richiesta non valida' }, 400);
  }

  const db = drizzle(c.env.DB);
  const ordine = await db
    .select()
    .from(ordiniClienti)
    .where(eq(ordiniClienti.id, ordineId))
    .get();

  if (!ordine) {
    return c.json({ error: 'Ordine non trovato' }, 404);
  }

  await db
    .update(ordiniClienti)
    .set({ stato: parsed.data.stato, updatedAt: new Date().toISOString() })
    .where(eq(ordiniClienti.id, ordineId));

  return c.json({ ok: true, stato: parsed.data.stato });
});
