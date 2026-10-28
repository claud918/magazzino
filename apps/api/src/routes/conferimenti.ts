import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { and, desc, eq } from 'drizzle-orm';
import {
  CreaConferimentoInput,
  CreaSegnalazioneSocioInput,
  type ConferimentoLotto,
  type SegnalazioneSocio,
} from '@magazzino/shared';
import type { Env } from '../index';
import {
  cloni,
  conferimentiLotti,
  portainnesti,
  segnalazioniSoci,
  soci,
  varieta,
} from '../db/schema';
import { type AppVariables, requireAdmin, requireAuth } from '../auth/middleware';

export const conferimentiRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

conferimentiRoutes.use('*', requireAuth);

conferimentiRoutes.get('/', async (c) => {
  const utente = c.get('utente');
  if (utente.ruolo === 'commerciale') {
    return c.json({ error: 'Permesso negato' }, 403);
  }

  const socioIdParam = c.req.query('socioId');
  const varietaIdParam = c.req.query('varietaId');

  const db = drizzle(c.env.DB);
  const filters = [];

  // Se l'utente è un socio produttore collegato a un socioId, vede solo i propri conferimenti
  if (utente.ruolo === 'produttore') {
    if (utente.socioId) {
      filters.push(eq(conferimentiLotti.socioId, utente.socioId));
    } else if (socioIdParam) {
      filters.push(eq(conferimentiLotti.socioId, Number(socioIdParam)));
    }
  } else if (socioIdParam) {
    filters.push(eq(conferimentiLotti.socioId, Number(socioIdParam)));
  }

  if (varietaIdParam) {
    filters.push(eq(conferimentiLotti.varietaId, Number(varietaIdParam)));
  }

  const rows = await db
    .select({
      id: conferimentiLotti.id,
      socioId: conferimentiLotti.socioId,
      socioNome: soci.nome,
      varietaId: conferimentiLotti.varietaId,
      varietaNome: varieta.nome,
      cloneId: conferimentiLotti.cloneId,
      cloneCodice: cloni.codice,
      portainnestoId: conferimentiLotti.portainnestoId,
      portainnestoCodice: portainnesti.codice,
      codiceLotto: conferimentiLotti.codiceLotto,
      quantitaConferita: conferimentiLotti.quantitaConferita,
      dataConferimento: conferimentiLotti.dataConferimento,
      note: conferimentiLotti.note,
      createdAt: conferimentiLotti.createdAt,
    })
    .from(conferimentiLotti)
    .innerJoin(soci, eq(conferimentiLotti.socioId, soci.id))
    .innerJoin(varieta, eq(conferimentiLotti.varietaId, varieta.id))
    .innerJoin(cloni, eq(conferimentiLotti.cloneId, cloni.id))
    .innerJoin(portainnesti, eq(conferimentiLotti.portainnestoId, portainnesti.id))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(conferimentiLotti.dataConferimento), desc(conferimentiLotti.id));

  return c.json({ conferimenti: rows satisfies ConferimentoLotto[] });
});

// --- Segnalazioni Disponibilità dei Soci Produttori (per coprire scoperti) ---

conferimentiRoutes.get('/segnalazioni', async (c) => {
  const utente = c.get('utente');
  if (utente.ruolo === 'commerciale') {
    return c.json({ error: 'Permesso negato' }, 403);
  }

  const db = drizzle(c.env.DB);
  const filters = [];
  if (utente.ruolo === 'produttore' && utente.socioId) {
    filters.push(eq(segnalazioniSoci.socioId, utente.socioId));
  }

  const rows = await db
    .select({
      id: segnalazioniSoci.id,
      socioId: segnalazioniSoci.socioId,
      socioNome: soci.nome,
      varietaId: segnalazioniSoci.varietaId,
      varietaNome: varieta.nome,
      cloneId: segnalazioniSoci.cloneId,
      cloneCodice: cloni.codice,
      portainnestoId: segnalazioniSoci.portainnestoId,
      portainnestoCodice: portainnesti.codice,
      quantitaProposta: segnalazioniSoci.quantitaProposta,
      stato: segnalazioniSoci.stato,
      note: segnalazioniSoci.note,
      createdAt: segnalazioniSoci.createdAt,
    })
    .from(segnalazioniSoci)
    .innerJoin(soci, eq(segnalazioniSoci.socioId, soci.id))
    .innerJoin(varieta, eq(segnalazioniSoci.varietaId, varieta.id))
    .innerJoin(cloni, eq(segnalazioniSoci.cloneId, cloni.id))
    .innerJoin(portainnesti, eq(segnalazioniSoci.portainnestoId, portainnesti.id))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(segnalazioniSoci.id));

  return c.json({ segnalazioni: rows satisfies SegnalazioneSocio[] });
});

