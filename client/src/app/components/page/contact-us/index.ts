import {
  Component, ChangeDetectionStrategy, inject, OnInit,
  signal,
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { DialogService } from '@components/factory/dialog/service';
import { FLIcon } from '@components/ui/icon';
import { MapsLinkComponent } from '@components/feature/maps-link';
import { InquiryDialog } from '@components/ui/dialog/inquiry';
import { LoggerService } from '@core/services/logger';
import { SeoService } from '@core/services/seo';
import { env } from '@env/environment';

@Component({
  selector:    'app-contact-us',
  standalone:  true,
  imports:     [MapsLinkComponent, FLIcon],
  templateUrl: './index.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContactUsPage implements OnInit {
  private seo: SeoService =    inject(SeoService);
  private dialog: DialogService                  = inject(DialogService);
  private sanitizer: DomSanitizer = inject(DomSanitizer);
  private log                     = (inject(LoggerService) as LoggerService).child('contact-us');
 
  readonly officeName = env.maps?.pointOfInterest ?? 'Southcentre Executive Tower';
  readonly officeLatitude  = env.maps?.latitude  ?? 50.955083;
  readonly officeLongitude = env.maps?.longitude ?? -114.069988;

  readonly officeLat = signal<number>(this.officeLatitude);
  readonly officeLong = signal<number>(this.officeLongitude);
 
  readonly mapsEmbedUrl: SafeResourceUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
    env.mapsEmbedApiKey
      ? `https://www.google.com/maps/embed/v1/place?key=${env.mapsEmbedApiKey}&q=${encodeURIComponent(this.officeName)}`
      : `https://www.openstreetmap.org/export/embed.html?bbox=${this.officeLong() - 0.005},${this.officeLat() - 0.003},${this.officeLong() + 0.005},${this.officeLat() + 0.003}&layer=mapnik&marker=${this.officeLat},${this.officeLong()}`,
  );
 
  ngOnInit() {
    this.seo.set({
      title: 'Contact Us',
      description: 'Get in touch with Fric, Lowenstein & Co. LLP. Our Calgary law office is available to discuss your legal needs.',
    });
    const mapProvider = env.mapsEmbedApiKey ? 'google' : 'openstreetmap';
    this.log.info('Contact Us page loaded', {
      mapProvider,
      officeName: this.officeName,
    });
 
    if (!env.mapsEmbedApiKey) {
      this.log.debug('No mapsEmbedApiKey set — using OpenStreetMap fallback');
    }
  }
 
  openInquiry() {
    this.log.info('Inquiry dialog opened from Contact Us page');
    this.dialog.open(InquiryDialog);
  }
}
