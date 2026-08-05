/**
 * dialog.tokens.ts
 *
 * Typed injection tokens shared between DialogService and every dialog
 * component. Importing from here instead of using string tokens or
 * Symbol() means TypeScript can infer the injected type at each call-site.
 *
 * Usage in a dialog component:
 *
 *   import { injectDialogData, injectDialogClose } from '@core/services/dialog.tokens';
 *
 *   export class MyDialogComponent {
 *     data    = injectDialogData<MyData>();
 *     closeFn = injectDialogClose<MyResult>();
 *   }
 */
import { InjectionToken, inject } from '@angular/core';

// ── Raw tokens (used internally by DialogService) ────────────────────────────
export const DIALOG_DATA     = new InjectionToken<unknown>('DIALOG_DATA');
export const DIALOG_CLOSE_FN = new InjectionToken<Function>('DIALOG_CLOSE_FN');

// ── Typed helpers (use these in dialog components) ───────────────────────────

/**
 * Inject the data payload passed to DialogService.open().
 * The generic parameter D must match the type passed as `options.data`.
 *
 *   const data = injectDialogData<{ userId: string }>();
 */
export function injectDialogData<D = unknown>(): D {
  return inject(DIALOG_DATA) as D;
}

/**
 * Inject the close function for this dialog instance.
 * Call it with an optional result value to resolve the `DialogRef.closed` promise.
 *
 *   const close = injectDialogClose<boolean>();
 *   close(true);   // resolves DialogRef.closed with true
 *   close();       // resolves with undefined (user dismissed)
 */
export function injectDialogClose<R = unknown>(): (result?: R) => void {
  return inject(DIALOG_CLOSE_FN) as (result?: R) => void;
}
