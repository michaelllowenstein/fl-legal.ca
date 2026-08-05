import {
  Component,
  ChangeDetectionStrategy,
  signal,
  inject,
  computed,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { FLIcon } from '@components/ui/icon';
import { injectDialogClose } from '@components/factory/dialog/tokens';
import { LoggerService } from '@core/services/logger';
import { env } from '@env/environment';

// ── Types ─────────────────────────────────────────────────────────────────────

interface InquiryForm {
  name:         string;
  email:        string;
  phone:        string;
  message:      string;
  practiceArea: string;
}

type FormErrors = Partial<Record<keyof InquiryForm, string>>;

const PRACTICE_AREAS = [
  'Civil Litigation',
  'Real Estate Law',
  'Personal Injury',
  'Estate Planning',
  'Corporate Law',
  'Employment Law',
  'Other',
] as const;

// ── Test-mode detection ───────────────────────────────────────────────────────
//
// The test-fill button appears on localhost and staging only — never on the
// production domain.  We check the hostname at runtime so it works regardless
// of which Angular build configuration was used (both environment.ts and
// environment.prod.ts currently have `production: false`).

function isTestEnvironment(): boolean {
  const host = window?.location?.hostname ?? '';
  return host === 'localhost'
      || host === '127.0.0.1'
      || host.includes('staging');
}

// ── Component ─────────────────────────────────────────────────────────────────

@Component({
  selector:    'app-inquiry-dialog',
  standalone:  true,
  imports:     [FLIcon, FormsModule],
  templateUrl: './index.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host .fl-label {
      @apply block font-sans text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5;
    }
    :host .fl-input {
      @apply w-full border rounded-lg px-3 py-2.5 font-sans text-sm text-brand
             focus:outline-none focus:ring-2 focus:ring-brand-light focus:border-transparent
             transition-shadow;
    }
    :host .fl-error {
      @apply mt-1.5 font-sans text-xs text-red-500 flex items-center gap-1;
    }
  `],
})
export class InquiryDialog {
  private http = inject(HttpClient);
  private log  = inject(LoggerService).child('inquiry-dialog');
  close        = injectDialogClose<boolean>();

  // ── Form state ─────────────────────────────────────────────────────────────

  form: InquiryForm = { name: '', email: '', phone: '', message: '', practiceArea: '' };

  isPriority  = signal(false);
  errors      = signal<FormErrors>({});
  loading     = signal(false);
  submitted   = signal(false);
  serverError = signal('');

  readonly practiceAreas = PRACTICE_AREAS;

  firstName = computed(() => this.form.name.split(' ')[0] || 'there');

  /** Whether the test-fill button should be visible. */
  readonly showTestFill = signal(isTestEnvironment());

  // ── Priority toggle ──────────────────────────────────────────────────────

  /**
   * Clear practiceArea when priority is switched off so a stale value can
   * never leak into a general-inquiry payload (which rejects unknown fields
   * via additionalProperties: false on the server schema).
   */
  setPriority(value: boolean): void {
    this.isPriority.set(value);
    if (!value) this.form.practiceArea = '';
  }

  // ── Test autofill ──────────────────────────────────────────────────────────

  /**
   * Populates the form with sensible defaults for quick manual testing.
   * The actual email recipient is controlled server-side via the
   * TEST_EMAIL_RECIPIENT env var — what gets filled here is just what
   * appears in the form inputs so you can hit Submit immediately.
   */
  fillTestData(): void {
    this.form.name         = 'Michael Lowenstein';
    this.form.email        = 'iam@miloseng.com';
    this.form.phone        = '(825)-488-2533';
    this.form.message      = 'Automated test submission from the inquiry dialog. '
                           + 'If this arrives at a real inbox, TEST_EMAIL_RECIPIENT is not set.';
    this.form.practiceArea = 'Other';
    this.isPriority.set(true);
    this.errors.set({});
    this.serverError.set('');
    this.log.info('Test data filled');
  }

  // ── Validation ─────────────────────────────────────────────────────────────

  private validate(): boolean {
    const e: FormErrors = {};
    if (!this.form.name.trim())    e.name    = 'Name is required.';
    if (!this.form.email.trim())   e.email   = 'Email is required.';
    else if (!/\S+@\S+\.\S+/.test(this.form.email)) e.email = 'Enter a valid email address.';
    if (!this.form.message.trim()) e.message = 'Message is required.';
    this.errors.set(e);
    return Object.keys(e).length === 0;
  }

  // ── Submission ─────────────────────────────────────────────────────────────

  async submit(): Promise<void> {
    if (!this.validate()) {
      this.log.warn('Submit blocked by client-side validation', { errors: this.errors() });
      return;
    }

    this.loading.set(true);
    this.serverError.set('');

    const priority = this.isPriority();
    const endpoint = priority
      ? `${env.apiURL}/api/inquiries/priority`
      : `${env.apiURL}/api/inquiries`;

    const body = {
      name:    this.form.name,
      email:   this.form.email,
      message: this.form.message,
      ...(this.form.phone                     && { phone:        this.form.phone }),
      ...(priority && this.form.practiceArea  && { practiceArea: this.form.practiceArea }),
    };

    try {
      await firstValueFrom(
        this.http.post(endpoint, body, { responseType: 'text' })
      );
      this.log.info('Inquiry sent', { priority });
      this.submitted.set(true);
    } catch (err: any) {
      this.serverError.set(this.messageFor(err));
      this.log.error('Inquiry submission failed', {
        priority,
        endpoint,
        status:  err instanceof HttpErrorResponse ? err.status  : undefined,
        message: err instanceof HttpErrorResponse ? err.message : String(err),
      });
    } finally {
      this.loading.set(false);
    }
  }

  /** Maps a failed request to a user-facing message that distinguishes the
   *  most common failure modes instead of collapsing them all into one. */
  private messageFor(err: any): string {
    if (!(err instanceof HttpErrorResponse)) {
      return 'Failed to send. Please try again or call us at (403)-291-2594.';
    }
    switch (err.status) {
      case 0:
        return 'We couldn\u2019t reach our server. Please check your connection and try again, or call us at (403)-291-2594.';
      case 429:
        return 'Too many attempts from this connection. Please wait a few minutes and try again, or call us at (403)-291-2594.';
      case 400:
        return 'Some of the information provided couldn\u2019t be sent. Please double-check the form and try again.';
      default:
        return 'Failed to send. Please try again or call us at (403)-291-2594.';
    }
  }
}