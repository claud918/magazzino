import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import {
  CreaCloneInput,
  CreaPortainnestoInput,
  CreaSocioInput,
  CreaVarietaInput,
} from '@magazzino/shared';
import type { Env } from '../index';
import { cloni, portainnesti, soci, varieta } from '../db/schema';
import { type AppVariables, requireAdmin, requireAuth } from '../auth/middleware';

export const catalogoRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

catalogoRoutes.use('*', requireAuth);

// Restituisce tutto il catalogo in un'unica chiamata per popolare i menu a tendina a cascata
catalogoRoutes.get('/', async (c) => {
  const db = drizzle(c.env.DB);
  const [listaVarieta, listaCloni, listaPortainnesti, listaSoci] = await Promise.all([
    db.select().from(varieta).orderBy(varieta.nome),
    db.select().from(cloni).orderBy(cloni.codice),
    db.select().from(portainnesti).orderBy(portainnesti.codice),
    db.select().from(soci).orderBy(soci.nome),
  ]);

  return c.json({
    varieta: listaVarieta.map((v) => ({ id: v.id, nome: v.nome, attiva: v.attiva })),
    cloni: listaCloni.map((cl) => ({
      id: cl.id,
      varietaId: cl.varietaId,
      codice: cl.codice,
      attivo: cl.attivo,
    })),
    portainnesti: listaPortainnesti.map((p) => ({
      id: p.id,
      codice: p.codice,
      descrizione: p.descrizione,
      attivo: p.attivo,
    })),
    soci: listaSoci.map((s) => ({
      id: s.id,
      nome: s.nome,
      note: s.note,
      attivo: s.attivo,
    })),
  });
});

catalogoRoutes.post('/varieta', requireAdmin, async (c) => {
  const parsed = CreaVarietaInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Dati varietà non validi', details: parsed.error.flatten() }, 400);
  }
  const db = drizzle(c.env.DB);
  const row = await db
    .insert(varieta)
    .values({ nome: parsed.data.nome, attiva: true })
    .returning()
    .get();
  return c.json({ varieta: { id: row.id, nome: row.nome, attiva: row.attiva } }, 201);
});

catalogoRoutes.post('/cloni', requireAdmin, async (c) => {
  const parsed = CreaCloneInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Dati clone non validi', details: parsed.error.flatten() }, 400);
  }
  const db = drizzle(c.env.DB);
  const v = await db.select().from(varieta).where(eq(varieta.id, parsed.data.varietaId)).get();
  if (!v) {
    return c.json({ error: 'Varietà non trovata' }, 404);
  }
  const row = await db
    .insert(cloni)
    .values({ varietaId: parsed.data.varietaId, codice: parsed.data.codice, attivo: true })
    .returning()
    .get();
  return c.json(
    {
      clone: {
        id: row.id,
        varietaId: row.varietaId,
        codice: row.codice,
        attivo: row.attivo,
      },
    },
    201,
  );
});

catalogoRoutes.post('/portainnesti', requireAdmin, async (c) => {
  const parsed = CreaPortainnestoInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      { error: 'Dati portainnesto non validi', details: parsed.error.flatten() },
      400,
    );
  }
  const db = drizzle(c.env.DB);
  const row = await db
    .insert(portainnesti)
    .values({
      codice: parsed.data.codice,
      descrizione: parsed.data.descrizione ?? null,
      attivo: true,
    })
    .returning()
    .get();
  return c.json(
    {
      portainnesto: {
        id: row.id,
        codice: row.codice,
        descrizione: row.descrizione,
        attivo: row.attivo,
      },
    },
    201,
  );
});

catalogoRoutes.post('/soci', requireAdmin, async (c) => {
  const parsed = CreaSocioInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Dati socio non validi', details: parsed.error.flatten() }, 400);
  }
  const db = drizzle(c.env.DB);
  const row = await db
    .insert(soci)
    .values({
      nome: parsed.data.nome,
      note: parsed.data.note ?? null,
      attivo: true,
    })
    .returning()
    .get();
  return c.json(
    {
      socio: {
        id: row.id,
        nome: row.nome,
        note: row.note,
        attivo: row.attivo,
      },
    },
    201,
  );
});

