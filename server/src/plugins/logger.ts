/**
 * plugins/logger.plugin.ts
 *
 * Augments Fastify's built-in pino logger with:
 *   • Namespaced child loggers   — logger.child('auth')
 *   • Per-request correlation ID — X-Request-Id header or auto-generated uuid
 *   • Optional Firebase drain    — errors/criticals written to /logs/api/{date}/{id}
 *   • Configurable log levels    — set LOG_LEVEL in .env (trace|debug|info|warn|error)
 *   • Request/response timing    — onRequest + onResponse hooks
 *   • Sensitive field redaction  — password, token, authorization stripped from logs
 *
 * Usage in a route handler:
 *   fastify.get('/example', async (req, reply) => {
 *     req.log.info({ userId: '123' }, 'Fetched user');          // pino built-in
 *     req.flLog.debug('auth', 'Token validated', { uid });      // namespaced
 *     req.flLog.error('db', 'Firebase write failed', { path }); // goes to Firebase
 *   });
 */

import fp from 'fastify-plugin';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import { db } from '../services/firebase';
import { config } from '../config';
 
// ── Types ─────────────────────────────────────────────────────────────────────
 
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
 
export interface FlLogEntry {
  level:     LogLevel;
  ns:        string;        // namespace, e.g. 'auth', 'content', 'calendar'
  message:   string;
  data?:     Record<string, unknown>;
  requestId?: string;
  ts:        string;        // ISO timestamp
  env:       string;
}
 
export interface FlLogger {
  trace(ns: string, msg: string, data?: Record<string, unknown>): void;
  debug(ns: string, msg: string, data?: Record<string, unknown>): void;
  info (ns: string, msg: string, data?: Record<string, unknown>): void;
  warn (ns: string, msg: string, data?: Record<string, unknown>): void;
  error(ns: string, msg: string, data?: Record<string, unknown>): void;
  fatal(ns: string, msg: string, data?: Record<string, unknown>): void;
}
 
// ── Level ordering ─────────────────────────────────────────────────────────────
const LEVELS: Record<LogLevel, number> = {
  trace: 0, debug: 1, info: 2, warn: 3, error: 4, fatal: 5,
};
 
// ── Redact sensitive keys before logging ──────────────────────────────────────
const REDACT_KEYS = new Set(['password', 'token', 'authorization', 'secret', 'privateKey', 'hash']);
 
function redact(data?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!data) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    out[k] = REDACT_KEYS.has(k.toLowerCase()) ? '[redacted]' : v;
  }
  return out;
}
 
// ── Firebase drain (async, fire-and-forget — never blocks the request) ────────
async function drainToFirebase(entry: FlLogEntry) {
  try {
    const date = entry.ts.slice(0, 10); // YYYY-MM-DD
    await db().ref(`logs/api/${date}`).push(entry);
  } catch {
    // Intentionally silent — the drain must never cause log spam
  }
}
 
// ── Logger factory ─────────────────────────────────────────────────────────────
 
const configuredLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) ?? 'info';
 
function makeFlLogger(requestId?: string): FlLogger {
  function log(level: LogLevel, ns: string, message: string, data?: Record<string, unknown>) {
    if (LEVELS[level] < LEVELS[configuredLevel]) return;
 
    const entry: FlLogEntry = {
      level,
      ns,
      message,
      data:      redact(data),
      requestId,
      ts:        new Date().toISOString(),
      env:       config.nodeEnv,
    };
 
    // Always write to pino (stdout in dev, JSON in prod)
    const pinoFn = level === 'fatal' ? 'error' : level;
    console[pinoFn === 'trace' || pinoFn === 'debug' ? 'debug' : pinoFn](
      JSON.stringify({ '[fl]': true, ...entry })
    );
 
    // Persist errors and fatals to Firebase for remote inspection
    if (LEVELS[level] >= LEVELS['error'] && config.isDev === false) {
      drainToFirebase(entry);
    }
  }
 
  return {
    trace: (ns, msg, d) => log('trace', ns, msg, d),
    debug: (ns, msg, d) => log('debug', ns, msg, d),
    info:  (ns, msg, d) => log('info',  ns, msg, d),
    warn:  (ns, msg, d) => log('warn',  ns, msg, d),
    error: (ns, msg, d) => log('error', ns, msg, d),
    fatal: (ns, msg, d) => log('fatal', ns, msg, d),
  };
}
 
// ── Fastify plugin ─────────────────────────────────────────────────────────────
 
declare module 'fastify' {
  interface FastifyRequest {
    flLog:     FlLogger;
    requestId: string;
  }
}
 
async function loggerPlugin(fastify: FastifyInstance) {

  fastify.addHook('onRequest', async (req: FastifyRequest) => {
    const id = (req.headers['x-request-id'] as string) ?? randomUUID();
    (req as any).requestId = id;
    (req as any).flLog     = makeFlLogger(id);
    (req as any).log       = req.log.child({ requestId: id });

    if (req.url === '/health') return;
    req.flLog.info('http', `→ ${req.method} ${req.url}`, {
        ip:        req.ip,
        userAgent: req.headers['user-agent'],
    });
  });
 
  // Log every response with timing
  fastify.addHook('onResponse', async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.url === '/health') return;
    const ms  = reply.elapsedTime.toFixed(1);
    const lvl = reply.statusCode >= 500 ? 'error'
              : reply.statusCode >= 400 ? 'warn'
              : 'info';
    req.flLog[lvl]('http', `← ${reply.statusCode} ${req.method} ${req.url} (${ms}ms)`);
  });
 
  // Expose a module-level logger for use outside request context (e.g. startup)
  fastify.decorate('flLog', makeFlLogger());
}
 
export default fp(loggerPlugin, { name: 'fl-logger' });
 
// ── Standalone logger for use outside Fastify (services, seed script, etc.) ────
export const flLog = makeFlLogger();