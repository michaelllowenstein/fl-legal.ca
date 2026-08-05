import { WrapTextUtil } from "./wrap-text";
import { TruncTextUtil } from "./trunc-text";
import { DecodeHtmlUtil } from "./decode-html";
import { SafeHtmlUtil } from './safe-html';
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class SiteUtil {
  /**
   * Preprocesses content string: decodes HTML entities, truncates if needed, and wraps it with an element
   * @param content Original content string
   * @param maxLength Maximum length for truncation
   * @param wrapperTag Tag to wrap content
   * @param safeHtmlUtil Instance of SafeHtmlUtil
   * @returns Transformed SafeHtml
   */
  static preprocessContent(
    content: string,
    maxLength: number,
    wrapELem: string,
    safeHtml: SafeHtmlUtil,
  ): any {
    const decoded = DecodeHtmlUtil.decodeHtmlEntities(content);
    const truncated = TruncTextUtil.truncateText(decoded, maxLength);
    const wrapped = WrapTextUtil.wrapTextElement(truncated, wrapELem);
    return safeHtml.sanitizeHtml(wrapped);
  }
  // const processedContent = ContentTransformUtil.preprocessContent(
  //   member.practiceProfile,
  //   150,
  //   'p',
  //   this.safeHtmlUtil
  // );
  // <div [innerHTML]="processedContent"></div>

}