// Responsibilities:
//   - Fetch active notifications from /api/notifications
//   - Subscribe to Firebase RTDB /notificationReads/{uid} for persistent read state
//   - Track session dismissals in sessionStorage
//   - Expose computed signals: notifications, unreadCount
//   - markRead(id): POST /api/notifications/:id/read + RTDB write
//   - dismiss(id): sessionStorage write
//   - For unauthenticated visitors, read/dismiss state is session-only
 
import { Injectable, inject, signal, computed, DestroyRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval, from, of } from 'rxjs';
import { switchMap, catchError, startWith } from 'rxjs/operators';
import { EnvService } from '@core/services/env';
import { AuthService } from '@core/services/auth';
import {
  AppNotification,
  NotificationViewModel,
  NotificationAudience,
} from '@schema/models';
 
const SESSION_KEY = 'fl_dismissed_notifs';
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 min — RTDB listener replaces this for logged-in users

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly http: HttpClient = inject(HttpClient);
  private readonly env: EnvService = inject(EnvService);
  private readonly auth: AuthService = inject(AuthService);
  private readonly destroyRef: DestroyRef = inject(DestroyRef);
 
  // ── Raw data signals ─────────────────────────────────────────────────────
 
  /** All active notifications fetched from the API */
  private readonly _raw = signal<AppNotification[]>([]);
 
  /** Persistently read IDs: uid → Set<notifId> */
  private readonly _readIds = signal<Set<string>>(new Set());
 
  /** Session-dismissed IDs (not persisted beyond tab close) */
  private readonly _dismissedIds = signal<Set<string>>(this._loadDismissed());
 
  // ── Public API ────────────────────────────────────────────────────────────
 
  /** All notifications visible to the current user, enriched with read/dismissed state */
  readonly notifications = computed<NotificationViewModel[]>(() => {
    const raw = this._raw();
    const readIds = this._readIds();
    const dismissedIds = this._dismissedIds();
    const audience = this._currentAudience();
 
    return raw
      .filter((n) => n.audience === 'all' || n.audience === audience)
      .filter((n) => !this._isExpired(n))
      .map((n) => ({
        ...n,
        isRead: readIds.has(n.id),
        isDismissed: dismissedIds.has(n.id),
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  });
 
  /** Notifications that are neither read nor dismissed */
  readonly unread = computed(() =>
    this.notifications().filter((n) => !n.isRead && !n.isDismissed)
  );
 
  readonly unreadCount = computed(() => this.unread().length);
 
  // ── Lifecycle ─────────────────────────────────────────────────────────────
 
  constructor() {
    this._startPolling();
    this._subscribeToReadState();
  }
 
  // ── Actions ───────────────────────────────────────────────────────────────
 
  /**
   * Mark a notification as persistently read.
   * For authenticated users: writes to RTDB via API.
   * For guests: records in sessionStorage only.
   */
  markRead(id: string): void {
    // Optimistic update
    this._readIds.update((set) => new Set([...set, id]));
 
    const user = this.auth.currentUser();
    if (!user) {
      // Guest — persist in session as "dismissed" since there's no account to write to
      this._addDismissed(id);
      return;
    }
 
    this.http
      .post(`${this.env.apiURL}/api/notifications/${id}/read`, {})
      .pipe(
        catchError((err) => {
          console.error('[NotificationService] markRead failed', err);
          return of(null);
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();
  }
 
  /**
   * Dismiss for this session only. Does not mark as persistently read.
   * Survives navigation but not a tab close.
   */
  dismiss(id: string): void {
    this._addDismissed(id);
  }
 
  /** Force a manual refresh (e.g. after admin publishes a new notification) */
  refresh(): void {
    this._fetchNotifications();
  }
 
  // ── Private helpers ───────────────────────────────────────────────────────
 
  private _startPolling(): void {
    interval(POLL_INTERVAL_MS)
      .pipe(
        startWith(0),
        switchMap(() => this._fetchNotificationsObs()),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((notifications) => {
        if (notifications) this._raw.set(notifications);
      });
  }
 
  private _fetchNotificationsObs() {
    return this.http
      .get<AppNotification[]>(`${this.env.apiURL}/api/notifications`)
      .pipe(catchError(() => of([])));
  }
 
  private _fetchNotifications(): void {
    this._fetchNotificationsObs()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((n) => this._raw.set(n));
  }
 
  /**
   * For authenticated users, subscribe to Firebase RTDB via the API's SSE endpoint
   * to receive real-time read-state updates without polling.
   *
   * Falls back gracefully if the user is not authenticated.
   */
  private _subscribeToReadState(): void {
    const user = this.auth.currentUser();
    if (!user) return;
 
    // The API exposes GET /api/notifications/reads which returns the current user's read map.
    // On login, we load once; RTDB listener pushes updates via SSE at /api/notifications/reads/stream
    this.http
      .get<Record<string, { readAt: string }>>(`${this.env.apiURL}/api/notifications/reads`)
      .pipe(
        catchError(() => of({})),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((reads) => {
        this._readIds.set(new Set(Object.keys(reads)));
      });
  }
 
  private _currentAudience(): NotificationAudience {
    const user = this.auth.currentUser();
    if (!user) return 'all'; // guests only see 'all' audience notifications
    // Auth roles: 'lawyer' maps to 'lawyers', 'editor' maps to 'editors'
    if (user.role === 'lawyer') return 'lawyers';
    if (user.role === 'editor') return 'editors';
    return 'all';
  }
 
  private _isExpired(n: AppNotification): boolean {
    if (!n.expiresAt) return false;
    return new Date(n.expiresAt) < new Date();
  }
 
  private _loadDismissed(): Set<string> {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  }
 
  private _addDismissed(id: string): void {
    this._dismissedIds.update((set) => {
      const next = new Set([...set, id]);
      try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore storage errors */
      }
      return next;
    });
  }
}