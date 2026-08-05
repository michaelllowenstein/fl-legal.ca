/**
 * routes/content.ts
 *
 * GET   /api/content              — full siteContent tree (public)
 * GET   /api/content/:section     — one section: home | aboutUs | areasOfLaw | faq | pricing
 * PATCH /api/content              — update one field (editor JWT required)
 *
 * ── Firebase schema (under public/siteContent/) ──────────────────────────────
 *
 *   home: {
 *     id, page, header, subheader, intro, footer,
 *     bulletpoints: string[]
 *   }
 *
 *   aboutUs: {
 *     id, page, header, subheader, intro, footer,
 *     bulletpoints: string[]
 *   }
 *
 *   areasOfLaw: {
 *     id, page, header, subheader, intro, footer,
 *     bulletpoints: string[]
 *   }
 *
 *   faq: {
 *     id, page, header, subheader, intro, footer,
 *     faqs: [ { question: string, answer: string } ]
 *   }
 *
 *   pricing: {
 *     id, page, header, subheader, intro, footer,
 *     sections: [
 *       { id, label, rows: string[] }
 *     ]
 *   }
 *
 * ── PATCH body ────────────────────────────────────────────────────────────────
 *   { key: "home/header", value: "New heading text" }
 *   { key: "home/bulletpoints/0", value: "Updated bullet" }
 *   { key: "faq/faqs/0/answer", value: "Updated answer" }
 *   { key: "pricing/sections/0/rows/0", value: "Updated row" }
 *
 * The key is slash-delimited and relative to /public/siteContent/.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { dbGet, dbMultiUpdate } from '../services/firebase';
import { contentPatchSchema } from '@schema';

const ROOT = 'siteContent';

const VALID_SECTIONS = new Set(['home', 'aboutUs', 'areasOfLaw', 'pricing', 'faq']);

// ── Types matching the exact Firebase schema ──────────────────────────────────

interface FaqItem {
  question: string;
  answer:   string;
}
 
interface PricingSection {
  id?:    string;
  label:  string;
  rows:   string[];
}
 
interface SiteSection {
  id:            string;
  page:          string;
  header:        string;
  subheader:     string;
  intro:         string;
  footer:        string;
  bulletpoints?: string[];
  faqs?:         FaqItem[];
  sections?:     PricingSection[];
}

// ─────────────────────────────────────────────────────────────────────────────

export async function contentRoutes(fastify: FastifyInstance): Promise<void> {
 
  // ── GET /api/content ────────────────────────────────────────────────────────
  fastify.get(
    '/',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const data = await dbGet<Record<string, SiteSection>>(ROOT);
        reply.header('Cache-Control', 'public, max-age=5, stale-while-revalidate=30');
        return reply.status(200).send(data ?? {});
      } catch (err) {
        req.log.error({ err }, 'Failed to fetch site content');
        return reply.status(500).send({ error: 'Could not load content.' });
      }
    },
  );
 
  // ── GET /api/content/:section ───────────────────────────────────────────────
  fastify.get(
    '/:section',
    {
      schema: {
        params: {
          type:       'object',
          required:   ['section'],
          properties: { section: { type: 'string', maxLength: 80 } },
        },
      },
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    },
    async (
      req:   FastifyRequest<{ Params: { section: string } }>,
      reply: FastifyReply,
    ) => {
      const { section } = req.params;
 
      if (!VALID_SECTIONS.has(section)) {
        return reply.status(404).send({
          error: `Unknown section '${section}'. Valid: ${[...VALID_SECTIONS].join(', ')}`,
        });
      }
 
      try {
        const data = await dbGet<SiteSection>(`${ROOT}/${section}`);
        if (data === null) {
          return reply.status(404).send({ error: `Section '${section}' not found.` });
        }
        reply.header('Cache-Control', 'public, max-age=5, stale-while-revalidate=30');
        return reply.status(200).send(data);
      } catch (err) {
        req.log.error({ err }, 'Failed to fetch content section', { section });
        return reply.status(500).send({ error: 'Could not load content.' });
      }
    },
  );

 
  // ── PATCH /api/content ─────────────────────────────────────────────────────
  //
  // Supports updates to any scalar or array element in the siteContent tree.
  // Key examples:
  //   home/header                  → sets the header string
  //   home/bulletpoints/0          → sets the first bullet
  //   faq/faqs/0/answer            → sets first FAQ answer
  //   pricing/sections/2/rows/1    → sets a pricing row
  //
  // Arrays stored in Firebase as objects with numeric keys (0, 1, 2…).
  // Firebase's update() handles both object and array paths correctly when
  // using slash-separated keys.
  fastify.patch(
    '/',
    {
      schema: {
        body: {
          type:                 'object',
          required:             ['key', 'value'],
          additionalProperties: false,
          properties: {
            key:   { type: 'string', minLength: 1, maxLength: 500 },
            value: { type: 'string', maxLength: 200000 },
          },
        },
      },
      preHandler: [(fastify as any).verifyEditor],
      config:     { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (
      req:   FastifyRequest<{ Body: { key: string; value: string } }>,
      reply: FastifyReply,
    ) => {
      const { key, value } = req.body;
 
      // Sanitise: prevent path traversal and empty paths
      const safePath = key.replace(/\.\./g, '').replace(/^\/+/, '').trim();
      if (!safePath) {
        return reply.status(400).send({ error: 'Invalid content key.' });
      }
 
      // Ensure the first segment is a known section
      const topSection = safePath.split('/')[0];
      if (!VALID_SECTIONS.has(topSection)) {
        return reply.status(400).send({
          error: `Invalid section '${topSection}'. Must start with one of: ${[...VALID_SECTIONS].join(', ')}`,
        });
      }
 
      try {
        // Use a multi-path atomic update so the audit entry and the content
        // write either both succeed or both fail.
        const auditKey = `audit/content/${Date.now()}`;
        await dbMultiUpdate({
          [`public/${ROOT}/${safePath}`]: value,
          [`public/${auditKey}`]: {
            key:   safePath,
            value: value.length > 200 ? value.slice(0, 200) + '…' : value,
            at:    new Date().toISOString(),
          },
        });
 
        req.log.info({ key: safePath }, 'Content field updated');
        return reply.status(204).send();
      } catch (err) {
        req.log.error({ err, key: safePath }, 'Failed to update content');
        return reply.status(500).send({ error: 'Could not save content.' });
      }
    },
  );
}