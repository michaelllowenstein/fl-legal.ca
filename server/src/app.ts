/**
 * src/app.ts — FL Legal API
 *
 * Fastify application.  Route map:
 * 
 * Features:
 *   • HTTPS via cert/local/ (dev) or cert/stage/ (staging) — auto-selected
 *     by NODE_ENV; override with TLS_CERT / TLS_KEY env vars.
 *     Set HTTPS=false to run plain HTTP (e.g. behind a reverse proxy).
 *
 *   • GET /api          — serves public/index.html (API landing page)
 *   • GET /api/docs     — Swagger UI (interactive API docs)

 *
 *   POST   /api/auth/editor              secretary password → editor JWT
 *   POST   /api/auth/calc                calculator password → calc JWT
 *   POST   /api/auth/lawyer              Firebase ID token  → lawyer JWT
 *   POST   /api/auth/lawyer/password     username+password  → lawyer JWT
 *
 *   GET    /api/content                  fetch all site content  (public)
 *   GET    /api/content/:section         fetch one section       (public)
 *   PATCH  /api/content                  update a content field  (editor JWT)
 *
 *   GET    /api/blog                     list blog posts  (public)
 *   GET    /api/blog/:id                 single post      (public)
 *   POST   /api/blog                     create post      (editor JWT)
 *   PATCH  /api/blog/:id                 update post      (editor JWT)
 *   DELETE /api/blog/:id                 delete post      (editor JWT)
 *
 *   POST   /api/inquiries                general appointment request (public)
 *   POST   /api/inquiries/priority       priority inquiry            (public)
 *
 *   GET    /api/calendar                 list events  (lawyer JWT)
 *   GT    /api/calendar/:id             one event    (lawyer JWT)
 *   POST   /api/calendar                 create event (lawyer JWT)
 *   PATCH  /api/calendar/:id             update event (lawyer JWT)
 *   DELETE /api/calendar/:id             delete event (lawyer JWT)
 *
 *   GET    /api/calc-config              fetch calculator config     (public)
 *   PATCH  /api/calc-config              update one config field     (calc JWT)
 *   PUT    /api/calc-config              replace entire config tree  (calc JWT)
 *
 *   GET    /health                       liveness check
 */

import dotenv from 'dotenv';
dotenv.config();

import Fastify, { FastifyInstance, FastifyServerOptions } from 'fastify';

import fs from 'fs';
import path from 'path';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import staticFiles from '@fastify/static';
import rateLimit from '@fastify/rate-limit';
import type { ServerOptions } from 'https';

import { config } from '@config';
import auth from '@plugins/auth';
import { logRoutes } from '@routes/logs';
import { docsRoutes } from '@routes/docs';
import { authRoutes } from '@routes/auth';
import { blogRoutes } from '@routes/blog';
import { profileRoutes } from '@routes/profile';
import { contentRoutes } from '@routes/content';
import { inquiryRoutes } from '@routes/inquiry';
import { calendarRoutes } from '@routes/calendar';
import { calcConfigRoutes } from '@routes/calc-config';
import diagnosticsRoutes from '@routes/diagnostics';
import { initFirebase } from '@services/firebase';

// ─── TLS helper ───────────────────────────────────────────────────────────────
//
// Mirrors the old Express tryLoad() pattern:
//   • Required files (cert, key) throw if absent — fail fast with a clear message.
//   • Optional files (chain, pfx) soft-fail and return undefined.

function tryLoad(filePath: string, label: string): Buffer | undefined {
  if (!filePath) return undefined;
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    console.warn(`[TLS] Optional file not found, skipping: ${resolved} (${label})`);
    return undefined;
  }
  return fs.readFileSync(resolved);
}

