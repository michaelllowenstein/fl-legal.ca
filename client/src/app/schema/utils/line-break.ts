import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class LineBreakUtil {
  /**
   * Replaces newline characters with `<br>` tags for HTML rendering
   * @param text Text with line breaks
   * @returns Text with <br> tags
   */
  static preserveLineBreaks(text: string): string {
    return text.replace(/\n/g, '<br>');
  }
  // const formattedText = LineBreakUtil.preserveLineBreaks('Line 1\nLine 2');
  // <div [innerHTML]="safeHtmlUtil.sanitizeHtml(formattedText)"></div>
}
