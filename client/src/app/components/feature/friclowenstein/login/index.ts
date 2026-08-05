import {
  Component,
  ChangeDetectionStrategy,
  signal,
  inject,
} from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '@core/services/auth';
import { LoggerService } from '@core/services/logger';
import { FLIcon } from '../../../ui/icon';

@Component({
  selector:    'app-login',
  standalone:  true,
  imports:     [FormsModule, FLIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './index.html',
})
export class FricLowensteinLogin {
  private auth   = inject(AuthService);
  private router = inject(Router);
  private log    = inject(LoggerService).child('lawyer-login');
 
  username = '';
  password = '';
  loading  = signal(false);
  error    = signal('');
 
  async login() {
    if (!this.username || !this.password) {
      this.error.set('Username and password are required.');
      this.log.debug('Login form submitted with missing fields', {
        hasUsername: !!this.username,
        hasPassword: !!this.password,
      });
      return;
    }
 
    this.loading.set(true);
    this.error.set('');
 
    try {
      await this.auth.login(this.username, this.password);
      this.log.info('Lawyer login successful — navigating to calendar', { username: this.username });
      this.router.navigate(['/friclowenstein/calendar']);
    } catch (e: unknown) {
      // LawyerAuthService already logged the error in detail
      // Just set the user-facing message here
      this.error.set('Invalid credentials. Please try again.');
      this.log.debug('Showing login error to user', { username: this.username });
    } finally {
      this.loading.set(false);
    }
  }
}
