import { Injectable } from '@angular/core';
import { env } from '@env/environment';

// ── Types ─────────────────────────────────────────────────────────────────────

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface DebugConfig {
  /** Master switch — false suppresses everything. */
  enabled: boolean;
  /** Minimum level to emit.  'debug' shows all, 'error' shows only errors. */
  minLevel: LogLevel;
  /** Namespace allowlist.  null = all namespaces pass. */
  namespaces: Set<string> | null;
  /** Print timestamps. */
  timestamps: boolean;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const LEVEL_STYLES: Record<LogLevel, string> = {
  debug: 'color:#8b5cf6',           // purple
  info:  'color:#3b82f6',           // blue
  warn:  'color:#f59e0b',           // amber
  error: 'color:#ef4444;font-weight:bold', // red
};

const NS_STYLE = 'color:#b8932a;font-weight:bold';  // brand gold

// ── LocalStorage key ──────────────────────────────────────────────────────────
//
// Control from the browser console:
//
//   localStorage.setItem('fl-debug', 'true')
//     → enable all namespaces at debug level
//
//   localStorage.setItem('fl-debug', 'CalcConfig,Calculator')
//     → enable only those two namespaces
//
//   localStorage.setItem('fl-debug-level', 'warn')
//     → only show warn + error
//
//   localStorage.setItem('fl-debug-timestamps', 'true')
//     → prepend HH:MM:SS.mmm
//
//   localStorage.removeItem('fl-debug')
//     → disable (production default)

const STORAGE_KEY       = 'fl-debug';
const STORAGE_LEVEL_KEY = 'fl-debug-level';
const STORAGE_TS_KEY    = 'fl-debug-timestamps';

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class DebugService {
  private cfg: DebugConfig;

  constructor() {
    this.cfg = this.readConfig();
  }

  /** Create a namespaced logger. Typical usage:
   *  ```
   *  private log = inject(DebugService).ns('CalcConfig');
   *  this.log.debug('loaded', data);
   *  ```
   */
  ns(namespace: string): DebugLogger {
    return new DebugLogger(namespace, this);
  }

  /** Runtime reconfigure — call from the console via
   *  `ng.getComponent(...)` or a dev-tools hook. */
  reconfigure(): void {
    this.cfg = this.readConfig();
  }

  /** @internal — used by DebugLogger. */
  shouldEmit(namespace: string, level: LogLevel): boolean {
    if (!this.cfg.enabled) return false;
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.cfg.minLevel]) return false;
    if (this.cfg.namespaces && !this.cfg.namespaces.has(namespace)) return false;
    return true;
  }

  /** @internal */
  get timestamps(): boolean { return this.cfg.timestamps; }

  private readConfig(): DebugConfig {
    // In production, off by default unless localStorage explicitly enables
    const raw = this.safeGet(STORAGE_KEY);
    if (!raw) {
      return {
        enabled: !env.production,
        minLevel: 'debug',
        namespaces: null,
        timestamps: false,
      };
    }

    // 'true' → all namespaces
    // 'CalcConfig,Calculator' → only those
    const isAll = raw === 'true' || raw === '*';
    const namespaces = isAll ? null : new Set(raw.split(',').map(s => s.trim()).filter(Boolean));

    const levelRaw = this.safeGet(STORAGE_LEVEL_KEY);
    const minLevel: LogLevel =
      levelRaw && levelRaw in LEVEL_ORDER ? (levelRaw as LogLevel) : 'debug';

    const timestamps = this.safeGet(STORAGE_TS_KEY) === 'true';

    return { enabled: true, minLevel, namespaces, timestamps };
  }

  private safeGet(key: string): string | null {
    try { return localStorage.getItem(key); }
    catch { return null; }
  }
}

// ── Namespaced logger ─────────────────────────────────────────────────────────

export class DebugLogger {
  constructor(
    private readonly namespace: string,
    private readonly svc: DebugService,
  ) {}

  debug(...args: unknown[]): void { this.emit('debug', args); }
  info(...args: unknown[]): void  { this.emit('info', args); }
  warn(...args: unknown[]): void  { this.emit('warn', args); }
  error(...args: unknown[]): void { this.emit('error', args); }

  /** Timed block — returns a function that logs the elapsed ms.
   *  ```
   *  const done = this.log.time('fetchRemote');
   *  await fetch(...);
   *  done();  // → [CalcConfig] fetchRemote 142ms
   *  ```
   */
  time(label: string): () => void {
    if (!this.svc.shouldEmit(this.namespace, 'debug')) return () => {};
    const t0 = performance.now();
    return () => {
      const ms = Math.round(performance.now() - t0);
      this.emit('debug', [`${label} ${ms}ms`]);
    };
  }

  /** Conditional group — opens a console group only if debug is active. */
  group(label: string): void {
    if (this.svc.shouldEmit(this.namespace, 'debug')) {
      console.groupCollapsed(`%c[${this.namespace}]%c ${label}`, NS_STYLE, '');
    }
  }

  groupEnd(): void {
    if (this.svc.shouldEmit(this.namespace, 'debug')) {
      console.groupEnd();
    }
  }

  private emit(level: LogLevel, args: unknown[]): void {
    if (!this.svc.shouldEmit(this.namespace, level)) return;

    const fn = level === 'debug' ? console.debug
             : level === 'info'  ? console.info
             : level === 'warn'  ? console.warn
             : console.error;

    const prefix = this.svc.timestamps
      ? `%c${this.ts()} %c[${this.namespace}]%c`
      : `%c[${this.namespace}]%c`;

    const styles = this.svc.timestamps
      ? ['color:#9ca3af', NS_STYLE, LEVEL_STYLES[level]]
      : [NS_STYLE, LEVEL_STYLES[level]];

    fn(prefix, ...styles, ...args);
  }

  private ts(): string {
    const d = new Date();
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`;
  }
}