// Renders a single notification with type icon, content, CTA, and action buttons.
// Emits `read` and `dismissed` events upward.
 
import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationViewModel, NotificationType } from '@schema/models';

const TYPE_CONFIG: Record<NotificationType, { icon: string; accent: string; bg: string }> = {
  feature: {
    accent: '#3b82f6',
    bg: '#eff6ff',
    icon: `<path stroke-linecap="round" stroke-linejoin="round"
              d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5
                 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5
                 4.5 0 00-3.09 3.09z"/>`,
  },
  info: {
    accent: '#0ea5e9',
    bg: '#f0f9ff',
    icon: `<path stroke-linecap="round" stroke-linejoin="round"
              d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0
                 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"/>`,
  },
  warning: {
    accent: '#f59e0b',
    bg: '#fffbeb',
    icon: `<path stroke-linecap="round" stroke-linejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0
                 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697
                 16.126zM12 15.75h.007v.008H12v-.008z"/>`,
  },
};
 
@Component({
  selector: 'app-notification-item',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  styleUrls: ['./index.scss'],
  templateUrl: './index.html'
})
export class NotificationItem {
  readonly notification = input.required<NotificationViewModel>();
  readonly read = output<string>();
  readonly dismissed = output<string>();
 
  protected bodyExpanded = false;
 
  protected typeConfig() {
    return TYPE_CONFIG[this.notification().type];
  }
 
  protected onRead(): void {
    this.read.emit(this.notification().id);
  }
 
  protected onDismiss(): void {
    this.dismissed.emit(this.notification().id);
  }
 
  protected onCtaClick(): void {
    // Also marks as read when user follows the CTA link
    if (!this.notification().isRead) {
      this.read.emit(this.notification().id);
    }
  }
 
  protected formatDate(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    const diffH = Math.floor(diffMs / 3_600_000);
    const diffD = Math.floor(diffMs / 86_400_000);
 
    if (diffMin < 1)  return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffH < 24)   return `${diffH}h ago`;
    if (diffD < 7)    return `${diffD}d ago`;
 
    return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
  }
}