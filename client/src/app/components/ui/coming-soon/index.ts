import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FLIcon } from '@app/components/ui/icon';

@Component({
  selector: 'app-coming-soon',
  standalone: true,
  imports: [RouterLink, FLIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './index.html'
})
export class ComingSoonComponent {}