function loadTls(): { https: ServerOptions } | Record<string, never> | any {
  if (!config.https.enabled) return {};

  const certPath = path.resolve(config.https.certFile);
  const keyPath = path.resolve(config.https.keyFile);

  if (!fs.existsSync(certPath)) {
    throw new Error(`[TLS] Certificate not found: ${certPath}\n` + `      Set HTTPS=false or correct TLS_CERT in .env`);
  }
  if (!fs.existsSync(keyPath)) {
    throw new Error(`[TLS] Key not found: ${keyPath}\n` + `      Set HTTPS=false or correct TLS_KEY in .env`);
  }

  return {
    https: {
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
      // Optional — only included when the env vars are set and files exist
      ca: tryLoad(config.https.chainFile, 'SSLCHAIN'),
      pfx: tryLoad(config.https.pfxFile, 'SSLPFX'),
    },
  };
}

export async function buildServerlessApi(): Promise<FastifyInstance> {
  return buildApp({
    logger: config.isDev,
  });
}

export async function buildApp(opts?: Partial<FastifyServerOptions>): Promise<FastifyInstance> {
  initFirebase();

  const fastify = Fastify({
    logger: {
      level: config.isDev ? 'debug' : 'info',
      ...(config.isDev
        ? {
            transport: {
              target: 'pino-pretty',
              options: { colorize: true },
            },
          }
        : {}),
    },
    ajv: {
      customOptions: {
        strict: false,
      },
    },
    ...opts,
  });

  fastify.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: {
      policy: 'cross-origin',
    },
  });

  fastify.register(cors, {
    origin: (origin, cb) => {
      if (!origin) {
        return cb(null, true);
      }

      if (config.cors.allowedOrigins.includes(origin)) {
        return cb(null, true);
      }

      if (config.isDev && /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
        return cb(null, true);
      }

      cb(new Error(`Origin '${origin}' not permitted by CORS policy`), false);
    },
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  fastify.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
    keyGenerator: request => {
      const forwardedFor = request.headers['x-forwarded-for'];

      const forwardedIp =
        typeof forwardedFor === 'string'
          ? forwardedFor.split(',')[0]?.trim()
          : forwardedFor?.[0]?.split(',')[0]?.trim();

      return forwardedIp || request.ip;
    },
  });

  fastify.register(auth);

  fastify.get('/api/health', async () => ({
    ok: true,
    env: config.nodeEnv,
    ts: new Date().toISOString(),
  }));

  fastify.register(diagnosticsRoutes, {
    prefix: '/api/diagnostics'
  });

  fastify.register(authRoutes, {
    prefix: '/api/auth',
  });

  fastify.register(profileRoutes, {
    prefix: '/api/profiles',
  });

  fastify.register(contentRoutes, {
    prefix: '/api/content',
  });

  fastify.register(blogRoutes, {
    prefix: '/api/blog',
  });

  fastify.register(inquiryRoutes, {
    prefix: '/api/inquiries',
  });

  fastify.register(calcConfigRoutes, {
    prefix: '/api/calc-config',
  });

  fastify.register(logRoutes, {
    prefix: '/api/logs',
  });

  return fastify;
}

export async function buildApi(): Promise<FastifyInstance> {
  const tlsOptions = loadTls();
  const protocol = config.https.enabled ? 'https' : 'http';

  const fastify = await buildApp(tlsOptions);

  fastify.register(staticFiles, {
    root: path.resolve('public'),
    prefix: '/public/',
    index: false,
  });

  fastify.register(docsRoutes, {
    prefix: '/api/docs',
  });

  fastify.get('/api', async (_request, reply) => {
    const indexPath = path.resolve('public', 'index.html');

    if (!fs.existsSync(indexPath)) {
      return reply.type('text/html').send(fallbackHtml(protocol));
    }

    const html = fs
      .readFileSync(indexPath, 'utf8')
      .replace(/\{\{PORT\}\}/g, String(config.port))
      .replace(/\{\{ENV\}\}/g, config.nodeEnv)
      .replace(/\{\{PROTOCOL\}\}/g, protocol)
      .replace(/\{\{DOCS_URL\}\}/g, `${protocol}://localhost:${config.port}/api/docs`);

    return reply.type('text/html').send(html);
  });

  return fastify;
}

