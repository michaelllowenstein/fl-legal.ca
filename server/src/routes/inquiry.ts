/**
 * routes/inquiry.ts
 *
 * POST /api/inquiries          — general appointment request
 * POST /api/inquiries/priority — urgent / priority inquiry (★ PRIORITY subject)
 *
 * Both routes:
 *  - Validate the request body against JSON Schema
 *  - Send a formatted HTML email to the firm's inbox
 *  - Send an auto-confirmation to the client
 *  - Return 204 No Content on success
 *
 * Rate-limited to 5 submissions per IP per 10 minutes to deter spam.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  generalInquirySchema,
  priorityInquirySchema,
} from '@schema';
import {
  sendGeneralInquiry,
  sendPriorityInquiry,
  GeneralInquiryPayload,
  PriorityInquiryPayload,
} from '../services/mailer';

export async function inquiryRoutes(fastify: FastifyInstance): Promise<void> {

  // ── POST /api/inquiries ─────────────────────────────────────────────────────
  fastify.post(
    '/',
    {
      schema: generalInquirySchema,
      config: { rateLimit: { max: 5, timeWindow: '10 minutes' } },
    },
    async (
      req:   FastifyRequest<{ Body: GeneralInquiryPayload }>,
      reply: FastifyReply,
    ) => {
      try {
        await sendGeneralInquiry(req.body);
        return reply.status(204).send();
      } catch (err) {
        req.log.error({ err }, 'Failed to send general inquiry email');
        return reply.status(502).send({ error: 'Failed to send inquiry. Please try again.' });
      }
    },
  );

  // ── POST /api/inquiries/priority ────────────────────────────────────────────
  fastify.post(
    '/priority',
    {
      schema: priorityInquirySchema,
      config: { rateLimit: { max: 5, timeWindow: '10 minutes' } },
    },
    async (
      req:   FastifyRequest<{ Body: PriorityInquiryPayload }>,
      reply: FastifyReply,
    ) => {
      try {
        await sendPriorityInquiry(req.body);
        return reply.status(204).send();
      } catch (err) {
        req.log.error({ err }, 'Failed to send priority inquiry email');
        return reply.status(502).send({ error: 'Failed to send inquiry. Please try again.' });
      }
    },
  );
}