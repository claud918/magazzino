/**
 * Schemi Zod e tipi condivisi tra frontend (apps/web) e API (apps/api).
 */
import { z } from 'zod';

export const HealthResponse = z.object({
  status: z.literal('ok'),
  db: z.boolean(),
});

export type HealthResponse = z.infer<typeof HealthResponse>;

