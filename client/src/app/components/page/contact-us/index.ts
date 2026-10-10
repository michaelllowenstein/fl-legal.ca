import {
  Component, ChangeDetectionStrategy, inject, OnInit,
  signal,
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { DialogService } from '@components/factory/dialog/service';
import { InquiryDialog } from '@components/ui/dialog/inquiry';
import { OfficeMap } from '@components/feature/office-map';
import { LoggerService } from '@core/services/logger';
import { SeoService } from '@core/services/seo';
import { FLIcon } from '@components/ui/icon';
import { env } from '@env/environment';

@Component({
  selector:    'app-contact-us',
  standalone:  true,
  imports:     [OfficeMap, FLIcon],
  templateUrl: './index.html',
  styles: [`
    .contact-content {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 52px;
      max-width: 1050px;
      margin: 0 auto;
      padding: 45px 24px;
      align-items: start;
    }

    .contact-map-column {
      min-width: 0;
    }

    @media (max-width: 768px) {
      .contact-content {
        grid-template-columns: 1fr;
        gap: 32px;
        padding: 30px 20px;
      }
    }
    `],
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
 
  ngOnInit() {
    this.seo.set({
      title: 'Contact Us',
      description: 'Get in touch with Fric, Lowenstein & Co. LLP. Our Calgary law office is available to discuss your legal needs.',
    });
    const mapProvider = 'openstreetmap';
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
