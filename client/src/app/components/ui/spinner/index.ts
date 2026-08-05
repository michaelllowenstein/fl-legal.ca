import { Component, input, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-spinner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './index.html'
})
export class SpinnerComponent {
  size = input<'sm' | 'md' | 'lg'>('md');

  sizeClass(): string {
    return { sm: 'w-6 h-6', md: 'w-10 h-10', lg: 'w-16 h-16' }[this.size()];
  }
}
