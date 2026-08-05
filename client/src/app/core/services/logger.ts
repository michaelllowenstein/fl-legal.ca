/**
 * logger.service.ts
 *
 * Angular signal-based structured logger for fl-legal-v3.
 *
 * Features:
 *   • Namespaced log calls         — log.debug('auth', 'Token ok', { uid })
 *   • Configurable minimum level   — set via environment.ts logLevel
 *   • In-memory ring buffer        — last 200 entries queryable at runtime
 *   • Optional Firebase drain      — errors written to /logs/client/{sessionId}
 *   • Breadcrumb trail             — ordered list of recent events for crash context
 *   • Angular DevTools compatible  — exposes signal for reactive log inspection
 *   • Global error/unhandledRejection capture
 *
 * Usage:
 *   private log = inject(LoggerService);
 *
 *   this.log.debug('content', 'Section loaded', { section: 'home' });
 *   this.log.warn('auth',    'Token expiring soon');
 *   this.log.error('api',    'Request failed', { status: 500, url });
 *
 * View recent logs at runtime (browser console):
 *   window.__flLog.dump()
 *   window.__flLog.filter('error')
 *   window.__flLog.filter('auth')     // filter by namespace
 */

import {
  Injectable, inject, signal, isDevMode, OnDestroy,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { env } from '@env/environment';

// ── Types ─────────────────────────────────────────────────────────────────────

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
  level:      LogLevel;
  ns:         string;
  message:    string;
  data?:      Record<string, unknown>;
  ts:         string;
  sessionId:  string;
  url:        string;
}

const LEVEL_RANK: Record<LogLevel, number> = {
  trace: 0, debug: 1, info: 2, warn: 3, error: 4, fatal: 5,
};

const LEVEL_STYLE: Record<LogLevel, string> = {
  trace: 'color:#888',
  debug: 'color:#6b9;font-weight:500',
  info:  'color:#4af;font-weight:500',
  warn:  'color:#fb0;font-weight:600',
  error: 'color:#f55;font-weight:700',
  fatal: 'color:#f00;font-weight:700;text-decoration:underline',
};

