import { Routes } from '@angular/router';
import { routeAnimationIndex } from './schema/utils/route-order';

export const ROUTE_ORDER = [
  'HomePage', 'AboutUsPage', 'AreasOfLawPage', 'PricingPage',
  'BlogPage', 'FaqPage', 'ContactUsPage',
];

export const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  {
    path: 'home',
    loadComponent: () => import('@components/page/home').then(m => m.HomePage),
    data: { animation: routeAnimationIndex('home') },
  },
  {
    path: 'about-us',
    loadComponent: () => import('@components/page/about-us').then(m => m.AboutUsPage),
    data: { animation: routeAnimationIndex('about') },
  },
  {
    path: 'areas-of-law',
    loadComponent: () => import('@components/page/areas-of-law').then(m => m.AreasOfLawPage),
    data: { animation: routeAnimationIndex('areas-of-law') },
  },
  {
    path: 'pricing',
    loadComponent: () => import('@components/page/pricing').then(m => m.PricingPage),
    data: { animation: routeAnimationIndex('pricing') },
  },
  {
    path: 'blog',
    loadComponent: () => import('@components/page/blog').then(m => m.BlogPage),
    data: { animation: routeAnimationIndex('blog') },
  },
  {
    path: 'blog/:id',
    loadComponent: () => import('@components/page/article').then(m => m.ArticlePage),
    data: { animation: routeAnimationIndex('contact-us') },
  },
  {
    path: 'faq',
    loadComponent: () => import('@components/page/faq').then(m => m.FaqPage),
    data: { animation: routeAnimationIndex('faq') },
  },
  {
    path: 'contact-us',
    loadComponent: () => import('@components/page/contact-us').then(m => m.ContactUsPage),
    data: { animation: routeAnimationIndex('contact-us') },
  }
];
