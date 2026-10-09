import {
  Injectable, inject, signal, Signal,
  WritableSignal,
} from '@angular/core';
import {
  Database, ref, get, set, update,
  onValue, off, child, query, orderByChild,
} from '@angular/fire/database';
import {
  DB_ROOT, CONTENT_ROOT, BLOG_ROOT,
  PROFILES_ROOT, NAV_MEMBERS_PATH,
} from '@app/schema/constants';
import {
  Profile,
  BlogPost,
  SiteContent,
  SiteSection,
  ContentSection,
  Article,
  BlogArticle,
} from '@schema/models';
import {
  SNAPSHOT_META, snapshotSection, snapshotBlog,
  snapshotProfiles, snapshotNavMembers,
} from '@schema/snapshot';

/**
 * How long to wait on Firebase before serving the bundled snapshot instead.
 * The RTDB SDK can wait indefinitely for a connection that never comes
 * (deleted project, blocked network), which would leave pages on a spinner.
 */
export const FIREBASE_READ_TIMEOUT_MS = 5000;

/** Shorter timeout once this session has already fallen back to the snapshot. */
const FIREBASE_DEGRADED_TIMEOUT_MS = 1500;

/** Where the content currently on screen came from. */
export type ContentSource = 'live' | 'snapshot';

class FirebaseTimeoutError extends Error {
  constructor(path: string, ms: number) {
    super(`Firebase read timed out after ${ms}ms: ${path}`);
  }
}