// ─── Fallback landing page (when public/index.html is absent) ─────────────────

function fallbackHtml(protocol: string): string {
  const base = `${protocol}://localhost:${config.port}`;
  const docsUrl = `${base}/api/docs`;
  const healthUrl = `${base}/health`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>FL Legal API — ${config.nodeEnv}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Georgia', serif;
      background: #0f2235;
      color: #f5f0e8;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }
    .card {
      background: #1a3a5c;
      border-radius: 16px;
      padding: 3rem;
      max-width: 540px;
      width: 100%;
      box-shadow: 0 8px 40px rgba(0,0,0,.45);
    }
    .badge {
      display: inline-block;
      background: #b8932a;
      color: #0f2235;
      font-family: sans-serif;
      font-size: .68rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .12em;
      padding: 3px 12px;
      border-radius: 999px;
      margin-bottom: 1.5rem;
    }
    h1 { color: #b8932a; font-size: 1.8rem; font-weight: 600; line-height: 1.2; }
    .sub {
      font-family: sans-serif;
      font-size: .72rem;
      text-transform: uppercase;
      letter-spacing: .14em;
      color: rgba(255,255,255,.35);
      margin: .35rem 0 2rem;
    }
    p {
      font-size: .95rem;
      line-height: 1.75;
      color: rgba(255,255,255,.65);
      margin-bottom: 1rem;
    }
    code {
      background: rgba(0,0,0,.35);
      padding: 1px 7px;
      border-radius: 4px;
      font-size: .88em;
      font-family: monospace;
    }
    .links {
      background: rgba(0,0,0,.25);
      border-radius: 10px;
      padding: 1.25rem 1.5rem;
      margin-top: 1.75rem;
    }
    .links-label {
      font-family: sans-serif;
      font-size: .68rem;
      text-transform: uppercase;
      letter-spacing: .1em;
      color: rgba(255,255,255,.3);
      margin-bottom: .75rem;
    }
    a {
      display: flex;
      align-items: center;
      gap: .5rem;
      color: #b8932a;
      text-decoration: none;
      font-family: sans-serif;
      font-size: .9rem;
      padding: .3rem 0;
      transition: color .15s;
    }
    a:hover { color: #d4ab40; text-decoration: underline; }
    .env-row {
      margin-top: 1.5rem;
      display: flex;
      gap: .75rem;
      flex-wrap: wrap;
    }
    .env-pill {
      font-family: sans-serif;
      font-size: .72rem;
      color: rgba(255,255,255,.45);
      background: rgba(0,0,0,.2);
      border: 1px solid rgba(255,255,255,.08);
      padding: 3px 10px;
      border-radius: 999px;
    }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">${config.nodeEnv}</span>
    <h1>Fric, Lowenstein &amp; Co.</h1>
    <p class="sub">Barristers &amp; Solicitors — REST API</p>

    <p>
      This server provides the backend API for the firm website.
      All API endpoints are prefixed with <code>/api</code>.
    </p>
    <p>
      To replace this page, create <code>public/index.html</code> in the
      project root. Use <code>{{PORT}}</code>, <code>{{ENV}}</code>,
      <code>{{PROTOCOL}}</code> and <code>{{DOCS_URL}}</code> as
      runtime placeholders.
    </p>

    <div class="links">
      <div class="links-label">Quick links</div>
      <a href="${docsUrl}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#b8932a" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
        Swagger API Docs
      </a>
      <a href="${healthUrl}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#b8932a" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        Health check
      </a>
    </div>

    <div class="env-row">
      <span class="env-pill">port&nbsp;${config.port}</span>
      <span class="env-pill">${protocol.toUpperCase()}</span>
      <span class="env-pill">${config.https.enabled ? 'TLS on' : 'TLS off'}</span>
    </div>
  </div>
</body>
</html>`;
}
