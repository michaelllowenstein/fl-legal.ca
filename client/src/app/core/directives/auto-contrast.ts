/**
 * auto-contrast.directive.ts
 *
 * Reads the computed background color of the host element (or an ancestor),
 * calculates its relative luminance, and automatically assigns a light or
 * dark text color to maintain WCAG AA contrast (≥4.5:1 ratio).
 *
 * Usage
 * ─────
 *   <!-- Use defaults: dark text on light bg, white text on dark bg -->
 *   <p appAutoContrast>Some text</p>
 *
 *   <!-- Custom colors instead of pure black/white -->
 *   <p appAutoContrast darkColor="#1a3a5c" lightColor="#f5f0e8">Some text</p>
 *
 *   <!-- Walk up to 4 ancestor levels to find a non-transparent background -->
 *   <p appAutoContrast [ancestorDepth]="4">Some text</p>
 *
 *   <!-- Skip re-checking on resize (static layouts) -->
 *   <p appAutoContrast [watchResize]="false">Some text</p>
 *
 * How it works
 * ────────────
 * 1. Reads window.getComputedStyle(element).backgroundColor walking up
 *    ancestor nodes until a non-transparent color is found.
 * 2. Parses the rgb() value and calculates relative luminance per the
 *    WCAG 2.1 formula (IEC 61966-2-1 gamma correction).
 * 3. Sets element.style.color to darkColor if the background is light,
 *    lightColor if it is dark.
 * 4. Subscribes to a ResizeObserver so the color re-evaluates if the
 *    element moves into a differently-coloured region on resize.
 *
 * Breakpoint-aware
 * ────────────────
 * The ResizeObserver re-runs the contrast check whenever the host element
 * is resized. This covers the common case where a Tailwind responsive
 * utility changes the background at a breakpoint (e.g. bg-white md:bg-brand).
 *
 * CSS custom property output
 * ──────────────────────────
 * In addition to setting style.color, the directive also writes
 * --fl-contrast-color on the host element so child pseudo-elements,
 * ::placeholder, and SVG fill can pick it up:
 *
 *   .my-icon { fill: var(--fl-contrast-color, currentColor); }
 */

import {
  Directive, ElementRef, Input, OnInit, OnDestroy,
  Renderer2, NgZone, inject, input, effect,
} from '@angular/core';

@Directive({
  selector:   '[appAutoContrast]',
  standalone: true,
})
export class AutoContrastDirective implements OnInit, OnDestroy {

  // ── Inputs ──────────────────────────────────────────────────────────────────

  /** Text color applied when background is LIGHT. Defaults to brand navy. */
  darkColor   = input<string>('#1a3a5c');

  /** Text color applied when background is DARK. Defaults to brand cream. */
  lightColor  = input<string>('#f5f0e8');

  /**
   * How many ancestor levels to walk when the host element itself has a
   * transparent background. Default 5 covers most layout nesting depths.
   */
  ancestorDepth = input<number>(5);

  /**
   * Whether to re-evaluate contrast on resize.
   * Set to false for static layouts to skip the ResizeObserver overhead.
   */
  watchResize = input<boolean>(true);

  // ── DI ──────────────────────────────────────────────────────────────────────

  private el       = inject(ElementRef<HTMLElement>);
  private renderer = inject(Renderer2);
  private zone     = inject(NgZone);

  // ── State ────────────────────────────────────────────────────────────────────

  private observer:  ResizeObserver | null = null;
  private lastColor: string | null = null;

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  ngOnInit() {
    this.apply();

    if (this.watchResize()) {
      // Run outside Angular zone — ResizeObserver fires frequently and
      // we only need a zone re-entry when the color actually changes.
      this.zone.runOutsideAngular(() => {
        this.observer = new ResizeObserver(() => this.apply());
        this.observer.observe(this.el.nativeElement);
      });
    }
  }

  ngOnDestroy() {
    this.observer?.disconnect();
  }

  // ── Core logic ─────────────────────────────────────────────────────────────

  private apply() {
    const bg = this.resolveBackground();
    if (!bg) return;

    const rgb = this.parseRgb(bg);
    if (!rgb) return;

    const luminance = this.relativeLuminance(rgb);

    // WCAG contrast ratio against white (L=1): (1 + 0.05) / (L + 0.05)
    // We choose dark text when the background is light enough that
    // white text would fall below 4.5:1.
    const contrastWithWhite = (1.05) / (luminance + 0.05);
    const useDark = contrastWithWhite < 4.5;

    const color = useDark ? this.darkColor() : this.lightColor();

    // Only write to DOM if the color actually changed — avoids layout thrash
    if (color === this.lastColor) return;
    this.lastColor = color;

    this.zone.run(() => {
      this.renderer.setStyle(this.el.nativeElement, 'color', color);
      this.renderer.setStyle(this.el.nativeElement, '--fl-contrast-color', color);
    });
  }

  // ── Background resolution ──────────────────────────────────────────────────
  //
  // Walks up the DOM until a non-transparent background-color is found.
  // Stops at <body> or after ancestorDepth levels.

  private resolveBackground(): string | null {
    let node: HTMLElement | null = this.el.nativeElement;
    let depth = 0;
    const maxDepth = this.ancestorDepth();

    while (node && depth <= maxDepth) {
      const bg = window.getComputedStyle(node).backgroundColor;
      if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') {
        return bg;
      }
      node  = node.parentElement;
      depth++;
    }

    // Fallback: assume white background
    return 'rgb(255, 255, 255)';
  }

  // ── WCAG relative luminance ────────────────────────────────────────────────
  //
  // https://www.w3.org/TR/WCAG21/#dfn-relative-luminance

  private parseRgb(color: string): [number, number, number] | null {
    const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return null;
    return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])];
  }

  private relativeLuminance([r, g, b]: [number, number, number]): number {
    const linearise = (c: number) => {
      const s = c / 255;
      return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);
  }
}
