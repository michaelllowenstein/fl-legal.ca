import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class TruncTextUtil {
  /**
   * Truncates text to a specified length and appends ellipses if needed
   * @param text Text to be truncated
   * @param maxLength Maximum number of characters
   * @returns Truncated text
   */
  static truncateText(text: string, maxLength: number): string {
    if (text.length > maxLength) {
      return `${text.substring(0, maxLength)}...`;
    }
    return text;
  }
  // member.practiceProfile = TextUtil.truncateText(member.practiceProfile, 150);
}