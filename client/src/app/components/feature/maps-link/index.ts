import { Component, input, ChangeDetectionStrategy, signal , computed} from '@angular/core';
import { FLIcon } from '@components/ui/icon';

@Component({
  selector: 'app-maps-link',
  standalone: true,
  imports: [FLIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './index.html'
})
export class MapsLinkComponent {
  lat             = input<number>(0);
  long            = input<number>(0);
  pointOfInterest = input<string>('');
  label           = input<string>('Get Directions');

  mapsUrl = computed(() =>
    `https://www.google.com/maps/search/?api=1&query=${
      encodeURIComponent(this.pointOfInterest())
    }&ll=${this.lat()},${this.long()}`
  );
}
