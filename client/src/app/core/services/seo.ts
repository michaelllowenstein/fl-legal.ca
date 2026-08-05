import { Injectable, inject } from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';
import { Router } from '@angular/router';

export interface SeoConfig {
  title: string;
  description: string;
  canonical?: string;
  ogImage?: string;
}

const BASE_URL = 'https://fl-legal.ca';
const FIRM_SUFFIX = ' | Fric, Lowenstein & Co. LLP';
const DEFAULT_IMAGE = `${BASE_URL}/assets/ssite/branding/logo-white-on-blue-100x99.png`;

@Injectable({ providedIn: 'root' })
export class SeoService {
  private meta: Meta = inject(Meta);
  private title: Title = inject(Title);
  private router: Router = inject(Router);

  set(config: SeoConfig): void {
    const fullTitle = config.title + FIRM_SUFFIX;
    const canonical = config.canonical ?? (BASE_URL + this.router.url);
    const image = config.ogImage ?? DEFAULT_IMAGE;

    this.title.setTitle(fullTitle);

    this.meta.updateTag({ name: 'description', content: config.description });

    // Canonical
    this.updateLink('canonical', canonical);

    // Open Graph
    this.meta.updateTag({ property: 'og:title', content: fullTitle });
    this.meta.updateTag({ property: 'og:description', content: config.description });
    this.meta.updateTag({ property: 'og:url', content: canonical });
    this.meta.updateTag({ property: 'og:image', content: image });
    this.meta.updateTag({ property: 'og:type', content: 'website' });
    this.meta.updateTag({ property: 'og:site_name', content: 'Fric, Lowenstein & Co. LLP' });

    // Twitter Card
    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: fullTitle });
    this.meta.updateTag({ name: 'twitter:description', content: config.description });
    this.meta.updateTag({ name: 'twitter:image', content: image });
  }

  private updateLink(rel: string, href: string): void {
    let link: HTMLLinkElement | null = document.querySelector(`link[rel="${rel}"]`);
    if (!link) {
      link = document.createElement('link');
      link.setAttribute('rel', rel);
      document.head.appendChild(link);
    }
    link.setAttribute('href', href);
  }
}