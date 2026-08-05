
// Lives inside the CMS editor panel (editor-auth-gated).
// Allows creating, publishing, archiving, and deleting notifications.
// Displays a live list of existing notifications from /api/notifications/admin.
 
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EnvService } from '@core/services/env';
import { NotificationService } from '@core/services/notification';
import {
  AppNotification,
  NotificationType,
  NotificationAudience,
} from '@schema/models';
 
interface DraftNotification {
  title: string;
  body: string;
  type: NotificationType;
  audience: NotificationAudience;
  ctaLabel: string;
  ctaUrl: string;
  expiresAt: string;
}
 
const BLANK_DRAFT = (): DraftNotification => ({
  title: '',
  body: '',
  type: 'feature',
  audience: 'all',
  ctaLabel: '',
  ctaUrl: '',
  expiresAt: '',
});
 
@Component({
  selector: 'app-notification-composer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  styleUrls: ['./index.scss'],
  templateUrl: './index.html'
})
export class NotificationComposerComponent {
  private readonly http: HttpClient = inject(HttpClient);
  private readonly env: EnvService = inject(EnvService);
  private readonly notifSvc: NotificationService = inject(NotificationService);
 
  protected readonly draft = signal<DraftNotification>(BLANK_DRAFT());
  protected readonly publishing = signal(false);
  protected readonly loading = signal(true);
  protected readonly existing = signal<AppNotification[]>([]);
  protected readonly statusMsg = signal('');
  protected readonly statusOk = signal(true);
 
  protected readonly canPublish = computed(() => {
    const d = this.draft();
    return d.title.trim().length > 0 && d.body.trim().length > 0;
  });
 
  constructor() {
    this.loadExisting();
  }
 
  private loadExisting(): void {
    this.loading.set(true);
    this.http
      .get<AppNotification[]>(`${this.env.apiURL}/api/notifications/admin`)
      .subscribe({
        next: (list) => { this.existing.set(list); this.loading.set(false); },
        error: () => this.loading.set(false),
      });
  }
 
  protected publish(): void {
    if (!this.canPublish()) return;
    const d = this.draft();
 
    const payload: Partial<AppNotification> = {
      title: d.title.trim(),
      body: d.body.trim(),
      type: d.type,
      audience: d.audience,
      status: 'active',
    };
 
    if (d.ctaLabel.trim() && d.ctaUrl.trim()) {
      payload.cta = { label: d.ctaLabel.trim(), url: d.ctaUrl.trim() };
    }
    if (d.expiresAt) {
      payload.expiresAt = new Date(d.expiresAt).toISOString();
    }
 
    this.publishing.set(true);
    this.statusMsg.set('');
 
    this.http
      .post<AppNotification>(`${this.env.apiURL}/api/notifications`, payload)
      .subscribe({
        next: (created) => {
          this.publishing.set(false);
          this.statusOk.set(true);
          this.statusMsg.set(`Notification published (ID: ${created.id})`);
          this.resetDraft();
          this.loadExisting();
          this.notifSvc.refresh();
        },
        error: (err) => {
          this.publishing.set(false);
          this.statusOk.set(false);
          this.statusMsg.set(`Failed to publish: ${err.message ?? 'Unknown error'}`);
        },
      });
  }
 
  protected archive(id: string): void {
    this.http
      .patch(`${this.env.apiURL}/api/notifications/${id}`, { status: 'archived' })
      .subscribe({ next: () => this.loadExisting() });
  }
 
  protected restore(id: string): void {
    this.http
      .patch(`${this.env.apiURL}/api/notifications/${id}`, { status: 'active' })
      .subscribe({ next: () => { this.loadExisting(); this.notifSvc.refresh(); } });
  }
 
  protected delete(id: string): void {
    if (!confirm('Delete this notification permanently?')) return;
    this.http
      .delete(`${this.env.apiURL}/api/notifications/${id}`)
      .subscribe({ next: () => { this.loadExisting(); this.notifSvc.refresh(); } });
  }
 
  protected resetDraft(): void {
    this.draft.set(BLANK_DRAFT());
  }
 
  protected formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-CA', {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }
}