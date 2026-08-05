/**
 * inline-edit-dialog.component.ts
 *
 * Enhanced CMS editor dialog. Replaces the plain textarea with:
 *
 *   • Field type detection     — shows appropriate editor per field
 *       plain    → single-line input  (header, subheader)
 *       richtext → textarea + toolbar (intro, footer, body)
 *       bullet   → multi-line list editor with add/remove/reorder (bulletpoints/N)
 *       faq      → question + answer fields side by side (faqs/N/question|answer)
 *
 *   • Formatting toolbar       — Bold, Italic, Link, <br> for richtext fields
 *   • Live preview             — rendered HTML shown beside the editor
 *   • Edit history             — 10-step local undo stack (Ctrl+Z)
 *   • Character counter        — with configurable soft limit
 *   • Field path breadcrumb    — shows exactly what is being edited
 *   • Keyboard shortcuts       — Ctrl+Enter to save, Escape to cancel
 */

import {
  Component, signal, computed, inject,
  ChangeDetectionStrategy, HostListener,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { DIALOG_CLOSE_FN, DIALOG_DATA } from '@factory/dialog/tokens';
import { FLIcon } from '@components/ui/icon';
import { SafeHtmlPipe } from '@core/pipes/safe-html';

export interface InlineEditData {
  fieldKey:     string;
  currentValue: string;
  label?:       string;
}

export interface InlineEditResult {
  key:    string;
  value:  string;
}

// Infer a display-friendly type from the Firebase field key path
type FieldType = 'plain' | 'richtext' | 'bullet' | 'faq';

function detectFieldType(key: string): FieldType {
  if (key.includes('bulletpoints/')) return 'bullet';
  if (key.includes('faqs/'))         return 'faq';
  if (
    key.endsWith('/header')    ||
    key.endsWith('/subheader') ||
    key.endsWith('/label')     ||
    key.endsWith('/title')
  ) return 'plain';
  return 'richtext';
}

// Build a human-readable breadcrumb from a Firebase path
// e.g. "faq/faqs/2/answer" → "FAQ  ›  FAQs  ›  Item 3  ›  Answer"
function pathBreadcrumb(key: string): string {
  return key
    .split('/')
    .map((seg, i, arr) => {
      if (/^\d+$/.test(seg)) return `Item ${parseInt(seg) + 1}`;
      return seg.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
    })
    .join('  ›  ');
}

@Component({
  selector:        'app-inline-edit-dialog',
  standalone:      true,
  imports:         [FormsModule, FLIcon, SafeHtmlPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    .toolbar-btn {
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 12px;
      border: 1px solid #e2e8f0;
      background: white;
      cursor: pointer;
      transition: all .15s;
    }
    .toolbar-btn:hover { background: #f1f5f9; border-color: #cbd5e1; }
    .toolbar-btn.active { background: #1a3a5c; color: white; border-color: #1a3a5c; }
    .editor-textarea {
      width: 100%; font-family: 'Georgia', serif; font-size: 14px;
      line-height: 1.7; resize: vertical; border: 1px solid #d1d5db;
      border-radius: 8px; padding: 10px 12px; outline: none;
      transition: box-shadow .15s, border-color .15s;
    }
    .editor-textarea:focus { border-color: #1a3a5c; box-shadow: 0 0 0 3px rgba(26,58,92,.1); }
    .preview-panel {
      background: #f8fafc; border: 1px solid #e2e8f0;
      border-radius: 8px; padding: 12px 16px;
      font-family: 'Georgia', serif; font-size: 14px; line-height: 1.75;
      min-height: 80px; color: #1a3a5c;
    }
    .history-dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: #cbd5e1; display: inline-block;
    }
    .history-dot.current { background: #1a3a5c; }
  `],
  templateUrl: './index.html'
})
export class InlineEditDialog {
  data    = inject(DIALOG_DATA) as InlineEditData;

closeFn = inject(DIALOG_CLOSE_FN) as (r?: InlineEditResult | null) => void;

  // ── Field analysis ─────────────────────────────────────────────────────────
  fieldType    = computed<FieldType>(() => detectFieldType(this.data.fieldKey));
  breadcrumb   = computed(() => pathBreadcrumb(this.data.fieldKey));
  isFaqQuestion = computed(() => this.data.fieldKey.endsWith('/question'));
  softLimit    = computed(() => {
    const t = this.fieldType();
    if (t === 'plain')  return 120;
    if (t === 'bullet') return 200;
    return 2000;
  });

  fieldTypeBadgeClass = computed(() => {
    const classes: Record<FieldType, string> = {
      plain:    'border-blue-200 text-blue-600 bg-blue-50',
      richtext: 'border-purple-200 text-purple-600 bg-purple-50',
      bullet:   'border-amber-200 text-amber-600 bg-amber-50',
      faq:      'border-green-200 text-green-600 bg-green-50',
    };
    return classes[this.fieldType()];
  });

  // ── Draft state + history ──────────────────────────────────────────────────

  private readonly MAX_HISTORY = 10;

  history      = signal<string[]>([this.data.currentValue]);
  historyIndex = signal(0);
  draft        = computed(() => this.history()[this.historyIndex()]);
  isDirty      = computed(() => this.draft() !== this.data.currentValue);
  charCount    = computed(() => this.draft().length);
  error        = signal('');
  showPreview  = signal(false);

  togglePreview(): void {
    this.showPreview.update((v: boolean) => !v);
  }

  updateDraft(value: string) {
    this.error.set('');
    const hist  = this.history().slice(0, this.historyIndex() + 1);
    const next  = [...hist, value].slice(-this.MAX_HISTORY);
    this.history.set(next);
    this.historyIndex.set(next.length - 1);
  }

  undo() {
    if (this.historyIndex() > 0) {
      this.historyIndex.update(i => i - 1);
    }
  }

  redo() {
    if (this.historyIndex() < this.history().length - 1) {
      this.historyIndex.update(i => i + 1);
    }
  }

  resetToOriginal() {
    this.updateDraft(this.data.currentValue);
  }

  // ── Toolbar helpers ────────────────────────────────────────────────────────

  insertTag(tag: string) {
    const textarea = document.querySelector<HTMLTextAreaElement>('textarea');
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end   = textarea.selectionEnd;
    const sel   = textarea.value.slice(start, end);
    const replacement = sel
      ? `<${tag}>${sel}</${tag}>`
      : `<${tag}></${tag}>`;

    const next =
      textarea.value.slice(0, start) +
      replacement +
      textarea.value.slice(end);

    this.updateDraft(next);

    // Restore cursor position after Angular re-renders
    requestAnimationFrame(() => {
      textarea.selectionStart = start + `<${tag}>`.length;
      textarea.selectionEnd   = start + `<${tag}>`.length + sel.length;
    });
  }

  insertLink() {
    const url   = window.prompt('URL (include https://):', 'https://');
    if (!url) return;
    const label = window.prompt('Link label:', 'click here') ?? 'click here';
    this.insertRaw(`<a class="text-link" href="${url}">${label}</a>`);
  }

  insertRaw(html: string) {
    const textarea = document.querySelector<HTMLTextAreaElement>('textarea');
    if (!textarea) { this.updateDraft(this.draft() + html); return; }

    const pos  = textarea.selectionStart;
    const next =
      textarea.value.slice(0, pos) +
      html +
      textarea.value.slice(pos);

    this.updateDraft(next);
  }

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────

  @HostListener('keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); this.save(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z')     { e.preventDefault(); this.undo(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y')     { e.preventDefault(); this.redo(); }
    if (e.key === 'Escape') { e.preventDefault(); this.cancel(); }
  }

  // ── Save / cancel ──────────────────────────────────────────────────────────

  save() {
    const v = this.draft().trim();
    if (!v) { this.error.set('Content cannot be empty.'); return; }
    this.closeFn({ key: this.data.fieldKey, value: v });
  }

  cancel() { this.closeFn(null); }
}
