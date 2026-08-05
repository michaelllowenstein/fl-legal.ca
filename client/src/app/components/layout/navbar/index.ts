import {
  Component, OnInit, signal, inject,
  ChangeDetectionStrategy, HostListener,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { DialogService } from '@components/factory/dialog/service';
import { InquiryDialog } from '@components/ui/dialog/inquiry';
import { FLIcon } from '@components/ui/icon';
import { NotificationBell } from '@components/ui/notifications';

export interface MenuFLIcon {
  source: string;
  alt: string;
}

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [FLIcon, RouterLink, NotificationBell],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './index.html'
})
export class NavbarComponent {
  private dialog = inject(DialogService);
  webMenu = signal<MenuFLIcon>({
    source: 'assets/site/branding/logo-white-on-blue-small.png',
    alt: 'Fric, Lowenstein & Co. LLP'
  });
  mobileMenu = signal<MenuFLIcon>({
    source: 'assets/site/branding/logo-white-on-blue-small.png', 
    alt: 'Fric, Lowenstein & Co. LLP'
  });

  menuOpen = signal(false);
  scrolled = signal(false);

  navLinks = [
    { label: 'Home',         path: '/'              },
    { label: 'About Us',     path: '/about-us'      },
    { label: 'Areas of Law', path: '/areas-of-law'  },
    { label: 'Pricing',      path: '/pricing'       },
    { label: 'Blog',         path: '/blog'          },
    { label: 'FAQ',          path: '/faq'           },
  ];

  @HostListener('window:scroll')
  onScroll() { this.scrolled.set(window.scrollY > 10); }

  toggleMenu() { this.menuOpen.update((v: boolean) => !v); }

  openInquiry() {
    this.dialog.open(InquiryDialog);
  }
}
