import {
  Component,
  ChangeDetectionStrategy,
  signal,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EditorService } from '@core/services/editor';
import { injectDialogClose } from '@components/factory/dialog/tokens';
import { FLIcon } from '@components/ui/icon';
import { CommonModule } from '@angular/common';

@Component({
  selector:    'app-password-dialog',
  standalone:  true,
  templateUrl: './index.html',
  imports:     [FormsModule, FLIcon, CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PasswordDialog {
  private auth: EditorService  = inject(EditorService);
  private close = injectDialogClose<boolean>();
 
  password = '';
  loading  = signal(false);
  error    = signal('');
 
  async submit() {
    if (!this.password.trim()) {
      this.error.set('Password is required.');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    try {
      await this.auth.login(this.password);
      this.close(true);
    } catch {
      this.error.set('Incorrect password. Please try again.');
      this.loading.set(false);
    }
  }
 
  cancel() { this.close(false); }
}
