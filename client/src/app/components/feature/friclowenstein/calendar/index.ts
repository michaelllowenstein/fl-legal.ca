import {
  Component,
  ChangeDetectionStrategy,
  signal,
  inject,
  OnInit,
  computed
} from '@angular/core';
import { Router } from '@angular/router';
import { SlicePipe } from '@angular/common';
import { DialogService } from '@components/factory/dialog/service';
import { ConfirmDialog } from '@components/ui/dialog/confirm';
import { CalendarService, CalendarEvent } from '@core/services/calendar';
import { LoggerService } from '@core/services/logger';
import { AuthService } from '@core/services/auth';
import { NotificationDialog } from '@components/ui/dialog/notification';
import { FLIcon } from '@components/ui/icon';
import { SpinnerComponent } from '@components/ui/spinner';

@Component({
  selector:    'app-calendar',
  standalone:  true,
  imports:     [FLIcon, SpinnerComponent, SlicePipe],
  templateUrl: './index.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FricLowensteinCalendar implements OnInit {
  private auth: AuthService     = inject(AuthService);
  private calendar: CalendarService = inject(CalendarService);
  private dialog: DialogService   = inject(DialogService);
  private router: Router   = inject(Router);
  private log      = inject(LoggerService).child('calendar');
 
  events  = signal<CalendarEvent[]>([]);
  loading = signal(true);
 
  today        = new Date();
  currentYear  = signal(this.today.getFullYear());
  currentMonth = signal(this.today.getMonth());
 
  readonly monthNames = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ];
  readonly dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
 
  showForm   = signal(false);
  formTitle  = signal('');
  formDate   = signal('');
  formTime   = signal('');
  formDesc   = signal('');
  formSaving = signal(false);
  formError  = signal('');
 
  calendarDays = computed(() => this.buildCalendarDays(this.currentYear(), this.currentMonth()));
 
  eventsForDay(dateStr: string) {
    return this.events().filter((e: CalendarEvent) => e.date === dateStr);
  }
 
  async ngOnInit(): Promise<void> {
    if (!this.auth.isAuthenticated()) {
      this.log.warn('Unauthenticated access to calendar — redirecting to login');
      this.router.navigate(['/friclowenstein/login']);
      return;
    }
 
    this.log.info('Calendar page opened');
    await this.loadEvents();
  }
 
  async loadEvents() {
    this.loading.set(true);
    this.log.debug('Loading calendar events', {
      month: this.currentMonth() + 1,
      year:  this.currentYear(),
    });
 
    try {
      const data = await this.calendar.getEvents();
      this.events.set(data ?? []);
 
      // Log events by month for the current view
      const viewEvents = this.events().filter((e: CalendarEvent) =>
        e.date.startsWith(`${this.currentYear()}-${String(this.currentMonth() + 1).padStart(2, '0')}`)
      );
      this.log.info('Calendar events loaded', {
        total:     data.length,
        thisMonth: viewEvents.length,
        month:     this.monthNames[this.currentMonth()],
        year:      this.currentYear(),
      });
    } finally {
      this.loading.set(false);
    }
  }
 
  buildCalendarDays(year: number, month: number) {
    const first = new Date(year, month, 1);
    const last  = new Date(year, month + 1, 0);
    const days: { date: Date; dateStr: string; inMonth: boolean }[] = [];
 
    for (let i = 0; i < first.getDay(); i++) {
      const d = new Date(year, month, -first.getDay() + i + 1);
      days.push({ date: d, dateStr: this.toDateStr(d), inMonth: false });
    }
    for (let d = 1; d <= last.getDate(); d++) {
      const date = new Date(year, month, d);
      days.push({ date, dateStr: this.toDateStr(date), inMonth: true });
    }
    const remainder = days.length % 7;
    if (remainder > 0) {
      for (let i = 1; i <= 7 - remainder; i++) {
        const d = new Date(year, month + 1, i);
        days.push({ date: d, dateStr: this.toDateStr(d), inMonth: false });
      }
    }
    return days;
  }
 
  toDateStr(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
 
  isToday(dateStr: string) { return dateStr === this.toDateStr(this.today); }
 
  prevMonth() {
    this.log.trace('Calendar navigated to previous month');
    this.currentMonth.update((m: number) => {
      if (m === 0) { this.currentYear.update((y: number) => y - 1); return 11; }
      return m - 1;
    });
  }
 
  nextMonth() {
    this.log.trace('Calendar navigated to next month');
    this.currentMonth.update((m: number) => {
      if (m === 11) { this.currentYear.update((y: number) => y + 1); return 0; }
      return m + 1;
    });
  }
 
  async saveEvent() {
    if (!this.formTitle() || !this.formDate()) {
      this.formError.set('Title and date are required.');
      this.log.debug('Save event attempted with missing fields', {
        hasTitle: !!this.formTitle(),
        hasDate:  !!this.formDate(),
      });
      return;
    }
 
    this.formSaving.set(true);
    this.formError.set('');
 
    try {
      const created = await this.calendar.addEvent({
        title:       this.formTitle(),
        date:        this.formDate(),
        time:        this.formTime() || undefined,
        description: this.formDesc() || undefined,
      });
 
      this.dialog.open(NotificationDialog, {
        data: { message: 'Event added.', type: 'success' }
      });
 
      this.showForm.set(false);
      this.formTitle.set(''); this.formDate.set('');
      this.formTime.set('');  this.formDesc.set('');
      await this.loadEvents();
    } catch {
      this.formError.set('Failed to save event. Please try again.');
      // CalendarService already logged the error
    } finally {
      this.formSaving.set(false);
    }
  }
 
  async deleteEvent(event: CalendarEvent) {
    this.log.info('Delete event requested', { id: event.id, title: event.title });
 
    const ref = this.dialog.open(ConfirmDialog, {
      data: {
        title:        'Delete Event',
        message:      `Delete "${event.title}"? This cannot be undone.`,
        danger:       true,
        confirmLabel: 'Delete',
      },
    });
 
    const confirmed = await ref.closed;
    if (!confirmed) {
      this.log.debug('Delete event cancelled by user', { id: event.id });
      return;
    }
 
    try {
      await this.calendar.deleteEvent(event.id);
      this.dialog.open(NotificationDialog, {
        data: { message: 'Event deleted.', type: 'success' }
      });
      await this.loadEvents();
    } catch {
      this.dialog.open(NotificationDialog, {
        data: { message: 'Delete failed.', type: 'error' }
      });
    }
  }
 
  logout() {
    this.log.info('Lawyer logging out from calendar');
    this.auth.logout();
    this.router.navigate(['/']);
  }
}
