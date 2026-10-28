import { Hono } from 'hono';
import type { DisponibilitaCombinazione } from '@magazzino/shared';
import type { Env } from '../index';
import { type AppVariables, requireAuth } from '../auth/middleware';

export const disponibilitaRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

disponibilitaRoutes.use('*', requireAuth);

interface RawDisponibilitaRow {
  varieta_id: number;
  varieta_nome: string;
  clone_id: number;
  clone_codice: string;
  portainnesto_id: number;
  portainnesto_codice: string;
  prodotto: number;
  ordinato: number;
  spedito: number;
}

/**
 * Calcola i 7 indicatori per ogni combinazione (Varietà + Clone + Portainnesto).
 * Vedi REQUISITI.md cap. 3 e ADR-0002 / ADR-0003.
 */
export async function calcolaDisponibilita(
  db: D1Database,
  filtri?: {
    varietaId?: number;
    soloDisponibili?: boolean;
    soloScoperti?: boolean;
    includiZero?: boolean;
  },
): Promise<DisponibilitaCombinazione[]> {
  const params: unknown[] = [];
  let whereClause = 'WHERE v.attiva = 1 AND cl.attivo = 1 AND p.attivo = 1';

  if (filtri?.varietaId) {
    whereClause += ' AND v.id = ?';
    params.push(filtri.varietaId);
  }

  const sqlQuery = `
    WITH conf_agg AS (
      SELECT
        varieta_id,
        clone_id,
        portainnesto_id,
        SUM(quantita_conferita) AS prodotto
      FROM conferimenti_lotti
      GROUP BY varieta_id, clone_id, portainnesto_id
    ),
    ord_agg AS (
      SELECT
        r.varieta_id,
        r.clone_id,
        r.portainnesto_id,
        SUM(
          CASE
            WHEN o.stato = 'chiuso' THEN r.quantita_spedita
            WHEN o.stato IN ('confermato', 'parzialmente_spedito', 'spedito') THEN r.quantita_ordinata
            ELSE 0
          END
        ) AS ordinato,
        SUM(
          CASE
            WHEN o.stato NOT IN ('annullato', 'bozza') THEN r.quantita_spedita
            ELSE 0
          END
        ) AS spedito
      FROM righe_ordine r
      INNER JOIN ordini_clienti o ON o.id = r.ordine_id
      GROUP BY r.varieta_id, r.clone_id, r.portainnesto_id
    )
    SELECT
      v.id AS varieta_id,
      v.nome AS varieta_nome,
      cl.id AS clone_id,
      cl.codice AS clone_codice,
      p.id AS portainnesto_id,
      p.codice AS portainnesto_codice,
      COALESCE(c.prodotto, 0) AS prodotto,
      COALESCE(o.ordinato, 0) AS ordinato,
      COALESCE(o.spedito, 0) AS spedito
    FROM cloni cl
    INNER JOIN varieta v ON v.id = cl.varieta_id
    CROSS JOIN portainnesti p
    LEFT JOIN conf_agg c
      ON c.varieta_id = v.id AND c.clone_id = cl.id AND c.portainnesto_id = p.id
    LEFT JOIN ord_agg o
      ON o.varieta_id = v.id AND o.clone_id = cl.id AND o.portainnesto_id = p.id
    ${whereClause}
    ORDER BY v.nome ASC, cl.codice ASC, p.codice ASC
  `;

  const res = await db
    .prepare(sqlQuery)
    .bind(...params)
    .all<RawDisponibilitaRow>();

  const rows = (res.results ?? []).map((r): DisponibilitaCombinazione => {
    const prodotto = Number(r.prodotto) || 0;
    const ordinato = Number(r.ordinato) || 0;
    const spedito = Number(r.spedito) || 0;
    const daSpedire = Math.max(0, ordinato - spedito);
    const disponibileVirtuale = prodotto - ordinato;
    const giacenzaFisica = prodotto - spedito;
    const fabbisognoScoperto = Math.max(0, ordinato - prodotto);

    return {
      varietaId: r.varieta_id,
      varietaNome: r.varieta_nome,
      cloneId: r.clone_id,
      cloneCodice: r.clone_codice,
      portainnestoId: r.portainnesto_id,
      portainnestoCodice: r.portainnesto_codice,
      prodotto,
      ordinato,
      spedito,
      daSpedire,
      disponibileVirtuale,
      giacenzaFisica,
      fabbisognoScoperto,
    };
  });

  return rows.filter((item) => {
    if (filtri?.soloScoperti) {
      return item.fabbisognoScoperto > 0;
    }
    if (filtri?.soloDisponibili) {
      return item.disponibileVirtuale > 0;
    }
    if (!filtri?.includiZero) {
      return item.prodotto !== 0 || item.ordinato !== 0 || item.spedito !== 0;
    }
    return true;
  });
}

disponibilitaRoutes.get('/', async (c) => {
  const varietaIdParam = c.req.query('varietaId');
  const soloDisponibili = c.req.query('soloDisponibili') === 'true';
  const soloScoperti = c.req.query('soloScoperti') === 'true';
  const includiZero = c.req.query('includiZero') === 'true';

  const items = await calcolaDisponibilita(c.env.DB, {
    varietaId: varietaIdParam ? Number(varietaIdParam) : undefined,
    soloDisponibili,
    soloScoperti,
    includiZero,
  });

  return c.json({ disponibilita: items });
});

