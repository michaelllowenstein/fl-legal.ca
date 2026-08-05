/**
 * plugins/swagger.ts
 * 
 * Registers @fastify/swagger (OpenAPI Spec 3.0) & 
 * @fastify/swagger-ui (interactives)
 * on the Fastify Resources.
 * 
 * Served at /api/docs
 * Raw Spec: GET /api/docs/json
 *
 * Registration order matters — this plugin must be registered BEFORE
 * any routes so that Fastify can introspect their schemas.
 *
 * Install dependencies:
 *   cd server && npm install @fastify/swagger @fastify/swagger-ui
 * 
 */
 
import fp from 'fastify-plugin';
import { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from '../config';

async function swaggerPlugin(fastify: FastifyInstance): Promise<void> {
 
  // ── 1. OpenAPI spec generation ─────────────────────────────────────────────
  await fastify.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Fric, Lowenstein & Co. LLP — API',
        description: [
          'Internal REST API powering the fl-legal-v3 platform.',
          '',
          '## Authentication',
          'Two JWT bearer schemes are in use:',
          '- **Editor JWT** — issued to the firm secretary via `POST /api/auth/editor` (password-based).',
          '  Grants access to CMS content routes.',
          '- **Lawyer JWT** — issued to lawyers via `POST /api/auth/lawyer` (Firebase ID token exchange)',
          '  or `POST /api/auth/lawyer/password` (username + bcrypt password).',
          '  Grants access to calendar and lawyer-facing routes.',
          '',
          '## Rate Limiting',
          'Auth endpoints are hard rate-limited per IP:',
          '- `/api/auth/editor` and `/api/auth/lawyer/password` — 10 requests / 15 min',
          '- `/api/auth/lawyer` — 20 requests / 5 min',
        ].join('\n'),
        version: '1.0.0',
        contact: {
          name: 'Michael Lowenstein — IT',
          email: 'michael@friclowenstein.com',
        },
      },
      servers: [
        {
          url: config.isProd ? 'https://fl-legal.ca' : 'https://localhost:8228',
          description: config.isProd ? 'Production' : 'Local development',
        },
      ],
      components: {
        securitySchemes: {
          editorAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Editor JWT — obtain via `POST /api/auth/editor`',
          },
          lawyerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Lawyer JWT — obtain via `POST /api/auth/lawyer` or `POST /api/auth/lawyer/password`',
          },
        },
        schemas: {
          // ── Shared error shape ──────────────────────────────────────────
          ErrorResponse: {
            type: 'object',
            properties: {
              error: { type: 'string', example: 'Invalid credentials.' },
            },
          },
          // ── Token response ──────────────────────────────────────────────
          TokenResponse: {
            type: 'object',
            required: ['token'],
            properties: {
              token: {
                type: 'string',
                description: 'Signed JWT. Include as `Authorization: Bearer <token>` on subsequent requests.',
                example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
              },
            },
          },
        },
      },
      tags: [
        { name: 'Auth',     description: 'Token issuance for editor and lawyer roles' },
        { name: 'Content',  description: 'CMS — public site content (editor-protected writes)' },
        { name: 'Calendar', description: 'Lawyer calendar events (lawyer-protected)' },
        { name: 'Inquiry',  description: 'Client inquiry submissions (public)' },
        { name: 'System',   description: 'Health check and diagnostics' },
      ],
    },
  });
 
  // ── 2. Swagger UI ──────────────────────────────────────────────────────────
  await fastify.register(swaggerUi, {
    routePrefix: '/api/docs',
    uiConfig: {
      docExpansion:         'list',      // expand tags, collapse operations
      deepLinking:          true,        // anchor links per operation
      persistAuthorization: true,        // keeps the Bearer token between page reloads
      displayRequestDuration: true,
      filter:               true,        // search bar across operations
      tryItOutEnabled:      false,       // require explicit click — avoids accidental writes
    },
    uiHooks: {
      // Restrict docs to non-production, OR lock behind a header check.
      // Comment out the block below to expose docs in production as well.
      onRequest(req, reply, next) {
        if (config.isProd && req.headers['x-docs-access'] !== process.env.DOCS_SECRET) {
          reply.status(404).send({ error: 'Not found.' });
          return;
        }
        next();
      },
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
  });
}

export default fp(swaggerPlugin, {
    name: 'swagger',
    dependencies: []
});