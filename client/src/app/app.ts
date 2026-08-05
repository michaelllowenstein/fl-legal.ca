import { Component, ChangeDetectionStrategy, inject, signal, isDevMode } from '@angular/core';
import { RouterOutlet, Router, NavigationStart, NavigationEnd, NavigationCancel, NavigationError, Navigation} from '@angular/router';
import { CommonModule, NgIf } from '@angular/common';
import { NavbarComponent } from '@components/layout/navbar';
import { SpinnerComponent } from '@components/ui/spinner';
import { routerSlideAnimation, ROUTE_ORDER } from '@animations/app';
import { routerAnimations } from '@animations/route';
import { StylusService } from '@core/services/stylus'

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NgIf, NavbarComponent, SpinnerComponent, CommonModule],
  animations: [routerAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-content">
      <app-navbar></app-navbar>
      <app-spinner *ngIf="isLoading()"></app-spinner>
      <main [@routeAnimations]="prepareRoute(outlet)" style="position:relative;">
        <router-outlet #outlet="outlet"></router-outlet>
      </main>
    </div>
  `,
  styles: `
    app-spinner {
      position: fixed; top: 0; left: 0;
      height: 100vh; width: 100vw;
      display: flex; align-items: center; justify-content: center;
      background: rgba(255,255,255,0.8); z-index: 1000;
    }
    `
})
export class App {
  private readonly router: Router = inject(Router);

  readonly isLoading = signal(false);
  private direction = '100%';
  private directionInverse = '-100%';

  constructor() {
    if (isDevMode()) (inject(StylusService) as StylusService).init();
    this.router.events.subscribe((event: any) => {
      if (event instanceof NavigationStart) {
        this.isLoading.set(true);
      } else if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError
      ) {
        this.isLoading.set(false);
      }
    });
  }

  prepareRoute(outlet: RouterOutlet): unknown {
    const fromState = outlet?.activatedRouteData?.['animation'] ?? '';
    const toState = this.router.routerState.snapshot.url ?? '';
    this.setDirection(fromState, toState);
    return {
      value: outlet?.activatedRouteData?.['animation'] ?? null,
      params: { direction: this.direction, directionInverse: this.directionInverse },
    };
  }

  private setDirection(fromState: string, toState: string): void {
    const fromIndex = ROUTE_ORDER.indexOf(fromState);
    const toIndex = ROUTE_ORDER.indexOf(toState);
    if (fromIndex < toIndex) {
      this.direction = '-100%';
      this.directionInverse = '100%';
    } else {
      this.direction = '100%';
      this.directionInverse = '-100%';
    }
  }
}
