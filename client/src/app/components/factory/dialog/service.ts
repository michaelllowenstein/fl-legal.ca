/**
 * dialog.service.ts
 *
 * Headless dialog factory — no Angular Material, no CDK overlay.
 * Uses Angular's createComponent() + ApplicationRef to mount any
 * standalone component as a modal inside a managed backdrop.
 *
 * Features:
 *   • Fully typed via InjectionToken helpers in dialog.tokens.ts
 *   • CSS-class-driven open/close animation (no setTimeout hacks for open)
 *   • Escape key closes the active dialog
 *   • Focus trap — Tab cycles only within the open panel
 *   • Scroll lock on <body> while any dialog is open
 *   • Stacks correctly — each open() call is independent
 *   • Context-menu variant: no backdrop, positioned at cursor
 */
import {
  Injectable,
  inject,
  ApplicationRef,
  createComponent,
  EnvironmentInjector,
  Type,
  createEnvironmentInjector,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { DIALOG_DATA, DIALOG_CLOSE_FN } from './tokens';

// ── Public types ──────────────────────────────────────────────────────────────

export interface DialogRef<R = unknown> {
  /** Programmatically close with an optional result. */
  close(result?: R): void;
  /** Resolves when the dialog finishes its exit animation. */
  closed: Promise<R | undefined>;
}

export interface DialogOptions<D = unknown> {
  data?:           D;
  /** Skip the dark backdrop (used for context menus). */
  bare?:           boolean;
  /** Prevent closing when the user clicks the backdrop. */
  disableClose?:   boolean;
  /** Prevent closing when the user presses Escape. */
  disableEscape?:  boolean;
  /** Extra Tailwind classes added to the backdrop wrapper. */
  panelClass?:     string;
}

// ── Animation class constants ─────────────────────────────────────────────────
// These must exist in tailwind.config.js:
//
//   keyframes: {
//     dialogIn:  { from: { opacity: '0' },                   to: { opacity: '1' } },
//     dialogOut: { from: { opacity: '1' },                   to: { opacity: '0' } },
//   },
//   animation: {
//     'dialog-in':  'dialogIn 0.18s ease both',
//     'dialog-out': 'dialogOut 0.15s ease both',
//   },
//
// The panel itself uses animate-scale-in (already in tailwind.config.js).

const CLS_OPEN  = 'animate-dialog-in';
const CLS_CLOSE = 'animate-dialog-out';
const ANIM_DURATION_MS = 160;

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class DialogService {
  private appRef   = inject(ApplicationRef);
  private injector = inject(EnvironmentInjector);
  private document = inject(DOCUMENT);

  /** Number of currently open dialogs (used to manage scroll lock). */
  private openCount = 0;

  open<C, D = unknown, R = unknown>(
    component: Type<C>,
    options: DialogOptions<D> = {},
  ): DialogRef<R> {

    // ── Backdrop element ────────────────────────────────────────────────────
    const backdrop = this.document.createElement('div');

    if (options.bare) {
      // Context-menu mode: transparent full-screen capture layer
      backdrop.className = 'fixed inset-0 z-50';
    } else {
      backdrop.className = [
        'fixed inset-0 z-50',
        'bg-brand-dark/60 backdrop-blur-sm',
        'flex items-center justify-center p-4',
        CLS_OPEN,
        options.panelClass ?? '',
      ].filter(Boolean).join(' ');
    }

    this.document.body.appendChild(backdrop);
    this.lockScroll();

    // ── Promise wiring ──────────────────────────────────────────────────────
    let resolveClosed!: (v: R | undefined) => void;
    const closed = new Promise<R | undefined>(res => (resolveClosed = res));
    let settled = false;

    // ── Close function ──────────────────────────────────────────────────────
    const close = (result?: R) => {
      if (settled) return;
      settled = true;

      // Swap in the exit animation class
      backdrop.classList.remove(CLS_OPEN);
      backdrop.classList.add(CLS_CLOSE);

      setTimeout(() => {
        this.appRef.detachView(ref.hostView);
        ref.destroy();
        childInjector.destroy();
        backdrop.remove();
        this.unlockScroll();
        restoreEscape();
        restoreFocus();
        resolveClosed(result);
      }, ANIM_DURATION_MS);
    };

    // ── Child injector — typed tokens, no string tokens ─────────────────────
    const childInjector = createEnvironmentInjector(
      [
        { provide: DIALOG_DATA,     useValue: options.data ?? {} },
        { provide: DIALOG_CLOSE_FN, useValue: close             },
      ],
      this.injector,
    );

    // ── Mount component ─────────────────────────────────────────────────────
    const ref = createComponent(component as Type<object>, {
      environmentInjector: childInjector,
      hostElement:         backdrop,
    });
    this.appRef.attachView(ref.hostView);

    // ── Backdrop click ──────────────────────────────────────────────────────
    if (!options.disableClose) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) close(undefined);
      });
    }

    // ── Escape key ──────────────────────────────────────────────────────────
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !options.disableEscape) {
        e.preventDefault();
        close(undefined);
      }
      if (e.key === 'Tab') {
        trapFocus(e, backdrop);
      }
    };
    this.document.addEventListener('keydown', onKeyDown);
    const restoreEscape = () => this.document.removeEventListener('keydown', onKeyDown);

    // ── Focus management ────────────────────────────────────────────────────
    const previouslyFocused = this.document.activeElement as HTMLElement | null;
    // Move focus into the panel on the next tick (after Angular renders)
    requestAnimationFrame(() => {
      const first = getFirstFocusable(backdrop);
      first?.focus();
    });
    const restoreFocus = () => previouslyFocused?.focus?.();

    return { close, closed };
  }

  // ── Scroll lock helpers ────────────────────────────────────────────────────

  private lockScroll() {
    this.openCount++;
    if (this.openCount === 1) {
      const scrollY = window.scrollY;
      this.document.body.style.position   = 'fixed';
      this.document.body.style.top        = `-${scrollY}px`;
      this.document.body.style.width      = '100%';
      this.document.body.style.overflowY  = 'scroll'; // prevent layout shift
    }
  }

  private unlockScroll() {
    this.openCount = Math.max(0, this.openCount - 1);
    if (this.openCount === 0) {
      const scrollY = parseInt(this.document.body.style.top || '0', 10) * -1;
      this.document.body.style.position  = '';
      this.document.body.style.top       = '';
      this.document.body.style.width     = '';
      this.document.body.style.overflowY = '';
      window.scrollTo(0, scrollY);
    }
  }
}

// ── Focus trap helpers (module-level, no need to be class methods) ─────────────

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
}

function getFirstFocusable(container: HTMLElement): HTMLElement | null {
  return getFocusableElements(container)[0] ?? null;
}

function trapFocus(e: KeyboardEvent, container: HTMLElement) {
  const focusable = getFocusableElements(container);
  if (focusable.length === 0) return;

  const first = focusable[0];
  const last  = focusable[focusable.length - 1];

  if (e.shiftKey) {
    if (document.activeElement === first) {
      e.preventDefault();
      last.focus();
    }
  } else {
    if (document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}