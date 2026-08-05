import {
  style, group, query, trigger, animate, transition, animateChild,
} from '@angular/animations';

export const ROUTE_ORDER = [
  'HomePage', 'AboutUsPage', 'AreasOfLawPage', 'PricingPage',
  'BlogPage', 'FaqComponent', 'ContactUsPage',
];

export const routerSlideAnimation = trigger('routeAnimations', [
  transition('* => *', [
    query(':enter, :leave', [
      style({ position: 'absolute', top: 0, left: 0, width: '100%' }),
    ], { optional: true }),
    group([
      query(':leave', [
        animate('300ms ease-out', style({ transform: 'translateX({{ direction }})', opacity: 0 })),
      ], { optional: true }),
      query(':enter', [
        style({ transform: 'translateX({{ directionInverse }})', opacity: 0 }),
        animate('300ms ease-out', style({ transform: 'translateX(0)', opacity: 1 })),
      ], { optional: true }),
    ]),
  ], { params: { direction: '100%', directionInverse: '-100%' } }),
]);
