import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { z } from 'zod';
import type { Env } from '../index';
import {
  cloni,
  conferimentiLotti,
  ordiniClienti,
  portainnesti,
  righeOrdine,
  soci,
  varieta,
} from '../db/schema';
import { type AppVariables, requireAdmin, requireAuth } from '../auth/middleware';
import { calcolaDisponibilita } from './disponibilita';

export const backupRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

backupRoutes.use('*', requireAuth, requireAdmin);

export async function esportaSnapshotDatabase(d1: D1Database) {
  const db = drizzle(d1);
  const [
    listaVarieta,
    listaCloni,
    listaPortainnesti,
    listaSoci,
    listaConferimenti,
    listaOrdini,
    listaRighe,
    saldiDisponibilita,
  ] = await Promise.all([
    db.select().from(varieta).orderBy(varieta.id),
    db.select().from(cloni).orderBy(cloni.id),
    db.select().from(portainnesti).orderBy(portainnesti.id),
    db.select().from(soci).orderBy(soci.id),
    db.select().from(conferimentiLotti).orderBy(conferimentiLotti.id),
    db.select().from(ordiniClienti).orderBy(ordiniClienti.id),
    db.select().from(righeOrdine).orderBy(righeOrdine.id),
    calcolaDisponibilita(d1),
  ]);

  return {
    applicazione: 'Cooperativa Barbatelle',
    esportatoIl: new Date().toISOString(),
    dati: {
      varieta: listaVarieta,
      cloni: listaCloni,
      portainnesti: listaPortainnesti,
      soci: listaSoci,
      conferimentiLotti: listaConferimenti,
      ordiniClienti: listaOrdini,
      righeOrdine: listaRighe,
    },
    riepilogoSaldi: saldiDisponibilita,
  };
}

backupRoutes.get('/download', async (c) => {
  const snapshot = await esportaSnapshotDatabase(c.env.DB);
  const dateStr = snapshot.esportatoIl.slice(0, 10);
  const filename = `backup-cooperativa-barbatelle-${dateStr}.json`;

  return new Response(JSON.stringify(snapshot, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
});

/**
 * Importazione massiva del catalogo da righe CSV/testo:
 * - righeVarietaCloni: formato "NomeVarietà;CodiceClone" (una per riga)
 * - righePortainnesti: formato "CodicePortainnesto;Descrizione" (una per riga)
 */
const ImportCatalogoInput = z.object({
  righeVarietaCloni: z.string().optional().default(''),
  righePortainnesti: z.string().optional().default(''),
});

backupRoutes.post('/import-catalogo', async (c) => {
  const parsed = ImportCatalogoInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Formato dati non valido' }, 400);
  }

  const db = drizzle(c.env.DB);
  let varietaImportate = 0;
  let cloniImportati = 0;
  let portainnestiImportati = 0;

  // 1. Importa Portainnesti ("Codice;Descrizione")
  const portLines = parsed.data.righePortainnesti
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of portLines) {
    const [codiceRaw, ...descParts] = line.split(/[;,]/);
    const codice = codiceRaw?.trim();
    const descrizione = descParts.join(';').trim() || null;
    if (!codice) continue;

    await db
      .insert(portainnesti)
      .values({ codice, descrizione, attivo: true })
      .onConflictDoNothing();
    portainnestiImportati++;
  }

  // 2. Importa Varietà e Cloni ("NomeVarietà;CodiceClone")
  const varLines = parsed.data.righeVarietaCloni
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of varLines) {
    const [varNomeRaw, cloneCodRaw] = line.split(/[;,]/);
    const varNome = varNomeRaw?.trim();
    const cloneCod = cloneCodRaw?.trim();
    if (!varNome) continue;

    await db.insert(varieta).values({ nome: varNome, attiva: true }).onConflictDoNothing();
    varietaImportate++;

    if (cloneCod) {
      const vRow = await c.env.DB.prepare('SELECT id FROM varieta WHERE nome = ?')
        .bind(varNome)
        .first<{ id: number }>();

      if (vRow) {
        await db
          .insert(cloni)
          .values({ varietaId: vRow.id, codice: cloneCod, attivo: true })
          .onConflictDoNothing();
        cloniImportati++;
      }
    }
  }

  return c.json({
    ok: true,
    varietaElaborate: varietaImportate,
    cloniElaborati: cloniImportati,
    portainnestiElaborati: portainnestiImportati,
  });
});

