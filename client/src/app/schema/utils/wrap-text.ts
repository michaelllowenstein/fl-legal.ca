import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class WrapTextUtil {
  /**
   * Wraps text content with a specified HTML element tag
   * @param text Text to wrap
   * @param tag HTML tag to wrap with
   * @returns Wrapped text
   */
  static wrapTextElement(text: string, tag: string): string {
    return `<${tag}>${text}</${tag}>`;
  }

  // const highlightedText = TextUtil.wrapTextWithTag('Highlighted Content', 'strong');
}