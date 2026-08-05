// The dropdown panel that renders when the bell is clicked.
// Lists unread-first, then read, with per-item read/dismiss controls.
 
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService } from '@core/services/notification';
import { NotificationItem } from '../item';
 
@Component({
  selector: 'app-notification-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, NotificationItem],
  styleUrls: ['./index.scss'],
  templateUrl: './index.html'
})
export class NotificationPanel {
  protected readonly notifSvc: NotificationService = inject(NotificationService);
  readonly close = output<void>();
 
  protected unread() {
    return this.notifSvc.notifications().filter((n) => !n.isRead && !n.isDismissed);
  }
 
  protected read() {
    return this.notifSvc.notifications().filter((n) => n.isRead || n.isDismissed);
  }
 
  protected markAllRead(): void {
    this.notifSvc.unread().forEach((n) => this.notifSvc.markRead(n.id));
  }
}