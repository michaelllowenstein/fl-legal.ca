import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class DecodeHtmlUtil {
  /**
   * Decodes HTML entities in a string
   * @param input HTML string with entities
   * @returns Decoded string
   */
  static decodeHtmlEntities(input: string): string {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = input;
    return textarea.value;
  }
  // const decodedText = HtmlEntityUtil.decodeHtmlEntities('&lt;strong&gt;Hello&lt;/strong&gt;');
  // console.log(decodedText); // Outputs: <strong>Hello</strong>
}