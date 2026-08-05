import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class JsonHtmlUtil {
  /**
   * Parses a JSON string containing HTML and extracts its content
   * @param jsonString JSON string to parse
   * @returns Parsed HTML string
   */
  static parseHtmlFromJson(jsonString: string): string {
    try {
      const parsed = JSON.parse(jsonString);
      return parsed.content || '';
    } catch (error) {
      console.error('Invalid JSON format:', error);
      return '';
    }
  }

  // const jsonContent = '{"content": "<h3>Dynamic HTML Title</h3>"}';
  // const parsedHtml = JsonHtmlParserUtil.parseHtmlFromJson(jsonContent);
}