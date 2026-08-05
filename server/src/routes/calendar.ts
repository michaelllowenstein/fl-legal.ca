/**
 * routes/calendar.ts
 *
 * GET    /api/calendar           — list all events, sorted by date
 * GET    /api/calendar/:id       — get a single event
 * POST   /api/calendar           — create an event
 * PATCH  /api/calendar/:id       — update an event
 * DELETE /api/calendar/:id       — delete an event
 *
 * All routes require a valid lawyer JWT.
 *
 * Firebase RTDB layout
 * ────────────────────
 * /calendar/
 *   <push-key>/
 *     id:          "<push-key>"
 *     title:       "Client Meeting — Smith"
 *     date:        "2024-11-15"          ← YYYY-MM-DD
 *     time:        "10:30"               ← HH:MM 24h (optional)
 *     description: "Re: commercial lease" (optional)
 *     createdAt:   "2024-11-01T14:22:00Z"
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { dbGet, dbSet, dbPush, dbRemove, dbUpdate } from '../services/firebase';
import { calendarEventSchema } from '@schema';

const ROOT = 'calendar';

interface CalendarEvent {
  id:          string;
  title:       string;
  date:        string;
  time?:       string;
  description?: string;
  createdAt:   string;
}

type NewEvent = Omit<CalendarEvent, 'id' | 'createdAt'>;

// ─────────────────────────────────────────────────────────────────────────────

export async function calendarRoutes(fastify: FastifyInstance): Promise<void> {

  const guard = [(fastify as any).verifyLawyer];

  // ── GET /api/calendar ────────────────────────────────────────────────────────
  fastify.get(
    '/',
    { preHandler: guard },
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const raw = await dbGet<Record<string, CalendarEvent>>(ROOT);
        if (!raw) return reply.status(200).send([]);

        const events: CalendarEvent[] = Object.entries(raw)
          .map(([id, ev]) => ({ ...ev, id }))
          .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''));

        return reply.status(200).send(events);
      } catch (err) {
        req.log.error({ err }, 'Failed to fetch calendar events');
        return reply.status(500).send({ error: 'Could not load calendar.' });
      }
    },
  );

  // ── GET /api/calendar/:id ────────────────────────────────────────────────────
  fastify.get(
    '/:id',
    {
      schema: { params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
      preHandler: guard,
    },
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const ev = await dbGet<CalendarEvent>(`${ROOT}/${req.params.id}`);
        if (!ev) return reply.status(404).send({ error: 'Event not found.' });
        return reply.status(200).send({ ...ev, id: req.params.id });
      } catch (err) {
        req.log.error({ err }, 'Failed to fetch calendar event');
        return reply.status(500).send({ error: 'Could not load event.' });
      }
    },
  );

  // ── POST /api/calendar ───────────────────────────────────────────────────────
  fastify.post(
    '/',
    {
      schema: calendarEventSchema,
      preHandler: guard,
    },
    async (req: FastifyRequest<{ Body: NewEvent }>, reply: FastifyReply) => {
      try {
        const newEvent: Omit<CalendarEvent, 'id'> = {
          ...req.body,
          createdAt: new Date().toISOString(),
        };
        const id = await dbPush(ROOT, newEvent);
        // Store the id inside the record too for convenience
        await dbUpdate(`${ROOT}/${id}`, { id });
        return reply.status(201).send({ id, ...newEvent });
      } catch (err) {
        req.log.error({ err }, 'Failed to create calendar event');
        return reply.status(500).send({ error: 'Could not create event.' });
      }
    },
  );

  // ── PATCH /api/calendar/:id ──────────────────────────────────────────────────
  fastify.patch(
    '/:id',
    {
      schema: {
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            title:       { type: 'string', minLength: 1, maxLength: 200 },
            date:        { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
            time:        { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
            description: { type: 'string', maxLength: 1000 },
          },
        },
      },
      preHandler: guard,
    },
    async (
      req: FastifyRequest<{ Params: { id: string }; Body: Partial<NewEvent> }>,
      reply: FastifyReply,
    ) => {
      try {
        const existing = await dbGet<CalendarEvent>(`${ROOT}/${req.params.id}`);
        if (!existing) return reply.status(404).send({ error: 'Event not found.' });

        await dbUpdate(`${ROOT}/${req.params.id}`, req.body as Record<string, unknown>);
        return reply.status(204).send();
      } catch (err) {
        req.log.error({ err }, 'Failed to update calendar event');
        return reply.status(500).send({ error: 'Could not update event.' });
      }
    },
  );

  // ── DELETE /api/calendar/:id ─────────────────────────────────────────────────
  fastify.delete(
    '/:id',
    {
      schema: { params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
      preHandler: guard,
    },
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const existing = await dbGet(`${ROOT}/${req.params.id}`);
        if (!existing) return reply.status(404).send({ error: 'Event not found.' });

        await dbRemove(`${ROOT}/${req.params.id}`);
        return reply.status(204).send();
      } catch (err) {
        req.log.error({ err }, 'Failed to delete calendar event');
        return reply.status(500).send({ error: 'Could not delete event.' });
      }
    },
  );
}