const RING_SIZE = 200;

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class LoggerService implements OnDestroy {
  private http: HttpClient      = inject(HttpClient);

  /** Configured minimum level — everything below this is silently dropped */
  private minLevel: LogLevel = (env as any).logLevel ?? (isDevMode() ? 'debug' : 'warn');

  /** Unique session ID — groups all client logs for this browser session */
  readonly sessionId = this.makeSessionId();

  /** Reactive ring buffer — last RING_SIZE entries */
  readonly entries = signal<LogEntry[]>([]);

  /** Reactive breadcrumb trail — last 20 info+ events for crash context */
  readonly breadcrumbs = signal<Pick<LogEntry, 'ns' | 'message' | 'ts'>[]>([]);

  private unloadHandler?: () => void;
  private errorHandler?:  (e: ErrorEvent) => void;
  private rejHandler?:    (e: PromiseRejectionEvent) => void;

  constructor() {
    this.installGlobalHandlers();
    this.exposeDevTools();
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  trace(ns: string, message: string, data?: Record<string, unknown>) { this.write('trace', ns, message, data); }
  debug(ns: string, message: string, data?: Record<string, unknown>) { this.write('debug', ns, message, data); }
  info (ns: string, message: string, data?: Record<string, unknown>) { this.write('info',  ns, message, data); }
  warn (ns: string, message: string, data?: Record<string, unknown>) { this.write('warn',  ns, message, data); }
  error(ns: string, message: string, data?: Record<string, unknown>) { this.write('error', ns, message, data); }
  fatal(ns: string, message: string, data?: Record<string, unknown>) { this.write('fatal', ns, message, data); }

  /** Scoped child logger — pre-fills the namespace */
  child(ns: string) {
    return {
      trace: (msg: string, d?: Record<string, unknown>) => this.trace(ns, msg, d),
      debug: (msg: string, d?: Record<string, unknown>) => this.debug(ns, msg, d),
      info:  (msg: string, d?: Record<string, unknown>) => this.info(ns,  msg, d),
      warn:  (msg: string, d?: Record<string, unknown>) => this.warn(ns,  msg, d),
      error: (msg: string, d?: Record<string, unknown>) => this.error(ns, msg, d),
      fatal: (msg: string, d?: Record<string, unknown>) => this.fatal(ns, msg, d),
    };
  }

  // ── Core write ──────────────────────────────────────────────────────────────

  private write(level: LogLevel, ns: string, message: string, data?: Record<string, unknown>) {
    if (LEVEL_RANK[level] < LEVEL_RANK[this.minLevel]) return;

    const entry: LogEntry = {
      level,
      ns,
      message,
      data,
      ts:        new Date().toISOString(),
      sessionId: this.sessionId,
      url:       window.location.pathname,
    };

    // ── Console output (dev only) ─────────────────────────────────────────
    if (isDevMode()) {
      const prefix = `%c[${level.toUpperCase().padEnd(5)}] [${ns}]`;
      if (data) {
        console.groupCollapsed(prefix, LEVEL_STYLE[level], message);
        console.log(data);
        console.groupEnd();
      } else {
        console.log(prefix, LEVEL_STYLE[level], message);
      }
    }

    // ── Ring buffer ───────────────────────────────────────────────────────
    this.entries.update(prev => {
      const next = [...prev, entry];
      return next.length > RING_SIZE ? next.slice(next.length - RING_SIZE) : next;
    });

    // ── Breadcrumbs (info and above) ──────────────────────────────────────
    if (LEVEL_RANK[level] >= LEVEL_RANK['info']) {
      this.breadcrumbs.update(prev => {
        const next = [...prev, { ns, message, ts: entry.ts }];
        return next.length > 20 ? next.slice(next.length - 20) : next;
      });
    }

    // ── Firebase drain (errors in production) ────────────────────────────
    if (LEVEL_RANK[level] >= LEVEL_RANK['error'] && !isDevMode()) {
      this.drain(entry);
    }
  }

  // ── Firebase drain ──────────────────────────────────────────────────────────

  private drain(entry: LogEntry) {
    const date = entry.ts.slice(0, 10);
    const url  = `${env.apiURL}/api/logs/client`;
    // Fire and forget — we use fetch directly to avoid circular injection
    fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ date, entry }),
      keepalive: true,  // survives page unload
    }).catch(() => { /* intentionally silent */ });
  }

  // ── Global error capture ───────────────────────────────────────────────────

  private installGlobalHandlers() {
    this.errorHandler = (e: ErrorEvent) => {
      this.error('global', e.message, {
        filename: e.filename,
        lineno:   e.lineno,
        colno:    e.colno,
        stack:    e.error?.stack,
      });
    };

    this.rejHandler = (e: PromiseRejectionEvent) => {
      this.error('promise', 'Unhandled rejection', {
        reason: String(e.reason),
        stack:  e.reason?.stack,
      });
    };

    window.addEventListener('error',               this.errorHandler);
    window.addEventListener('unhandledrejection',   this.rejHandler);
  }

  // ── DevTools console API ───────────────────────────────────────────────────

  private exposeDevTools() {
    if (!isDevMode()) return;

    (window as any).__flLog = {
      /** Dump all buffered log entries */
      dump: () => {
        console.table(
          this.entries().map(e => ({
            ts:      e.ts.slice(11, 23),
            level:   e.level,
            ns:      e.ns,
            message: e.message,
          }))
        );
      },
      /** Filter by level or namespace */
      filter: (q: string) => {
        const hits = this.entries().filter(
          e => e.level === q || e.ns === q || e.message.includes(q)
        );
        console.table(hits.map(e => ({ ts: e.ts.slice(11, 23), level: e.level, ns: e.ns, message: e.message })));
        return hits;
      },
      /** Print breadcrumb trail */
      breadcrumbs: () => {
        console.log('Recent breadcrumbs:');
        this.breadcrumbs().forEach(b =>
          console.log(`  ${b.ts.slice(11, 23)}  [${b.ns}]  ${b.message}`)
        );
      },
      /** Change level at runtime without recompiling */
      setLevel: (level: LogLevel) => {
        this.minLevel = level;
        console.info(`Log level set to: ${level}`);
      },
      /** Access the signal directly */
      signal: this.entries,
    };

    console.info(
      '%c[fl-logger] DevTools active — window.__flLog.dump() | .filter(ns) | .breadcrumbs() | .setLevel(level)',
      'color:#4af;font-style:italic;font-size:11px'
    );
  }

  // ── Session ID ─────────────────────────────────────────────────────────────

  private makeSessionId(): string {
    const stored = sessionStorage.getItem('fl_session_id');
    if (stored) return stored;
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem('fl_session_id', id);
    return id;
  }

  ngOnDestroy() {
    if (this.errorHandler) window.removeEventListener('error', this.errorHandler);
    if (this.rejHandler)   window.removeEventListener('unhandledrejection', this.rejHandler);
  }
}
