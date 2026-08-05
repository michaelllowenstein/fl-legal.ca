import { SiteSection } from '@schema/models';
/**
 * Helpers for safely reading fields from SiteContent / SiteSection objects.
 * Use these in computed() properties rather than accessing nested fields
 * directly in templates — the compiler cannot narrow union types in templates.
 */

/** Extract a plain string from a SiteSection.content that may be string | string[]. */
export function sectionText(section: { content?: string | string[] } | undefined): string {
  if (!section) return '';
  const c = section.content;
  if (!c) return '';
  return Array.isArray(c) ? c.join(' ') : c;
}
 
/** Safely read a nested body content string. */
export function bodyText(site: { body?: { content?: string | string[] } } | undefined): string {
  return sectionText(site?.body);
}