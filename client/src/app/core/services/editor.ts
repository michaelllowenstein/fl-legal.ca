import { Injectable, signal, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { env } from '@env/environment';
import { LoggerService } from './logger';

const TOKEN_KEY = 'fl_editor_token';

@Injectable({ providedIn: 'root' })
export class EditorService {
  private http = inject(HttpClient);
 
  // apiUrl is '' in production (same-origin) or 'https://localhost:8443' locally
  // Never append /api to apiUrl — routes already include it
  private readonly base = env.apiURL;
 
  private _token = signal<string | null>(
    typeof sessionStorage !== 'undefined'
      ? sessionStorage.getItem(TOKEN_KEY)
      : null,
  );
 
  isAuthenticated() { return !!this._token(); }
  token()           { return this._token(); }
 
  async login(password: string): Promise<void> {
    const res = await firstValueFrom(
      this.http.post<{ token: string }>(
        `${this.base}/api/auth/editor`,    // ← /api/auth/editor, not /editor/login
        { password },
      )
    );
    this._token.set(res.token);
    sessionStorage.setItem(TOKEN_KEY, res.token);
  }
 
  logout() {
    this._token.set(null);
    sessionStorage.removeItem(TOKEN_KEY);
  }
 
  checkTokenExpiry(): boolean {
    const token = this._token();
    if (!token) return false;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.exp * 1000 <= Date.now()) { this.logout(); return false; }
      return true;
    } catch { return true; }
  }
}
