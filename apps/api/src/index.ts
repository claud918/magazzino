import { Hono } from 'hono';
import { HealthResponse } from '@magazzino/shared';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

const app = new Hono<{ Bindings: Env }>().basePath('/api');

app.get('/health', async (c) => {
  const row = await c.env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>();
  const body: HealthResponse = HealthResponse.parse({ status: 'ok', db: row?.ok === 1 });
  return c.json(body);
});

app.notFound((c) => c.json({ error: 'Not found' }, 404));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Internal error' }, 500);
});

export default app;

