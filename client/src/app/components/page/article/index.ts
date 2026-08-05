import {
  Component, OnInit, OnDestroy, signal, inject,
  ChangeDetectionStrategy, HostListener, ElementRef, computed,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { pageEnter } from '@animations/page';
import { FLIcon } from '@components/ui/icon';
import { SafeHtmlPipe } from '@core/pipes/safe-html';
import { LoggerService } from '@core/services/logger';
import { SiteService } from '@core/services/site';

@Component({
  selector:    'app-article',
  standalone:  true,
  imports:     [RouterLink, SafeHtmlPipe, FLIcon],
  templateUrl: './index.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations:  [pageEnter],
})
export class ArticlePage implements OnInit, OnDestroy {
  private route: ActivatedRoute          = inject(ActivatedRoute);
  private siteService: SiteService    = inject(SiteService);
  private log            = (inject(LoggerService) as LoggerService).child('article');
 
  entry         = signal<any>(null);
  loading       = signal(true);
  readProgress  = signal(0);
  showScrollTop = signal(false);
 
  // Track whether the user has reached the end of the article (for analytics)
  private _readComplete  = false;
  private _initStart     = performance.now();
  private _articleId     = '';
 
  readTime = computed(() => {
    const content = this.entry()?.content ?? '';
    const words   = content.replace(/<[^>]+>/g, '').split(/\s+/).length;
    return Math.max(1, Math.ceil(words / 200));
  });

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this._articleId = id;
    if (!id) { this.loading.set(false); return; }
    this.log.debug('Article initialising', { id });
    try {
      const data = await this.siteService.getBlogEntry(id);
      if (data) {
        this.entry.set(data);
        this.log.info('Article loaded', { id, title: data.title, readTime: this.readTime() });
      } else {
        this.log.warn('Article not found', { id });
      }
    } finally {
      this.loading.set(false);
    }
  }
 
  ngOnDestroy() {
    if (this.entry() && !this._readComplete) {
      this.log.debug('Article abandoned before completion', {
        id:       this._articleId,
        progress: this.readProgress(),
      });
    }
  }

  @HostListener('window:scroll')
  onScroll() {
    const docH    = document.documentElement.scrollHeight - window.innerHeight;
    const scrolled = window.scrollY;
    const pct     = docH > 0 ? Math.round((scrolled / docH) * 100) : 0;
    this.readProgress.set(pct);
    this.showScrollTop.set(scrolled > 600);
    if (!this._readComplete && pct >= 90) {
      this._readComplete = true;
      this.log.info('Article read to completion', { id: this._articleId });
    }
  }

  scrollTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }

  formatDate(d: string) {
    try {
      return new Date(d).toLocaleDateString('en-CA', {
        year: 'numeric', month: 'long', day: 'numeric',
      });
    } catch { return d; }
  }
}

