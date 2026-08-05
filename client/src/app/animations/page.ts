/**
 * @core/animations/page.animations.ts
 *
 * Reusable Angular animation triggers used across all page components.
 * Import what you need; unused triggers are tree-shaken.
 */
import {
  trigger, transition, style, animate, query,
  stagger, sequence, state,
} from '@angular/animations';

/** Full page fade + slide up on route entry */
export const pageEnter = trigger('pageEnter', [
  transition(':enter', [
    style({ opacity: 0, transform: 'translateY(16px)' }),
    animate('380ms cubic-bezier(0.22,1,0.36,1)',
      style({ opacity: 1, transform: 'translateY(0)' })),
  ]),
]);

/** Staggered list entrance — wraps @for items */
export const listStagger = trigger('listStagger', [
  transition('* => *', [
    query(':enter', [
      style({ opacity: 0, transform: 'translateY(20px)' }),
      stagger('60ms', [
        animate('340ms cubic-bezier(0.22,1,0.36,1)',
          style({ opacity: 1, transform: 'translateY(0)' })),
      ]),
    ], { optional: true }),
  ]),
]);

/** Card hover lift — apply to individual card elements */
export const cardHover = trigger('cardHover', [
  state('idle',  style({ transform: 'translateY(0)',   boxShadow: 'var(--shadow-card)'   })),
  state('hover', style({ transform: 'translateY(-3px)', boxShadow: 'var(--shadow-dialog)' })),
  transition('idle <=> hover', animate('180ms ease')),
]);

/** Accordion expand/collapse with smooth height */
export const accordion = trigger('accordion', [
  transition(':enter', [
    style({ opacity: 0, transform: 'translateY(-6px)' }),
    animate('220ms cubic-bezier(0.22,1,0.36,1)',
      style({ opacity: 1, transform: 'translateY(0)' })),
  ]),
  transition(':leave', [
    animate('160ms ease-in',
      style({ opacity: 0, transform: 'translateY(-4px)' })),
  ]),
]);

/** Fade in only (no translate) — for overlays, toasts */
export const fadeIn = trigger('fadeIn', [
  transition(':enter', [
    style({ opacity: 0 }),
    animate('240ms ease', style({ opacity: 1 })),
  ]),
  transition(':leave', [
    animate('180ms ease', style({ opacity: 0 })),
  ]),
]);

/** Profile card side-slide */
export const slideInLeft = trigger('slideInLeft', [
  transition(':enter', [
    style({ opacity: 0, transform: 'translateX(-24px)' }),
    animate('360ms cubic-bezier(0.22,1,0.36,1)',
      style({ opacity: 1, transform: 'translateX(0)' })),
  ]),
]);

export const slideInRight = trigger('slideInRight', [
  transition(':enter', [
    style({ opacity: 0, transform: 'translateX(24px)' }),
    animate('360ms cubic-bezier(0.22,1,0.36,1)',
      style({ opacity: 1, transform: 'translateX(0)' })),
  ]),
]);