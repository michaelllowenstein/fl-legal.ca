/**
 * routes/logs.ts
 *
 * POST /api/logs/client
 *
 * Receives client-side error entries drained by LoggerService and writes
 * them to Firebase RTDB under /logs/client/{date}/{pushKey}.
 *
 * This route is intentionally:
 *   - Public (no auth required — the client might be logging an auth failure)
 *   - Rate-limited hard (10 per IP per minute) to prevent abuse
 *   - Silently accepting (always returns 204, even if Firebase write fails)
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { dbPush } from '../services/firebase';

export async function logRoutes(fastify: FastifyInstance): Promise<void> {

  fastify.post(
    '/client',
    {
      schema: {
        body: {
          type: 'object',
          required: ['date', 'entry'],
          additionalProperties: false,
          properties: {
            date:  { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
            entry: {
              type: 'object',
              properties: {
                level:     { type: 'string', enum: ['trace','debug','info','warn','error','fatal'] },
                ns:        { type: 'string', maxLength: 60 },
                message:   { type: 'string', maxLength: 500 },
                data:      { type: 'object' },
                ts:        { type: 'string' },
                sessionId: { type: 'string', maxLength: 40 },
                url:       { type: 'string', maxLength: 300 },
              },
            },
          },
        },
      },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (
      req:   FastifyRequest<{ Body: { date: string; entry: unknown } }>,
      reply: FastifyReply,
    ) => {
      // Fire-and-forget — client always gets 204 regardless
      dbPush(`logs/client/${req.body.date}`, req.body.entry).catch(() => {});
      return reply.status(204).send();
    },
  );
}