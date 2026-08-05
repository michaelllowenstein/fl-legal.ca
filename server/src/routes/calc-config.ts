/**
 * routes/calc-config.ts
 *
 * GET  /api/calc-config   — current calculator configuration (public)
 * PUT  /api/calc-config   — replace calculator configuration  (editor JWT required)
 *
 * Reads and writes target `public/calcConfig` in Firebase RTDB.
 * The entire config tree is small (~4 KB) so reads and writes are always
 * whole-object — no per-field PATCH needed.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { dbGet, dbMultiUpdate } from '../services/firebase';

export const CALC_CONFIG_DB_PATH = 'public/calcConfig';

/** The six tab keys the calculator recognises — anything else is rejected. */
export const VALID_CALC_TABS = new Set([
  'purchase-mortgage',
  'cash-purchase',
  'sale',
  'refinance',
  'wills',
  'incorporation',
]);

export interface CalcConfigRouteDeps {
  get: typeof dbGet;
  multiUpdate: typeof dbMultiUpdate;
  now: () => number;
}

const defaultDeps: CalcConfigRouteDeps = {
  get: dbGet,
  multiUpdate: dbMultiUpdate,
  now: Date.now,
};

export function isValidConfig(body: unknown): body is Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return false;
  }

  const obj = body as Record<string, unknown>;

  for (const key of Object.keys(obj)) {
    if (!VALID_CALC_TABS.has(key)) return false;
    const tab = obj[key];
    if (typeof tab !== 'object' || tab === null) return false;

    const t = tab as Record<string, unknown>;
    if (typeof t.fields !== 'object' || t.fields === null) return false;
    if (typeof t.disclaimer !== 'string') return false;
  }

  for (const expected of VALID_CALC_TABS) {
    if (!(expected in obj)) return false;
  }

  return true;
}

export async function calcConfigRoutes(
  fastify: FastifyInstance,
  opts?: Record<string, unknown>,
): Promise<void> {
  const deps: CalcConfigRouteDeps = {
    get: (opts?.get as typeof dbGet)      ?? dbGet,
    multiUpdate: (opts?.multiUpdate as typeof dbMultiUpdate) ?? dbMultiUpdate,
    now: (opts?.now as () => number)            ?? Date.now,
  };

  // ── GET /api/calc-config ─────────────────────────────────────────────────
  fastify.get(
    '/',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const data = await deps.get<Record<string, unknown>>(CALC_CONFIG_DB_PATH);
        reply.header('Cache-Control', 'public, max-age=5, stale-while-revalidate=30');
        return reply.status(200).send(data ?? {});
      } catch (err) {
        req.log.error({ err }, 'Failed to fetch calculator config');
        return reply.status(500).send({ error: 'Could not load calculator configuration.' });
      }
    },
  );

  // ── PUT /api/calc-config ─────────────────────────────────────────────────
  fastify.put(
    '/',
    {
      preHandler: [fastify.verifyCalcConfig],
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const body = req.body;

      if (!isValidConfig(body)) {
        return reply.status(400).send({
          error:
            'Invalid calculator config. Expected an object with all six tab keys, ' +
            'each containing { fields: {…}, disclaimer: string }.',
        });
      }

      try {
        await deps.multiUpdate({
          [CALC_CONFIG_DB_PATH]: body,
          [`public/audit/calcConfig/${deps.now()}`]: {
            action: 'calc-config-update',
            at: new Date().toISOString(),
          },
        });

        req.log.info('Calculator config updated');
        return reply.status(204).send();
      } catch (err) {
        req.log.error({ err }, 'Failed to update calculator config');
        return reply.status(500).send({ error: 'Could not save calculator configuration.' });
      }
    },
  );
}
