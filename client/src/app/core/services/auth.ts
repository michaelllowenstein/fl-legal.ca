//
// Extended from the original lawyer-only AuthService.
//
// Changes:
//   - JWT payload is decoded on set and stored as a `currentUser()` signal
//     (no library needed — base64url decode of the middle segment)
//   - currentUser() returns AuthUser | null, typed to cover all roles
//   - role(), uid(), isLawyer(), isEditor() convenience accessors added
//   - tokenExpired() check added; used on construction to clear stale localStorage entries
//   - EditorAuthService login result can be absorbed via absorbEditorToken() so a single
//     inject(AuthService) covers both roles in components like NotificationService
 
import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { env } from '@env/environment';
import { LoggerService } from './logger';
 
// ── JWT payload shapes (mirror api/plugins/auth.ts) ──────────────────────────
 
export interface LawyerTokenPayload {
  role: 'lawyer';
  uid: string;
  email?: string;
  displayName?: string;
  iat: number;
  exp: number;
}
 
export interface EditorTokenPayload {
  role: 'editor';
  id?: string;          // editor identifier, if present in the JWT
  iat: number;
  exp: number;
}

export interface CalcTokenPayload {
  role: 'calc';
  id?: string;          // calc-config editor identifier, if present in the JWT
  iat: number;
  exp: number;
}
 
export type TokenPayload = LawyerTokenPayload | EditorTokenPayload | CalcTokenPayload;
 
// ── Public user model exposed to consumers ────────────────────────────────────
 
export interface AuthUser {
  role: 'lawyer' | 'editor' | 'calc';
  /** Firebase UID for lawyers; editor/calc ID for password-backed roles */
  uid: string;
  email?: string;
  displayName?: string;
  /** Unix timestamp (seconds) when the token expires */
  exp: number;
}
 
// ── Storage keys ──────────────────────────────────────────────────────────────
 
const LAWYER_TOKEN_KEY = 'friclowenstein_token';
const EDITOR_TOKEN_KEY = 'friclowenstein_editor_token';
const CALC_TOKEN_KEY = 'friclowenstein_calc_token';
 
// ── Helpers ───────────────────────────────────────────────────────────────────
 
/** Decode a JWT without verifying the signature (verification is server-side). */
function decodeJwt(token: string): TokenPayload | null {
  try {
    const segment = token.split('.')[1];
    if (!segment) return null;
 
    // Base64url → base64 → decode
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '='));
    return JSON.parse(json) as TokenPayload;
  } catch {
    return null;
  }
}
 
function isExpired(payload: TokenPayload): boolean {
  return payload.exp < Math.floor(Date.now() / 1000);
}
 
function payloadToUser(payload: TokenPayload): AuthUser {
  if (payload.role === 'lawyer') {
    return {
      role: 'lawyer',
      uid: payload.uid,
      email: payload.email,
      displayName: (payload as LawyerTokenPayload).displayName,
      exp: payload.exp,
    };
  }
  if (payload.role === 'calc') {
    return {
      role: 'calc',
      uid: (payload as CalcTokenPayload).id ?? 'calc',
      exp: payload.exp,
    };
  }
  return {
    role: 'editor',
    uid: (payload as EditorTokenPayload).id ?? 'editor',
    exp: payload.exp,
  };
}
 
function safeGetItem(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}
 
function safeSetItem(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}
 
function safeRemoveItem(key: string): void {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}
 
