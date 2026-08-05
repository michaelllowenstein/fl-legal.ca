/**
 * confirm/index.ts
 *
 * Usage:
 *   const ref = this.dialog.open(ConfirmDialogComponent, {
 *     data: {
 *       title:        'Delete Event',
 *       message:      'This cannot be undone.',
 *       confirmLabel: 'Delete',
 *       danger:       true,
 *     },
 *   });
 *   const confirmed = await ref.closed;  // boolean | undefined
 */
import { Component, ChangeDetectionStrategy } from '@angular/core';
import { injectDialogData, injectDialogClose } from '@components/factory/dialog/tokens';
import { FLIcon } from '@components/ui/icon';

export interface ConfirmData {
  title?:         string;
  message:        string;
  confirmLabel?:  string;
  cancelLabel?:   string;
  /** Renders the confirm button in red. */
  danger?:        boolean;
}

@Component({
  selector:    'app-confirm-dialog',
  standalone:  true,
  imports:     [FLIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './index.html'
})
export class ConfirmDialog {
  data  = injectDialogData<ConfirmData>();
  close = injectDialogClose<boolean>();
}