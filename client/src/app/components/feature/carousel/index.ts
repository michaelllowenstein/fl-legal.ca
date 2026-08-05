import {
  Component, OnInit, OnDestroy, signal, input,
  ChangeDetectionStrategy, computed,
} from '@angular/core';
import { FLIcon } from '@components/ui/icon';

export interface CarouselSlide {
  imageUrl: string;
  heading?: string;
  subheading?: string;
}

@Component({
  selector: 'app-carousel',
  standalone: true,
  imports: [FLIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './index.html',
  styles: `
    .w-max {
      margin-top: 50px;
      margin-bottom: 50px;
      text-align: center;
      width: 70vw !important;
      height: 500px !important;
      margin-left: 15vw !important;
      margin-right: 15vw !important;
    }
    `
})
export class CarouselComponent implements OnInit, OnDestroy {
  slides  = input.required<CarouselSlide[]>();
  height  = input<string>('480px');
  autoplay = input<boolean>(true);
  interval = input<number>(5000);

  currentIndex = signal(0);
  private timer?: ReturnType<typeof setInterval>;

  ngOnInit() {
    if (this.autoplay()) {
      this.timer = setInterval(() => this.next(), this.interval());
    }
  }

  ngOnDestroy() { clearInterval(this.timer); }

  next() {
    this.currentIndex.update((i: number) => (i + 1) % this.slides().length);
  }

  prev() {
    this.currentIndex.update((i: number) =>
      (i - 1 + this.slides().length) % this.slides().length
    );
  }

  goTo(index: number) { this.currentIndex.set(index); }
}
