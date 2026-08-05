import {
  Component,
  ChangeDetectionStrategy,
  signal,
  inject,
  computed,
  DestroyRef,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { EditableContentDirective } from '@core/directives/editable-content';
import { pageEnter, listStagger } from '@animations/page';
import { FLIcon } from '@components/ui/icon';
import { LoggerService } from '@core/services/logger';
import { SiteService } from '@core/services/site';
import { PRICING } from '@schema/constants';
import { PricingSection, SiteContent, SiteSection } from '@schema/models';
import { sectionText } from '@schema/utils';
import { SeoService } from '@core/services/seo';
import { AutoContrastDirective } from '@core/directives/auto-contrast';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { DialogService } from '@app/components/factory/dialog/service';
import { Calculator } from '@feature/calculator';

const SECTION_META: Record<string, { icon: string; accent: string }> = {
  'purchase-mortgage': { icon: 'home',           accent: 'text-blue-600 bg-blue-50 border-blue-100'          },
  'cash-purchase':     { icon: 'banknotes',       accent: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
  'sales':             { icon: 'tag',             accent: 'text-violet-600 bg-violet-50 border-violet-100'   },
  'refinances':        { icon: 'arrow-path',      accent: 'text-amber-600 bg-amber-50 border-amber-100'      },
  'interim-financing': { icon: 'clock',           accent: 'text-sky-600 bg-sky-50 border-sky-100'            },
  'transfer-of-land':  { icon: 'map-pin',         accent: 'text-rose-600 bg-rose-50 border-rose-100'         },
  'corporate':         { icon: 'building-office', accent: 'text-indigo-600 bg-indigo-50 border-indigo-100'   },
  'wills-epa-single':  { icon: 'document-text',   accent: 'text-teal-600 bg-teal-50 border-teal-100'         },
  'wills-epa-couple':  { icon: 'user-group',      accent: 'text-teal-700 bg-teal-50 border-teal-200'         },
  'probate':           { icon: 'scale',           accent: 'text-brand bg-brand/5 border-brand/15'            },
  'personal-injury':   { icon: 'shield-check',    accent: 'text-orange-600 bg-orange-50 border-orange-100'   },
  'notary':            { icon: 'pencil-square',   accent: 'text-gray-600 bg-gray-50 border-gray-200'         },
  'extra-services':    { icon: 'plus-circle',     accent: 'text-brand-gold bg-brand-gold/10 border-brand-gold/20' },
};

const DEFAULT_META = {
  icon:   'document-text',
  accent: 'text-brand-gold bg-brand-gold/10 border-brand-gold/20',
};

@Component({
  selector:    'app-pricing',
  standalone:  true,
  templateUrl: './index.html',
  imports: [RouterLink, FLIcon, EditableContentDirective, AutoContrastDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations:  [pageEnter, listStagger],
  styles: `

  `
})
export class PricingPage {
  private seo: SeoService       = inject(SeoService);
  private siteService           = inject(SiteService);
  private destroy               = inject(DestroyRef);
  private log                   = inject(LoggerService).child('pricing');
  private sanitizer             = inject(DomSanitizer);
  private dialog: DialogService = inject(DialogService);

  site    = signal(PRICING);
  loading = signal(true);
  header    = computed(() => sectionText(this.site().header));
  subheader = computed(() => sectionText(this.site().subheader));
  raw     = signal<any>(null);

  intro        = computed(() => this.raw()?.intro ?? '');
  sections     = computed<PricingSection[]>(() => this.raw()?.sections ?? []);
  disclaimer   = computed(() => this.sections().find(s => s.id === 'disclaimer') ?? null);
  mainSections = computed(() => this.sections().filter(s => s.id && s.id !== 'disclaimer'));

  async ngOnInit() {
    this.log.debug('Pricing page initialising');
    const unsub = this.siteService.watchSection('home',
      (data: SiteContent | SiteSection | null) => {
        if (data) this.site.set(data as SiteContent);
      }
    );
    this.seo.set({
      title: 'Legal Fees & Pricing',
      description: 'Transparent legal fee information from Fric, Lowenstein & Co. LLP. Understand the cost of your legal matter before you begin.',
    });
    try {
      const content = await this.siteService.getSection('pricing');
      if (content) this.raw.set(content);
    } finally {
      this.loading.set(false);
    }
    // Clean up on component destroy
    this.destroy.onDestroy(unsub);
  }

  metaFor(section: PricingSection) {
    return SECTION_META[section.id ?? ''] ?? DEFAULT_META;
  }

  highlightPrices(row: string): SafeHtml {
    const escaped = row
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const highlighted = escaped.replace(
      /(\$[\d,]+(?:\.\d{2})?(?:\s*[–\-]\s*\$[\d,]+(?:\.\d{2})?)?|\d+(?:\.\d+)?%(?:\s*(?:to|–|-)\s*\d+(?:\.\d+)?%)?)/g,
      '<span class="font-semibold text-brand">$1</span>',
    );
    return this.sanitizer.bypassSecurityTrustHtml(highlighted);
  }
 
  openCalculator() {
    this.log.info('Fee calculator dialog opened from Pricing page');
    this.dialog.open(Calculator);
  }
}