/** Race a Firebase read against a timeout. */
function withTimeout<T>(promise: Promise<T>, path: string, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new FirebaseTimeoutError(path, ms)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

@Injectable({ providedIn: 'root' })
export class SiteService {
  private db = inject(Database);

  // ── In-memory caches ────────────────────────────────────────────────────────

  /** Raw siteContent cache — keyed by section name */
  private contentCache = new Map<string, SiteSection>();

  /** Reactive signals — one per section, created on first access */
  private contentSignals = new Map<string, WritableSignal<SiteSection | null>>();

  /** Blog post list cache */
  private blogListCache: BlogPost[] | null = null;

  /** Blog post detail cache — keyed by post id */
  private blogDetailCache = new Map<string, BlogPost>();

  /** Profile list cache */
  private profileCache: Profile[] | null = null;

  /** Active realtime subscriptions — stored so they can be unsubscribed */
  private subscriptions = new Map<string, () => void>();

  /**
   * 'snapshot' once any read has fallen back to the bundled copy.
   * Flips back to 'live' when a realtime listener delivers fresh data.
   * Useful for an editor banner ("Live database unavailable — showing
   * content from <date>") and for diagnostics.
   */
  private readonly _source = signal<ContentSource>('live');
  readonly source = this._source.asReadonly();
  readonly snapshotTakenAt = SNAPSHOT_META.generatedAt;

  private warnedFallback = false;

  /** Race a read against the current timeout (shorter once Firebase has failed). */
  private live<T>(promise: Promise<T>, path: string): Promise<T> {
    const ms = this._source() === 'snapshot' ? FIREBASE_DEGRADED_TIMEOUT_MS : FIREBASE_READ_TIMEOUT_MS;
    return withTimeout(promise, path, ms);
  }

  /** Record that a read was served from the snapshot (warns once per session). */
  private usingSnapshot(what: string, reason: unknown): void {
    this._source.set('snapshot');
    if (!this.warnedFallback) {
      this.warnedFallback = true;
      console.warn(
        `[SiteService] Firebase unavailable — serving bundled snapshot ` +
        `(${SNAPSHOT_META.source}, ${SNAPSHOT_META.generatedAt}). First failure: ${what}`,
        reason,
      );
    }
  }


  // ── siteContent ─────────────────────────────────────────────────────────────

  /**
   * Fetch a siteContent section. Returns from cache on subsequent calls.
   * Sections: 'home' | 'aboutUs' | 'areasOfLaw' | 'faq' | 'pricing'
   */
  async getSection(section: string): Promise<SiteSection | null> {
    // Cache hit — return immediately without touching Firebase
    if (this.contentCache.has(section)) {
      return this.contentCache.get(section)!;
    }

    const path = `${CONTENT_ROOT}/${section}`;
    let data: SiteSection | null = null;

    try {
      const snapshot = await this.live(get(ref(this.db, path)), path);
      if (snapshot.exists()) data = snapshot.val() as SiteSection;
      else this.usingSnapshot(`getSection(${section})`, 'node missing');
    } catch (err) {
      this.usingSnapshot(`getSection(${section})`, err);
    }

    // Fallback — bundled snapshot of the last known Firebase content
    data ??= snapshotSection(section);
    if (!data) return null;

    this.contentCache.set(section, data);

    // Update reactive signal if one exists for this section
    this.contentSignals.get(section)?.set(data);

    return data;
  }

  /**
   * Returns a reactive Signal<SiteSection | null> for the given section.
   * The signal updates whenever watchSection() receives a new value.
   * Creates the signal and triggers a fetch on first call.
   */
  sectionSignal(section: string): Signal<SiteSection | null> {
    if (!this.contentSignals.has(section)) {
      const s = signal<SiteSection | null>(
        this.contentCache.get(section) ?? null
      );
      this.contentSignals.set(section, s);

      // Fetch if not yet cached
      if (!this.contentCache.has(section)) {
        this.getSection(section);
      }
    }
    return this.contentSignals.get(section)!.asReadonly();
  }

  /**
   * Subscribe to realtime updates for a section.
   * The callback fires immediately with the current value, then on every change.
   * Returns an unsubscribe function — call it in ngOnDestroy.
   *
   * Usage:
   *   const unsub = this.site.watchSection('home', data => this.home.set(data));
   *   // in ngOnDestroy: unsub();
   */
  watchSection(
    section: string,
    callback: (data: SiteContent | SiteSection | null) => void,
  ): () => void {
    const dbRef = ref(this.db, `${CONTENT_ROOT}/${section}`);

    const unsubscribe = onValue(dbRef, (snapshot) => {
      const data = snapshot.exists() ? (snapshot.val() as SiteSection) : null;

      if (data) {
        // Keep cache and signal in sync with realtime updates
        this.contentCache.set(section, data);
        this.contentSignals.get(section)?.set(data);
        this._source.set('live');
        callback(data);
        return;
      }

      // Node deleted/missing — keep showing the snapshot rather than blanking
      // the page. Callers already ignore null, so only pass real data on.
      const fallback = snapshotSection(section);
      if (fallback) {
        this.usingSnapshot(`watchSection(${section})`, 'node missing');
        callback(fallback);
      } else {
        callback(null);
      }
    }, (err) => {
      // Listener cancelled (e.g. permission denied). getSection() has already
      // served the snapshot; log and leave the current content on screen.
      this.usingSnapshot(`watchSection(${section})`, err);
    });

    // Store so we can clean up on service destroy
    this.subscriptions.set(`content:${section}`, unsubscribe);

    return unsubscribe;
  }

  /**
   * Write a single field to siteContent.
   * key is slash-delimited relative to /public/siteContent/
   *   e.g. 'home/header', 'faq/faqs/0/answer', 'pricing/sections/2/rows/0'
   *
   * Performs an optimistic cache update so the UI reflects the change
   * instantly, then writes to Firebase in the background.
   */
  async updateField(key: string, value: string): Promise<void> {
    const safePath = key.replace(/\.\./g, '').replace(/^\/+/, '').trim();
    if (!safePath) throw new Error('Invalid content key');

    const section = safePath.split('/')[0];

    // ── Optimistic update ──────────────────────────────────────────────────
    // Update the in-memory cache immediately so bound signals re-render
    // before Firebase round-trip completes (~100–300ms on fast connections).
    const cached = this.contentCache.get(section);
    if (cached) {
      const updated = Object.assign(this.applyPath(cached, safePath.split('/').slice(1), value));
      if (updated) {
        this.contentCache.set(section, updated);
        this.contentSignals.get(section)?.set(updated);
      }
    }

    // ── Firebase write ─────────────────────────────────────────────────────
    // Firebase update() takes an object where keys are slash-delimited paths.
    // This writes only the specific field, not the whole section.
    try {
      await update(ref(this.db, CONTENT_ROOT), {
        [safePath]: value,
      });
    } catch (err) {
      // Rollback optimistic update on failure
      if (cached) {
        this.contentCache.set(section, cached);
        this.contentSignals.get(section)?.set(cached);
      }
      throw err;
    }
  }

  // ── Blog ────────────────────────────────────────────────────────────────────

  /**
   * Fetch all blog posts, sorted by date descending.
   * Content field is excluded from list — fetch individually for full content.
   */
  async getBlogEntries(): Promise<BlogPost[]> {
    if (this.blogListCache !== null) return this.blogListCache;

    let raw: Record<string, Omit<BlogPost, 'id'>> | null = null;

    try {
      const snapshot = await this.live(get(ref(this.db, BLOG_ROOT)), BLOG_ROOT);
      if (snapshot.exists()) raw = snapshot.val() as Record<string, Omit<BlogPost, 'id'>>;
      else this.usingSnapshot('getBlogEntries()', 'node missing');
    } catch (err) {
      this.usingSnapshot('getBlogEntries()', err);
    }

    raw ??= snapshotBlog();

    const posts: BlogPost[] = Object.entries(raw)
      .map(([id, post]) => ({ ...post, id, content: '' }))
      .filter(p => p.title)
      .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));

    this.blogListCache = posts;
    return posts;
  }

  /**
   * Fetch a single blog post by key, including full content.
   * Cached individually — navigating back to a post is instant.
   */
  async getBlogEntry(id: string): Promise<BlogPost | null> {
    if (this.blogDetailCache.has(id)) {
      return this.blogDetailCache.get(id)!;
    }

    const path = `${BLOG_ROOT}/${id}`;
    let raw: Omit<BlogPost, 'id'> | null = null;

    try {
      const snapshot = await this.live(get(ref(this.db, path)), path);
      if (snapshot.exists()) raw = snapshot.val() as Omit<BlogPost, 'id'>;
    } catch (err) {
      this.usingSnapshot(`getBlogEntry(${id})`, err);
    }

    // A post missing from a healthy DB may have been deleted on purpose, but
    // the snapshot only ever holds posts that were published at build time,
    // so serving it is the safer failure mode for a law firm's site.
    raw ??= snapshotBlog()[id] ?? null;
    if (!raw) return null;

    const post = { ...raw, id };
    this.blogDetailCache.set(id, post);
    return post;
  }

  // ── Profiles ────────────────────────────────────────────────────────────────

  /**
   * Fetch all profiles, sorted by nav/members order.
   * Returns cached result on subsequent calls.
   */
  async getProfiles(): Promise<Profile[]> {
    if (this.profileCache !== null) return this.profileCache;

    let profiles: Profile[] = [];
    let members: { value: string; order: number }[] | null = null;

    try {
      const [profilesSnap, navSnap] = await this.live(Promise.all([
        get(ref(this.db, PROFILES_ROOT)),
        get(ref(this.db, NAV_MEMBERS_PATH)),
      ]), PROFILES_ROOT);

      if (profilesSnap.exists()) {
        const raw = profilesSnap.val() as Record<string, Profile>;
        profiles = Object.values(raw).filter(p => p?.id);
      }
      if (navSnap.exists()) members = navSnap.val() as { value: string; order: number }[];
    } catch (err) {
      this.usingSnapshot('getProfiles()', err);
    }

    if (profiles.length === 0) {
      profiles = snapshotProfiles();
      members  = snapshotNavMembers();
    }

    // Sort by nav order if available
    if (members) {
      const orderMap = new Map(members.map(m => [m.value, m.order]));
      profiles.sort((a, b) =>
        (orderMap.get(a.id) ?? 99) - (orderMap.get(b.id) ?? 99)
      );
    }

    this.profileCache = profiles;
    return profiles;
  }

  // ── Cache management ────────────────────────────────────────────────────────

  /** Invalidate a specific section so the next getSection() re-fetches. */
  invalidateSection(section: string): void {
    this.contentCache.delete(section);
    this.contentSignals.get(section)?.set(null);
  }

  /** Invalidate all caches (e.g. after a bulk import). */
  invalidateAll(): void {
    this.contentCache.clear();
    this.blogListCache = null;
    this.blogDetailCache.clear();
    this.profileCache = null;
    this.contentSignals.forEach(s => s.set(null));
  }

  /** Unsubscribe all realtime listeners. Call from AppComponent ngOnDestroy. */
  destroySubscriptions(): void {
    this.subscriptions.forEach(unsub => unsub());
    this.subscriptions.clear();
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  /**
   * Immutably applies a nested path update to a cached section object.
   * path:  ['bulletpoints', '0']
   * value: 'Updated bullet text'
   *
   * Handles both object and array paths as Firebase stores arrays as
   * objects with numeric string keys.
   */
  private applyPath(
    obj: Record<string, unknown>,
    path: string[],
    value: any,
  ): Record<string, any> {
    if (path.length === 0) return obj;

    const [head, ...tail] = path;
    const shallow = Array.isArray(obj) ? [...obj] : { ...obj };

    if (tail.length === 0) {
      // Leaf node — write the value
      (shallow as Record<string, unknown>)[head] = value;
    } else {
      // Recurse into the next level
      const child = (obj as Record<string, unknown>)[head];
      (shallow as Record<string, unknown>)[head] = this.applyPath(
        (child as Record<string, unknown>) ?? {},
        tail,
        value,
      );
    }

    return shallow as Record<string, unknown>;
  }
}