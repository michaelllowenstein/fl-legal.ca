
import {
  Component, OnInit, signal, inject,
  ChangeDetectionStrategy, HostListener, ElementRef, computed,
  DestroyRef,
} from '@angular/core';
import { EditableContentDirective } from '@core/directives/editable-content';
import { SafeHtmlPipe } from '@core/pipes/safe-html';
import { FLIcon } from '@components/ui/icon';
import { SiteService } from '@core/services/site';
import { LoggerService } from '@core/services/logger';
import { ABOUTUS, PROFILES } from '@schema/constants';
import { pageEnter, listStagger, slideInLeft, slideInRight } from '@animations/page';
import { bodyText } from '@schema/utils';
import { SeoService } from '@core/services/seo';
import { AutoContrastDirective } from "@app/core/directives/auto-contrast";
import { SiteContent, SiteSection } from '@app/schema/models';

@Component({
  selector:    'app-about-us',
  standalone:  true,
  imports: [FLIcon, EditableContentDirective, SafeHtmlPipe, AutoContrastDirective],
  templateUrl: './index.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations:  [pageEnter, listStagger, slideInLeft, slideInRight],
})
export class AboutUsPage implements OnInit {
  private destroy = inject(DestroyRef);
  private seo: SeoService =    inject(SeoService);
  private siteService: SiteService = inject(SiteService);
  private el: ElementRef<HTMLElement>             = inject(ElementRef<HTMLElement>);
  private log          = (inject(LoggerService) as LoggerService).child('about-us');

  site          = signal(ABOUTUS);
  loading       = signal(true);
  activeProfile = signal<string | null>(null);
  sidenavOpen   = signal(false);
  visibleCards  = signal<Set<number>>(new Set());

  // ── Computed string properties ──────────────────────────────────────────
  firmIntro = computed(() => bodyText(this.site()));

  // Profiles live in the PROFILES constant (separate from SiteContent)
  // — merge them in from the constant directly
  readonly profiles = PROFILES;

  private _initStart = performance.now();

  activeProfileData = computed(() =>
    this.profiles.find(p => p.id === this.activeProfile()) ?? null
  );

  async ngOnInit() {
    const unsub = this.siteService.watchSection('aboutUs',
      (data: SiteContent | SiteSection | null) => {
        if (data) this.site.set(data as SiteContent);
      }
    );
    try {
      const content = await this.siteService.getSection('aboutUs');
      if (content) this.site.set({ ...ABOUTUS, ...content } as SiteContent);
      if (this.profiles[0]) this.activeProfile.set(this.profiles[0].id);
    } finally {
      this.loading.set(false);
      setTimeout(() => this.checkCards(), 150);
    }
    this.destroy.onDestroy(unsub);
  }

  @HostListener('window:scroll')
  checkCards() {
    const cards = this.el.nativeElement.querySelectorAll('[data-profile-card]');
    const next  = new Set(this.visibleCards());
    cards.forEach((card: Element, i: number) => {
      if (!next.has(i) && card.getBoundingClientRect().top < window.innerHeight * 0.92) {
        next.add(i);
      }
    });
    if (next.size !== this.visibleCards().size) this.visibleCards.set(next);
  }

  isCardVisible(i: number) { return this.visibleCards().has(i); }

  selectProfile(id: string) {
    this.activeProfile.set(id);
    this.sidenavOpen.set(false);

    setTimeout(() => {
      const target = this.el.nativeElement.querySelector(`[data-profile="${id}"]`);
      if (!target) return;

      const NAVBAR_HEIGHT = 166; // 64px header + 16px breathing room
      const top = target.getBoundingClientRect().top + window.scrollY - NAVBAR_HEIGHT;
      window.scrollTo({ top, behavior: 'smooth' });
    }, 50);
  }

  toggleSidenav(): void {
    this.sidenavOpen.update((v: boolean) => !v);
  }
}
