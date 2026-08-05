/**
 * editable-content.directive.ts
 *
 * Attaches right-click editing to any element. Full flow:
 *   1. Right-click → ContextMenuDialogComponent
 *   2. Select "Edit" → check auth
 *   3. If not authenticated → PasswordDialogComponent
 *   4. Authenticated → InlineEditDialogComponent
 *   5. Save → PATCH /api/content → DOM update + NotificationComponent
 *
 * Usage:
 *   <h1
 *     [appEditableText]="'home/heading'"
 *     editLabel="Home page heading"
 *     [innerHTML]="site().heading | safeHtml">
 *   </h1>
 */
import {
  Directive, HostListener, inject,
  ElementRef, input,
} from '@angular/core';
import { DialogService } from '@components/factory/dialog/service';
import { EditorService } from '@core/services/editor';
import { SiteService } from '@core/services/site';

import {
  ContextMenuDialog,
  ContextMenuData,
} from '@components/ui/dialog/context-menu';

import {
  PasswordDialog,
} from '@components/ui/dialog/password';

import {
  InlineEditData,
  InlineEditDialog,
  InlineEditResult,
} from '@components/ui/dialog/inline-edit';

import {
  NotificationDialog,
  NotificationData,
} from '@components/ui/dialog/notification';
import { LoggerService } from '../services/logger';

@Directive({
  selector:  '[appEditableText]',
  standalone: true,
})
export class EditableContentDirective {
  appEditableText       = input.required<string>();
  editLabel             = input<string>('');

  private dialog        = inject(DialogService);
  private auth          = inject(EditorService);
  private siteService   = inject(SiteService);
  private el            = inject(ElementRef<HTMLElement>);
  private log           = inject(LoggerService).child('editable');

  @HostListener('contextmenu', ['$event'])
  async onContextMenu(event: MouseEvent) {
    event.preventDefault();

    const key = this.appEditableText();
    this.log.debug('Context menu opened', { key, label: this.editLabel() });

    // ── Step 1: show context menu and wait for user action ──────────────────
    // const menuRef: DialogRef<"edit" | null> = this.dialog.open<
    //   ContextMenuDialog,
    //   { x: number; y: number },
    //   'edit' | null
    // >(ContextMenuDialog, { data: { x: event.clientX, y: event.clientY } });

    const menuRef = this.dialog.open<ContextMenuDialog, ContextMenuData>(
      ContextMenuDialog,
      {
        bare: true,
        data: {
          x: event.clientX,
          y: event.clientY,
          items: [
            {
              label:  'Edit content',
              icon:   'pencil',
              action: () => this.openEditor(),
            },
            {
              label:   'Cancel',
              icon:    'x-mark',
              divider: true,
              action:  () => {},
            },
          ],
        },
      },
    );
  }

  private async openEditor() {
    const key = this.appEditableText();

    // ── Step 1: authenticate if needed ─────────────────────────────────────
    if (!this.auth.isAuthenticated()) {
      this.log.info('Editor not authenticated — opening password dialog', { key });

      const pwRef = this.dialog.open<PasswordDialog, never, boolean>(
        PasswordDialog,
        { disableClose: true },
      );
      const authed = await pwRef.closed;

      if (!authed) {
        this.log.info('Password dialog dismissed — edit cancelled', { key });
        return;
      }
      this.log.info('Authentication confirmed — proceeding to edit', { key });
    } else {
      this.log.debug('Already authenticated — skipping password dialog', { key });
      // Check if token is approaching expiry every time the editor is opened
      this.auth.checkTokenExpiry();
    }

    // ── Step 2: open editor ─────────────────────────────────────────────────
    await this.continueEditing(key);
  }

  private async continueEditing(key: string): Promise<void> {
    const currentLength = this.el.nativeElement.innerHTML.length;
    this.log.debug('Opening inline editor', { key, currentLength });

    const editRef = this.dialog.open<
      InlineEditDialog,
      InlineEditData,
      InlineEditResult | null
    >(
      InlineEditDialog,
      {
        data: {
          fieldKey:     key,
          currentValue: this.el.nativeElement.innerHTML,
          label:        this.editLabel() || key,
        },
      },
    );

    const result = await editRef.closed;
    if (!result) {
      this.log.debug('Inline editor cancelled', { key });
      return;
    }

    // ── Step 3: persist ─────────────────────────────────────────────────────
    const newLength = result.value.length;
    this.log.info('Saving edited content', { key, oldLength: currentLength, newLength });

    try {
      await this.siteService.updateField(result.key, result.value);

      // Optimistic DOM update
      this.el.nativeElement.innerHTML = result.value;
      this.log.info('Content saved and DOM updated', { key });

      this.notify('Content saved.', 'success');
    } catch (e: unknown) {
      this.log.error('Content save failed in directive', { key, error: String(e) });
      this.notify('Save failed. Please try again.', 'error');
    }
  }

  private notify(message: string, type: NotificationData['type']) {
    this.dialog.open<NotificationDialog, NotificationData>(
      NotificationDialog,
      { bare: true, data: { message, type } },
    );
  }
}
