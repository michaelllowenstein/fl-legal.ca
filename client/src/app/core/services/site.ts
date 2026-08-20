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

    try {
      const snapshot = await get(ref(this.db, `${CONTENT_ROOT}/${section}`));
      if (!snapshot.exists()) return null;

      const data = snapshot.val() as SiteSection;
      this.contentCache.set(section, data);

      // Update reactive signal if one exists for this section
      this.contentSignals.get(section)?.set(data);

      return data;
    } catch (err) {
      console.error(`[SiteService] getSection(${section}) failed:`, err);
      return null;
    }
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
      }

      callback(data);
    }, (err) => {
      console.error(`[SiteService] watchSection(${section}) error:`, err);
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

    try {
      const snapshot = await get(ref(this.db, BLOG_ROOT));
      if (!snapshot.exists()) return [];

      const raw = snapshot.val() as Record<string, Omit<BlogPost, 'id'>>;

      const posts: BlogPost[] = Object.entries(raw)
        .map(([id, post]) => ({ ...post, id, content: '' }))
        .filter(p => p.title)
        .sort((a, b) => b.date.localeCompare(a.date));

      this.blogListCache = posts;
      return posts;
    } catch (err) {
      console.error('[SiteService] getBlogEntries() failed:', err);
      return [];
    }
  }

  /**
   * Fetch a single blog post by key, including full content.
   * Cached individually — navigating back to a post is instant.
   */
  async getBlogEntry(id: string): Promise<BlogPost | null> {
    if (this.blogDetailCache.has(id)) {
      return this.blogDetailCache.get(id)!;
    }

    try {
      const snapshot = await get(ref(this.db, `${BLOG_ROOT}/${id}`));
      if (!snapshot.exists()) return null;

      const post = { ...snapshot.val() as Omit<BlogPost, 'id'>, id };
      this.blogDetailCache.set(id, post);
      return post;
    } catch (err) {
      console.error(`[SiteService] getBlogEntry(${id}) failed:`, err);
      return null;
    }
  }

  // ── Profiles ────────────────────────────────────────────────────────────────

  /**
   * Fetch all profiles, sorted by nav/members order.
   * Returns cached result on subsequent calls.
   */
  async getProfiles(): Promise<Profile[]> {
    if (this.profileCache !== null) return this.profileCache;

    try {
      const [profilesSnap, navSnap] = await Promise.all([
        get(ref(this.db, PROFILES_ROOT)),
        get(ref(this.db, NAV_MEMBERS_PATH)),
      ]);

      if (!profilesSnap.exists()) return [];

      const raw = profilesSnap.val() as Record<string, Profile>;
      let profiles = Object.values(raw).filter(p => p?.id);

      // Sort by nav order if available
      if (navSnap.exists()) {
        const members = navSnap.val() as { value: string; order: number }[];
        const orderMap = new Map(members.map(m => [m.value, m.order]));
        profiles.sort((a, b) =>
          (orderMap.get(a.id) ?? 99) - (orderMap.get(b.id) ?? 99)
        );
      }

      this.profileCache = profiles;
      return profiles;
    } catch (err) {
      console.error('[SiteService] getProfiles() failed:', err);
      return [];
    }
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

