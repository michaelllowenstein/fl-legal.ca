import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Inject,
  OnDestroy,
  PLATFORM_ID,
  ViewChild,
  input,
  isDevMode
} from '@angular/core';

import { isPlatformBrowser } from '@angular/common';
import type * as Leaflet from 'leaflet';

@Component({
  selector: 'app-office-map',
  standalone: true,
    templateUrl: './index.html',
    styleUrls: ['./index.scss'], 
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OfficeMap implements AfterViewInit, OnDestroy {
    @ViewChild('mapContainer') mapContainer!: ElementRef<HTMLDivElement>;readonly zoom = input(16);

  readonly office = {
    name: 'Fric, Lowenstein & Co. LLP',
    address: '#750, 11012 Macleod Trail S.E.',
    city: 'Calgary, Alberta T2J 7E4',
    latitude: 50.95492,
    longitude: -114.06999
  };

  readonly directionsUrl =
    'https://www.openstreetmap.org/directions?' +
    new URLSearchParams({
      engine: 'fossgis_osrm_car',
      route: `;${this.office.latitude},${this.office.longitude}`
    }).toString();

  private map?: Leaflet.Map;
  private observer?: IntersectionObserver;
  private destroyed = false;

  readonly isBrowser: boolean;

  constructor(
    @Inject(PLATFORM_ID) platformId: object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngAfterViewInit(): void {
    if (!this.isBrowser) return;

    const element = this.mapContainer.nativeElement;

    if (!('IntersectionObserver' in window)) {
      void this.initializeMap();
      return;
    }

    this.observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        this.observer?.disconnect();
        void this.initializeMap();
      }
    }, { rootMargin: '150px' });

    this.observer.observe(element);
  }

  private async initializeMap(): Promise<void> {
    if (this.map || this.destroyed) return;

    try {
      // Dynamic import keeps Leaflet out of SSR.
      const L = await import('leaflet');

      if (this.destroyed) return;

      const position: Leaflet.LatLngExpression = [
        this.office.latitude,
        this.office.longitude
      ];

      const map = L.map(
        this.mapContainer.nativeElement,
        {
          center: position,
          zoom: this.zoom(),
          scrollWheelZoom: false,
          zoomControl: true
        }
      );

      this.map = map;

      L.tileLayer(
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">' +
            'OpenStreetMap</a> contributors'
        }
      ).addTo(map);

      const icon = L.divIcon({
        className: 'office-marker',
        html: `
          <span class="office-marker__pin">
            <span class="office-marker__center"></span>
          </span>
        `,
        iconSize: [38, 46],
        iconAnchor: [19, 42],
        popupAnchor: [0, -38]
      });

      const popup = document.createElement('div');
      popup.className = 'office-map-popup';

      const title = document.createElement('strong');
      title.textContent = this.office.name;

      const address = document.createElement('p');
      address.textContent =
        `${this.office.address}, ${this.office.city}`;

      const directions = document.createElement('a');
      directions.href = this.directionsUrl;
      directions.target = '_blank';
      directions.rel = 'noopener noreferrer';
      directions.textContent = 'Get Directions →';

      popup.append(title, address, directions);

      L.marker(position, {
        icon,
        title: this.office.name,
        alt: 'Office location'
      })
        .addTo(map)
        .bindPopup(popup);

      requestAnimationFrame(() => {
        if (!this.destroyed) map.invalidateSize();
      });
    } catch (error) {
      if (isDevMode()) {
        console.error('Office map initialization failed', error);
      }

      this.map?.remove();
      this.map = undefined;
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.observer?.disconnect();
    this.map?.remove();
    this.map = undefined;
  }
}