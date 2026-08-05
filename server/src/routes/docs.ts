/**
 * routes/docs.ts
 *
 * Serves the static HTML API reference at GET /api/docs.
 *
 * In production, access is gated behind a DOCS_SECRET header check
 * (set DOCS_SECRET in Vercel env vars). Remove the guard block to
 * expose docs publicly.
 *
 * The HTML file (docs.html) lives alongside this file in the routes/
 * directory and is read once per cold start, then cached in memory
 * across warm Vercel invocations.
 */
 
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';

// ── Read + cache the HTML on cold start ────────────────────────────────────────
const docsHtmlPath = path.resolve(__dirname, 'docs.html');
let cachedHtml: string | null = null;
 
function getDocsHtml(): string {
  if (!cachedHtml) {
    cachedHtml = fs.readFileSync(docsHtmlPath, 'utf8');
  }
  return cachedHtml;
}
 
export async function docsRoutes(fastify: FastifyInstance): Promise<void> {
 
  fastify.get(
    '/docs',
    {
      schema: {
        // Hide from any auto-generated spec (if Option A is also present)
        hide: true,
      },
    },
    async (req: FastifyRequest, reply: FastifyReply) => {
 
      // ── Production gate (optional) ──────────────────────────────────────
      // Comment out this block to make docs publicly accessible in production.
      if (config.isProd) {
        const secret = process.env.DOCS_SECRET;
        if (secret && req.headers['x-docs-access'] !== secret) {
          return reply.status(404).send({ error: 'Not found.' });
        }
      }
 
      return reply
        .status(200)
        .header('Content-Type', 'text/html; charset=utf-8')
        .header('Cache-Control', 'no-store')   // always fresh — no CDN caching
        .send(getDocsHtml());
    },
  );
}