// ── Service ───────────────────────────────────────────────────────────────────
 
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly log  = inject(LoggerService).child('auth');
 
  // Raw JWT strings — one per role. A session may have both (unlikely but supported).
  private readonly _lawyerToken = signal<string | null>(null);
  private readonly _editorToken = signal<string | null>(null);
  private readonly _calcToken = signal<string | null>(null);
 
  // Decoded user — derived from whichever token is active.
  // Lawyer takes precedence if somehow both are present.
  private readonly _user = signal<AuthUser | null>(null);
 
  // ── Public signals & computed ─────────────────────────────────────────────
 
  /** The currently authenticated user, or null if unauthenticated. */
  readonly currentUser = this._user.asReadonly();
 
  /** Convenience: current role string, or null. */
  readonly role = computed(() => this._user()?.role ?? null);
 
  /** True when authenticated as a lawyer. */
  readonly isLawyer = computed(() => this._user()?.role === 'lawyer');
 
  /** True when authenticated as an editor (secretary). */
  readonly isEditor = computed(() => this._user()?.role === 'editor');

  /** True when authenticated for calculator configuration edits. */
  readonly isCalc = computed(() => this._user()?.role === 'calc');
 
  /** True when any valid session is active. */
  readonly isAuthenticated = computed(() => this._user() !== null);
 
  // ── Constructor — restore from localStorage ───────────────────────────────
 
  constructor() {
    this._restoreSession();
  }
 
  // ── Token accessors (for HttpInterceptor) ─────────────────────────────────
 
  /** Raw JWT for the active session. Prefers lawyer token if both present. */
  token(): string | null {
    return this._lawyerToken() ?? this._editorToken() ?? this._calcToken();
  }
 
  lawyerToken(): string | null { return this._lawyerToken(); }
  editorToken(): string | null  { return this._editorToken(); }
  calcToken(): string | null    { return this._calcToken(); }
 
  // ── Lawyer login ──────────────────────────────────────────────────────────
 
  async login(username: string, password: string): Promise<void> {
    const t0 = performance.now();
    this.log.info('Lawyer login attempt', { username });
 
    try {
      const res = await firstValueFrom(
        this.http.post<{ token: string }>(
          `${env.apiURL}/api/auth/lawyer/password`,
          { username, password },
        )
      );
      const ms = Math.round(performance.now() - t0);
      this._setLawyerToken(res.token);
      this.log.info('Lawyer login successful', { username, ms });
    } catch (e: unknown) {
      const err = e as HttpErrorResponse;
      const ms  = Math.round(performance.now() - t0);
      if (err?.status === 401) {
        this.log.warn('Lawyer login failed — invalid credentials', { username, ms });
      } else {
        this.log.error('Lawyer login error', { username, ms, status: err?.status, message: err?.message });
      }
      throw e;
    }
  }
 
  // ── Editor login ──────────────────────────────────────────────────────────
 
  async loginAsEditor(password: string): Promise<void> {
    const t0 = performance.now();
    this.log.info('Editor login attempt');
 
    try {
      const res = await firstValueFrom(
        this.http.post<{ token: string }>(
          `${env.apiURL}/api/auth/editor`,
          { password },
        )
      );
      const ms = Math.round(performance.now() - t0);
      this._setEditorToken(res.token);
      this.log.info('Editor login successful', { ms });
    } catch (e: unknown) {
      const err = e as HttpErrorResponse;
      const ms  = Math.round(performance.now() - t0);
      if (err?.status === 401) {
        this.log.warn('Editor login failed — invalid password', { ms });
      } else {
        this.log.error('Editor login error', { ms, status: err?.status, message: err?.message });
      }
      throw e;
    }
  }

  // ── Calculator config login ───────────────────────────────────────────────

  async loginForCalcConfig(password: string): Promise<void> {
    const t0 = performance.now();
    this.log.info('Calculator config login attempt');

    try {
      const res = await firstValueFrom(
        this.http.post<{ token: string }>(
          `${env.apiURL}/api/auth/calc`,
          { password },
        )
      );
      const ms = Math.round(performance.now() - t0);
      this._setCalcToken(res.token);
      this.log.info('Calculator config login successful', { ms });
    } catch (e: unknown) {
      const err = e as HttpErrorResponse;
      const ms  = Math.round(performance.now() - t0);
      if (err?.status === 401) {
        this.log.warn('Calculator config login failed — invalid password', { ms });
      } else {
        this.log.error('Calculator config login error', { ms, status: err?.status, message: err?.message });
      }
      throw e;
    }
  }
 
  /**
   * Absorb a pre-obtained editor token (e.g. from a standalone EditorAuthService
   * during the migration period, or from a dialog component that handles its own login).
   */
  absorbEditorToken(token: string): void {
    this._setEditorToken(token);
  }

  /** Absorb a pre-obtained calculator config token. */
  absorbCalcToken(token: string): void {
    this._setCalcToken(token);
  }
 
  // ── Logout ────────────────────────────────────────────────────────────────
 
  /** Log out the current role. Pass 'all' (default) to clear everything. */
  logout(role: 'lawyer' | 'editor' | 'calc' | 'all' = 'all'): void {
    if (role === 'lawyer' || role === 'all') {
      this._lawyerToken.set(null);
      safeRemoveItem(LAWYER_TOKEN_KEY);
      this.log.info('Lawyer session cleared');
    }
    if (role === 'editor' || role === 'all') {
      this._editorToken.set(null);
      safeRemoveItem(EDITOR_TOKEN_KEY);
      this.log.info('Editor session cleared');
    }
    if (role === 'calc' || role === 'all') {
      this._calcToken.set(null);
      safeRemoveItem(CALC_TOKEN_KEY);
      this.log.info('Calculator config session cleared');
    }
    this._recomputeUser();
  }
 
  // ── Token expiry check ────────────────────────────────────────────────────
 
  /** True if the active token is expired (client-side check only). */
  tokenExpired(): boolean {
    const user = this._user();
    if (!user) return false;
    return user.exp < Math.floor(Date.now() / 1000);
  }
 
  // ── Private helpers ───────────────────────────────────────────────────────
 
  private _restoreSession(): void {
    const lawyerRaw = safeGetItem(LAWYER_TOKEN_KEY);
    const editorRaw = safeGetItem(EDITOR_TOKEN_KEY);
    const calcRaw = safeGetItem(CALC_TOKEN_KEY);
    let restored = false;
 
    if (lawyerRaw) {
      const payload = decodeJwt(lawyerRaw);
      if (payload && !isExpired(payload)) {
        this._lawyerToken.set(lawyerRaw);
        restored = true;
        this.log.debug('Restored lawyer session from localStorage');
      } else {
        safeRemoveItem(LAWYER_TOKEN_KEY);
        this.log.debug('Cleared stale lawyer token from localStorage');
      }
    }
 
    if (editorRaw) {
      const payload = decodeJwt(editorRaw);
      if (payload && !isExpired(payload)) {
        this._editorToken.set(editorRaw);
        restored = true;
        this.log.debug('Restored editor session from localStorage');
      } else {
        safeRemoveItem(EDITOR_TOKEN_KEY);
        this.log.debug('Cleared stale editor token from localStorage');
      }
    }

    if (calcRaw) {
      const payload = decodeJwt(calcRaw);
      if (payload && payload.role === 'calc' && !isExpired(payload)) {
        this._calcToken.set(calcRaw);
        restored = true;
        this.log.debug('Restored calculator config session from localStorage');
      } else {
        safeRemoveItem(CALC_TOKEN_KEY);
        this.log.debug('Cleared stale calculator config token from localStorage');
      }
    }
 
    if (restored) this._recomputeUser();
  }
 
  private _setLawyerToken(token: string): void {
    this._lawyerToken.set(token);
    safeSetItem(LAWYER_TOKEN_KEY, token);
    this._recomputeUser();
  }
 
  private _setEditorToken(token: string): void {
    this._editorToken.set(token);
    safeSetItem(EDITOR_TOKEN_KEY, token);
    this._recomputeUser();
  }

  private _setCalcToken(token: string): void {
    this._calcToken.set(token);
    safeSetItem(CALC_TOKEN_KEY, token);
    this._recomputeUser();
  }
 
  /**
   * Recompute _user from whichever token(s) are active.
   * Lawyer takes precedence, followed by editor, then calculator config.
   */
  private _recomputeUser(): void {
    const lawyerRaw = this._lawyerToken();
    if (lawyerRaw) {
      const payload = decodeJwt(lawyerRaw);
      if (payload && !isExpired(payload)) {
        this._user.set(payloadToUser(payload));
        return;
      }
      // Token was set but is already expired — clear it
      this._lawyerToken.set(null);
      safeRemoveItem(LAWYER_TOKEN_KEY);
    }
 
    const editorRaw = this._editorToken();
    if (editorRaw) {
      const payload = decodeJwt(editorRaw);
      if (payload && !isExpired(payload)) {
        this._user.set(payloadToUser(payload));
        return;
      }
      this._editorToken.set(null);
      safeRemoveItem(EDITOR_TOKEN_KEY);
    }

    const calcRaw = this._calcToken();
    if (calcRaw) {
      const payload = decodeJwt(calcRaw);
      if (payload && payload.role === 'calc' && !isExpired(payload)) {
        this._user.set(payloadToUser(payload));
        return;
      }
      this._calcToken.set(null);
      safeRemoveItem(CALC_TOKEN_KEY);
    }
 
    this._user.set(null);
  }
}
