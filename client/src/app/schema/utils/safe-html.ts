import { DomSanitizer, SafeHtml } from "@angular/platform-browser";
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class SafeHtmlUtil {
  constructor(private sanitizer: DomSanitizer) {}

  /**
   * Safely transforms a string containing HTML into Angular-compatible SafeHtml
   * @param htmlString HTML string to be sanitized
   * @returns SafeHtml object
   */
  sanitizeHtml(htmlText: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(htmlText);
  }
  // <div [innerHTML]="safeHtmlUtil.sanitizeHtml(aboutUsSection.body)"></div>
}