conferimentiRoutes.post('/segnalazioni', async (c) => {
  const utente = c.get('utente');
  if (utente.ruolo !== 'produttore' && utente.ruolo !== 'admin') {
    return c.json({ error: 'Solo i soci produttori o l’amministrazione possono segnalare disponibilità' }, 403);
  }

  const parsed = CreaSegnalazioneSocioInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Dati segnalazione non validi', details: parsed.error.flatten() }, 400);
  }

  const socioIdFinale =
    utente.ruolo === 'produttore' && utente.socioId
      ? utente.socioId
      : parsed.data.socioId;

  if (!socioIdFinale) {
    return c.json({ error: 'Seleziona il socio produttore che segnala la disponibilità' }, 400);
  }

  const db = drizzle(c.env.DB);
  const cloneRow = await db
    .select({ id: cloni.id })
    .from(cloni)
    .where(and(eq(cloni.id, parsed.data.cloneId), eq(cloni.varietaId, parsed.data.varietaId)))
    .get();

  if (!cloneRow) {
    return c.json({ error: 'Il clone selezionato non appartiene alla varietà indicata' }, 400);
  }

  const inserted = await db
    .insert(segnalazioniSoci)
    .values({
      socioId: socioIdFinale,
      varietaId: parsed.data.varietaId,
      cloneId: parsed.data.cloneId,
      portainnestoId: parsed.data.portainnestoId,
      quantitaProposta: parsed.data.quantitaProposta,
      stato: 'aperta',
      note: parsed.data.note ?? null,
    })
    .returning()
    .get();

  return c.json({ segnalazione: inserted }, 201);
});

conferimentiRoutes.post('/segnalazioni/:id/converti', requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: 'ID segnalazione non valido' }, 400);
  }

  const db = drizzle(c.env.DB);
  const seg = await db
    .select()
    .from(segnalazioniSoci)
    .where(eq(segnalazioniSoci.id, id))
    .get();

  if (!seg) {
    return c.json({ error: 'Segnalazione non trovata' }, 404);
  }
  if (seg.stato !== 'aperta') {
    return c.json({ error: 'La segnalazione è già stata gestita' }, 400);
  }

  const oggi = new Date().toISOString().slice(0, 10);
  const conferimento = await db
    .insert(conferimentiLotti)
    .values({
      socioId: seg.socioId,
      varietaId: seg.varietaId,
      cloneId: seg.cloneId,
      portainnestoId: seg.portainnestoId,
      codiceLotto: `SEG-${seg.id}`,
      quantitaConferita: seg.quantitaProposta,
      dataConferimento: oggi,
      note: seg.note ? `Da segnalazione socio: ${seg.note}` : 'Convertito da segnalazione socio',
    })
    .returning()
    .get();

  await db
    .update(segnalazioniSoci)
    .set({ stato: 'convertita' })
    .where(eq(segnalazioniSoci.id, id));

  return c.json({ ok: true, conferimento });
});

conferimentiRoutes.post('/segnalazioni/:id/archivia', requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: 'ID segnalazione non valido' }, 400);
  }
  const db = drizzle(c.env.DB);
  await db
    .update(segnalazioniSoci)
    .set({ stato: 'archiviata' })
    .where(eq(segnalazioniSoci.id, id));
  return c.json({ ok: true });
});

// --- Registrazione ed eliminazione Conferimenti da parte dell'Amministrazione ---

conferimentiRoutes.post('/', requireAdmin, async (c) => {
  const parsed = CreaConferimentoInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Dati conferimento non validi', details: parsed.error.flatten() }, 400);
  }

  const db = drizzle(c.env.DB);

  // Verifica vincolo fondamentale ADR-0006: il clone deve appartenere alla varietà scelta
  const cloneRow = await db
    .select()
    .from(cloni)
    .where(and(eq(cloni.id, parsed.data.cloneId), eq(cloni.varietaId, parsed.data.varietaId)))
    .get();

  if (!cloneRow) {
    return c.json(
      { error: 'Il clone selezionato non appartiene alla varietà indicata' },
      400,
    );
  }

  const inserted = await db
    .insert(conferimentiLotti)
    .values({
      socioId: parsed.data.socioId,
      varietaId: parsed.data.varietaId,
      cloneId: parsed.data.cloneId,
      portainnestoId: parsed.data.portainnestoId,
      codiceLotto: parsed.data.codiceLotto ?? null,
      quantitaConferita: parsed.data.quantitaConferita,
      dataConferimento: parsed.data.dataConferimento,
      note: parsed.data.note ?? null,
    })
    .returning()
    .get();

  return c.json({ conferimento: inserted }, 201);
});

conferimentiRoutes.delete('/:id', requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: 'ID non valido' }, 400);
  }
  const db = drizzle(c.env.DB);
  await db.delete(conferimentiLotti).where(eq(conferimentiLotti.id, id));
  return c.json({ ok: true });
});
