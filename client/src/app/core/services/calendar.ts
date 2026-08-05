import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { env } from '../../../environments/environment';
import { LoggerService } from './logger';

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;       // YYYY-MM-DD
  time?: string;      // HH:MM (24h)
  description?: string;
}

export type NewCalendarEvent = Omit<CalendarEvent, 'id'>;

@Injectable({ providedIn: 'root' })
export class CalendarService {
  private http = inject(HttpClient);
  private log  = inject(LoggerService).child('calendar');
  private base = `${env.apiURL}/api/calendar`;
 
  async getEvents(): Promise<CalendarEvent[]> {
    const t0 = performance.now();
    this.log.debug('Fetching calendar events');
 
    try {
      const events = await firstValueFrom(this.http.get<CalendarEvent[]>(this.base));
      const ms     = Math.round(performance.now() - t0);
      this.log.info('Calendar events fetched', { count: events.length, ms });
      return events;
    } catch (e: unknown) {
      const err = e as HttpErrorResponse;
      this.log.error('Failed to fetch calendar events', {
        status:  err?.status,
        message: err?.message,
      });
      return [];
    }
  }
 
  async addEvent(event: NewCalendarEvent): Promise<CalendarEvent> {
    const t0 = performance.now();
    this.log.info('Adding calendar event', { title: event.title, date: event.date });
 
    try {
      const created = await firstValueFrom(
        this.http.post<CalendarEvent>(this.base, event)
      );
      const ms = Math.round(performance.now() - t0);
      this.log.info('Calendar event added', { id: created.id, title: created.title, ms });
      return created;
    } catch (e: unknown) {
      const err = e as HttpErrorResponse;
      this.log.error('Failed to add calendar event', {
        title:   event.title,
        status:  err?.status,
        message: err?.message,
      });
      throw e;
    }
  }
 
  async deleteEvent(id: string): Promise<void> {
    const t0 = performance.now();
    this.log.info('Deleting calendar event', { id });
 
    try {
      await firstValueFrom(this.http.delete(`${this.base}/${id}`));
      const ms = Math.round(performance.now() - t0);
      this.log.info('Calendar event deleted', { id, ms });
    } catch (e: unknown) {
      const err = e as HttpErrorResponse;
      this.log.error('Failed to delete calendar event', {
        id,
        status:  err?.status,
        message: err?.message,
      });
      throw e;
    }
  }
}
