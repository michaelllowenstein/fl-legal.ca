import {
  Component,
  ChangeDetectionStrategy,
  signal,
  inject,
  OnInit,
  computed,
  DestroyRef
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { pageEnter, accordion } from '@animations/page';
import { FLIcon } from '@components/ui/icon';
import { EditableContentDirective } from '@core/directives/editable-content';
import { SafeHtmlPipe } from '@core/pipes/safe-html';
import { LoggerService } from '@core/services/logger';
import { SiteService } from '@core/services/site';
import { bodyText } from '@schema/utils';
import { FAQ } from '@schema/constants';
import { SeoService } from '@core/services/seo';
import { SiteContent, SiteSection } from '@app/schema/models';

@Component({
  selector:    'app-faq',
  standalone:  true,
  imports:     [RouterLink, EditableContentDirective, SafeHtmlPipe, FLIcon],
  templateUrl: './index.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations:  [pageEnter, accordion],
})
export class FaqPage implements OnInit {
  private destroy                   = inject(DestroyRef);
  private seo: SeoService           = inject(SeoService);
  private siteService: SiteService  = inject(SiteService);
  private log                       = (inject(LoggerService) as LoggerService).child('faq');

  site      = signal(FAQ);
  loading   = signal(true);
  openIndex = signal<number | null>(null);

  // ── Fix: these computed properties were missing from local copy ─────────
  intro = computed(() => bodyText(this.site()));
  faqs  = computed(() => (this.site() as any).faqs ?? []);

  // Track which questions have been expanded during this session
  private _openedQuestions = new Set<number>();
  private _initStart       = performance.now();

  async ngOnInit() {
    this.log.debug('FAQ page initialising');
    const unsub = this.siteService.watchSection('home',
      (data: SiteContent | SiteSection | null) => {
        if (data) this.site.set(data as SiteContent);
      }
    );
    this.seo.set({
      title: 'Frequently Asked Questions',
      description: 'Answers to common legal questions from the team at Fric, Lowenstein & Co. LLP, Calgary.',
    });
    try {
      const content = await this.siteService.getSection('faq');
      if (content) {
        this.site.set({ ...FAQ, ...content } as SiteContent);
        this.log.debug('FAQ content applied', { questionCount: content.faqs?.length ?? 0 });
      } else {
        this.log.debug('Using hardcoded FAQ fallback', { questionCount: FAQ.faqs?.length ?? 0 });
      }
    } finally {
      this.loading.set(false);
      this.log.info('FAQ page ready', {
        questionCount: this.site().faqs?.length ?? 0,
        tti:           Math.round(performance.now() - this._initStart),
      });
    }
    this.destroy.onDestroy(unsub);
  }

  toggle(i: number) {
    const isOpening = this.openIndex() !== i;
    this.openIndex.update((v: number | null) => v === i ? null : i);

    const question = (this.site().faqs ?? [])[i]?.question ?? `Question ${i}`;
    const preview  = typeof question === 'string'
      ? question.replace(/<[^>]+>/g, '').slice(0, 60)
      : String(i);

    if (isOpening) {
      this._openedQuestions.add(i);
      this.log.info('FAQ item expanded', {
        index:         i,
        question:      preview,
        totalExpanded: this._openedQuestions.size,
      });
    } else {
      this.log.trace('FAQ item collapsed', { index: i });
    }
  }
}
