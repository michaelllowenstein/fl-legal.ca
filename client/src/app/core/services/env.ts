// A typed, injectable wrapper around the environment files.
// Drop-in replacement for direct `import { env } from '...environments/environment'` usage.
//
// MIGRATION — find and replace across the codebase:
//   Before:  import { env } from '../../../environments/environment';
//            ...
//            private readonly base = env.apiUrl;
//            const key = env.mapsEmbedApiKey;
//
//   After:   private readonly env = inject(EnvService);
//            ...
//            private readonly base = this.env.apiURL;
//            const key = this.env.mapsEmbedApiKey;
//
// NOTE: The property is exposed as `apiURL` (uppercase URL) to match the
// established convention used in the notification service and project memory.
// The raw environment files use `apiUrl` — this service normalises that.
 
import { Injectable } from '@angular/core';
import { env } from '../../../environments/environment';
 
export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  databaseURL: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}
 
export interface MapsConfig {
  pointOfInterest: string;
  latitude: number;
  longitude: number;
}
 
@Injectable({ providedIn: 'root' })
export class EnvService {
  // ── API ────────────────────────────────────────────────────────────────────
 
  /**
   * Base URL for all API requests. Never contains a trailing slash or /api segment.
   *
   *   Production:  '' (same-origin; Vercel routes /api/* to the serverless function)
   *   Local dev:   'https://localhost:8443'
   *
   * Usage:  `${this.env.apiURL}/api/content/home`
   */
  readonly apiURL: string = env.apiURL;
 
  // ── Environment flags ──────────────────────────────────────────────────────
 
  readonly production: boolean = env.production;
 
  // ── Firebase ───────────────────────────────────────────────────────────────
 
  readonly firebase: Readonly<FirebaseConfig> = Object.freeze({ ...env.firebase });
 
  // ── Maps ───────────────────────────────────────────────────────────────────
 
  /**
   * Google Maps Embed API key.
   * Empty string in dev if not set — triggers the OpenStreetMap fallback
   * in ContactUsPage.
   */
  readonly mapsEmbedApiKey: string = env.mapsEmbedApiKey ?? '';
 
  readonly maps: Readonly<MapsConfig> = Object.freeze({ ...env.maps });
 
  // ── Convenience helpers ────────────────────────────────────────────────────
 
  /**
   * Builds a full API URL from a path segment.
   * The path must begin with /api/.
   *
   * @example
   *   this.env.api('/api/content/home')
   *   // dev  → 'https://localhost:8443/api/content/home'
   *   // prod → '/api/content/home'
   */
  api(path: string): string {
    if (!path.startsWith('/api/') && path !== '/api') {
      console.warn(`[EnvService] api() called with a path that does not start with /api/: "${path}"`);
    }
    return `${this.apiURL}${path}`;
  }
 
  /**
   * Returns true when running in a browser context.
   * Guards against SSR / prerender environments where window/sessionStorage are unavailable.
   */
  get isBrowser(): boolean {
    return typeof window !== 'undefined';
  }
}