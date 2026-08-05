// Sits in the site header. Shows an animated badge when there are unread notifications.
// Clicking toggles the NotificationPanel overlay.
 
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  HostListener,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService } from '@core/services/notification';
import { NotificationPanel } from '@components/ui/notifications/panel';
 
@Component({
  selector: 'app-notification-bell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, NotificationPanel],
  styleUrls: ['./index.scss'],
  templateUrl: './index.html',
})
export class NotificationBell {
  protected readonly notifSvc = inject(NotificationService);
  private readonly elRef = inject(ElementRef);
 
  protected readonly panelOpen = signal(false);
 
  togglePanel(): void {
    this.panelOpen.update((v) => !v);
  }
 
  closePanel(): void {
    this.panelOpen.set(false);
  }
 
  /** Close panel when clicking outside the component */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elRef.nativeElement.contains(event.target)) {
      this.panelOpen.set(false);
    }
  }
 
  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.panelOpen.set(false);
  }
}