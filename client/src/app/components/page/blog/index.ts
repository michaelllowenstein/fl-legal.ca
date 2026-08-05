import {
  Component,
  ChangeDetectionStrategy,
  signal,
  inject,
  OnInit,
  computed
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { LoggerService } from '@core/services/logger';
import { listStagger, pageEnter } from '@animations/page';
import { SiteService } from '@core/services/site';
import { FLIcon } from '@components/ui/icon';
import { SeoService } from '@core/services/seo';
 
export interface BlogEntry {
  id:        string;
  title:     string;
  date:      string;
  excerpt?:  string;
  imageUrl?: string;
  author?:   string;
  category?: string;
}

@Component({
  selector:    'app-blog',
  standalone:  true,
  imports:     [RouterLink, FLIcon],
  templateUrl: './index.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations:  [pageEnter, listStagger],
})
export class BlogPage implements OnInit {
  private seo: SeoService =    inject(SeoService);
  private contentService = inject(SiteService);
  private log            = inject(LoggerService).child('blog');
 
  entries        = signal<BlogEntry[]>([]);
  loading        = signal(true);
  activeCategory = signal<string>('All');

  // ── Fix: computed() not signal<T> = computed() ─────────────────────────
  categories = computed(() => {
    const cats = new Set<string>(['All']);
    this.entries().forEach((e: BlogEntry) => { if (e.category) cats.add(e.category); });
    return [...cats];
  });

  filtered = computed(() => {
    const cat = this.activeCategory();
    return cat === 'All'
      ? this.entries()
      : this.entries().filter((e: BlogEntry) => e.category === cat);
  });
 
  private _initStart = performance.now();

  featured = computed(() => this.filtered()[0] ?? null);
  rest     = computed(() => this.filtered().slice(1));

  async ngOnInit() {
    this.log.debug('Blog initialising');
    try {
      const data = await this.contentService.getBlogEntries();
      this.entries.set(data ?? []);
      this.log.info('Blog ready', { count: data.length });
    } finally {
      this.loading.set(false);
    }
  }

  setCategory(cat: string) {
    this.log.info('Category filter changed', { from: this.activeCategory(), to: cat });
    this.activeCategory.set(cat);
  }

  formatDate(d: string) {
    try {
      return new Date(d).toLocaleDateString('en-CA', {
        year: 'numeric', month: 'long', day: 'numeric',
      });
    } catch { return d; }
  }
}
