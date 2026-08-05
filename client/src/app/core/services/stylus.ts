/**
 * style-inspector.service.ts
 *
 * DEV-ONLY live style editor. Click any element, tweak styles in a floating
 * panel, then copy the resulting CSS rule straight into styles.scss.
 *
 * Activation (three ways):
 *   1. Keyboard:     Alt + Shift + S  (toggles the inspector on/off)
 *   2. Console:      window.__flStyle.toggle()
 *   3. Service call: inject(StyleInspectorService).toggle()
 *
 * Usage:
 *   1. Press Alt+Shift+S — cursor changes to crosshair
 *   2. Click any element on the page
 *   3. Type CSS in the panel (e.g.  background: #1a3a5c; color: white; )
 *      — styles apply live to the element as you type
 *   4. Use the class/id/tag selector buttons to pick the right selector
 *   5. Hit "Copy rule" — pastes  .selector { your-css }  to clipboard
 *   6. Paste into styles.scss and you're done
 *   7. Press Esc or Alt+Shift+S to close
 *
 * Install:
 *   1. Drop this file in  @core/services/stylus.ts
 *   2. Add to app.config.ts or AppComponent constructor (dev only):
 *
 *     import { isDevMode } from '@angular/core';
 *     import { StyleInspectorService } from '@core/services/stylus';
 *
 *     // In AppComponent:
 *     constructor() {
 *       if (isDevMode()) inject(StyleInspectorService).init();
 *     }
 *
 *   The service self-destructs in production (isDevMode() guard).
 */

import { Injectable, isDevMode } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class StylusService {
  private active       = false;
  private panel:       HTMLDivElement | null = null;
  private overlay:     HTMLDivElement | null = null;
  private target:      HTMLElement | null = null;
  private savedOutline = '';
  private textarea:    HTMLTextAreaElement | null = null;
  private selectorEl:  HTMLSpanElement | null = null;
  private styleSheet:  CSSStyleSheet | null = null;
  private ruleIndex    = -1;

  // ── Public API ─────────────────────────────────────────────────────────────

  init() {
    if (!isDevMode()) return;

    // Inject a <style> tag we own
    const style = document.createElement('style');
    document.head.appendChild(style);
    this.styleSheet = style.sheet!;

    // Keyboard shortcut: Alt + Shift + S
    document.addEventListener('keydown', (e) => {
      if (e.altKey && e.shiftKey && e.key === 'S') { e.preventDefault(); this.toggle(); }
      if (e.key === 'Escape' && this.active) this.deactivate();
    });

    // DevTools handle
    (window as any).__flStyle = {
      toggle:     () => this.toggle(),
      deactivate: () => this.deactivate(),
    };

    console.info(
      '%c[fl-style] Inspector ready — Alt+Shift+S to activate | window.__flStyle.toggle()',
      'color:#b8932a;font-style:italic;font-size:11px'
    );
  }

  toggle() { this.active ? this.deactivate() : this.activate(); }

  // ── Activate ───────────────────────────────────────────────────────────────

  private activate() {
    this.active = true;
    document.body.style.cursor = 'crosshair';

    // Semi-transparent click catcher so we intercept before Angular router
    this.overlay = document.createElement('div');
    Object.assign(this.overlay.style, {
      position: 'fixed', inset: '0', zIndex: '99998',
      cursor: 'crosshair', background: 'transparent',
    });
    this.overlay.addEventListener('click', (e) => this.onPick(e));
    this.overlay.addEventListener('mousemove', (e) => this.onHover(e));
    document.body.appendChild(this.overlay);

    this.buildPanel();
    console.info('%c[fl-style] Active — click an element', 'color:#b8932a');
  }

  // ── Pick element on click ─────────────────────────────────────────────────

  private onHover(e: MouseEvent) {
    // Briefly hide overlay so elementFromPoint can see underneath
    this.overlay!.style.pointerEvents = 'none';
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    this.overlay!.style.pointerEvents = '';
    if (!el || el === this.panel || this.panel?.contains(el)) return;
    if (this.target && this.target !== el) {
      this.target.style.outline = this.savedOutline;
    }
    this.target = el;
    this.savedOutline = el.style.outline;
    el.style.outline = '2px solid #b8932a';
  }

  private onPick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    this.overlay!.style.pointerEvents = 'none';
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    this.overlay!.style.pointerEvents = '';

    if (!el || el === this.panel || this.panel?.contains(el)) return;

    // Restore previous target outline
    if (this.target && this.target !== el) {
      this.target.style.outline = this.savedOutline;
    }

    this.target = el;
    this.savedOutline = '';
    el.style.outline = '2px solid #b8932a';

    this.updatePanel(el);
  }

  // ── Panel ─────────────────────────────────────────────────────────────────

  private buildPanel() {
    const p = document.createElement('div');
    p.id = 'fl-style-panel';
    Object.assign(p.style, {
      position:     'fixed',
      bottom:       '24px',
      right:        '24px',
      width:        '340px',
      background:   '#0f2235',
      border:       '1px solid #b8932a',
      borderRadius: '12px',
      boxShadow:    '0 8px 40px rgba(0,0,0,0.5)',
      zIndex:       '99999',
      fontFamily:   'monospace',
      fontSize:     '12px',
      color:        '#e2e8f0',
      overflow:     'hidden',
    });

    p.innerHTML = `
      <div style="padding:10px 14px;background:#1a3a5c;display:flex;align-items:center;justify-content:space-between;cursor:move">
        <span style="font-size:11px;font-weight:600;letter-spacing:.08em;color:#b8932a;text-transform:uppercase">
          Style Inspector
        </span>
        <span style="color:#64748b;font-size:11px">Alt+Shift+S to close</span>
      </div>

      <div style="padding:10px 14px;border-bottom:1px solid #1e3a5c">
        <div style="font-size:10px;color:#64748b;margin-bottom:5px;text-transform:uppercase;letter-spacing:.06em">
          Target element
        </div>
        <div id="fli-tag"  style="color:#7dd3fc;margin-bottom:3px;font-size:11px">— click an element —</div>
        <div id="fli-sel-row" style="display:flex;gap:5px;flex-wrap:wrap;margin-top:6px"></div>
      </div>

      <div style="padding:10px 14px;border-bottom:1px solid #1e3a5c">
        <div style="font-size:10px;color:#64748b;margin-bottom:5px;text-transform:uppercase;letter-spacing:.06em">
          Live CSS
        </div>
        <textarea id="fli-css" spellcheck="false"
          placeholder="background: #1a3a5c;&#10;color: white;&#10;border-radius: 8px;"
          style="width:100%;height:110px;background:#0a1628;border:1px solid #1e3a5c;
                 border-radius:6px;padding:8px;color:#a5f3fc;font-family:monospace;
                 font-size:12px;line-height:1.6;resize:vertical;outline:none;
                 box-sizing:border-box"></textarea>
      </div>

      <div id="fli-selector-display"
        style="padding:8px 14px;border-bottom:1px solid #1e3a5c;
               font-size:11px;color:#94a3b8;min-height:28px">
        selector: —
      </div>

      <div style="padding:10px 14px;display:flex;gap:6px">
        <button id="fli-copy"
          style="flex:1;padding:7px;background:#b8932a;border:none;border-radius:6px;
                 color:#0f2235;font-weight:700;font-size:12px;cursor:pointer;
                 font-family:monospace">
          Copy rule
        </button>
        <button id="fli-clear"
          style="padding:7px 12px;background:transparent;border:1px solid #334155;
                 border-radius:6px;color:#64748b;font-size:12px;cursor:pointer;
                 font-family:monospace">
          Clear
        </button>
        <button id="fli-close"
          style="padding:7px 12px;background:transparent;border:1px solid #334155;
                 border-radius:6px;color:#64748b;font-size:12px;cursor:pointer;
                 font-family:monospace">
          ✕
        </button>
      </div>
    `;

    document.body.appendChild(p);
    this.panel = p;

    // Wire up textarea live-apply
    this.textarea = p.querySelector('#fli-css')!;
    this.textarea.addEventListener('input', () => this.applyLive());

    // Wire up buttons
    p.querySelector('#fli-copy')!.addEventListener('click', () => this.copyRule());
    p.querySelector('#fli-clear')!.addEventListener('click', () => this.clearStyles());
    p.querySelector('#fli-close')!.addEventListener('click', () => this.deactivate());

    // Make panel draggable
    this.makeDraggable(p, p.querySelector('div')!);

    this.selectorEl = p.querySelector('#fli-selector-display');
  }

  private updatePanel(el: HTMLElement) {
    const tag   = el.tagName.toLowerCase();
    const id    = el.id   ? `#${el.id}` : '';
    const cls   = el.classList.length
      ? '.' + Array.from(el.classList)
          .filter(c => !c.startsWith('ng-') && c !== 'fl-style-selected')
          .slice(0, 3).join('.')
      : '';

    // Tag display
    const tagEl = this.panel!.querySelector('#fli-tag')!;
    tagEl.textContent = `<${tag}${id}${cls ? ' class="…"' : ''}>`;

    // Selector pills
    const row = this.panel!.querySelector('#fli-sel-row')!;
    row.innerHTML = '';
    const options: [string, string][] = [];
    if (id)  options.push([id, `#${el.id}`]);
    if (cls) options.push([cls, cls]);
    options.push([tag, tag]);

    let active = options[0]?.[0] ?? tag;

    options.forEach(([sel]) => {
      const btn = document.createElement('button');
      btn.textContent = sel;
      Object.assign(btn.style, {
        padding: '2px 8px', borderRadius: '4px', fontSize: '11px',
        cursor: 'pointer', border: '1px solid #334155',
        background: sel === active ? '#1a3a5c' : 'transparent',
        color: sel === active ? '#7dd3fc' : '#64748b',
        fontFamily: 'monospace',
      });
      btn.addEventListener('click', () => {
        active = sel;
        row.querySelectorAll('button').forEach((b: Element) => {
          (b as HTMLElement).style.background = 'transparent';
          (b as HTMLElement).style.color = '#64748b';
        });
        btn.style.background = '#1a3a5c';
        btn.style.color = '#7dd3fc';
        this.updateSelectorDisplay(sel);
        this.applyLive();
      });
      row.appendChild(btn);
    });

    this.updateSelectorDisplay(active);

    // Seed textarea with element's current inline styles if any
    if (this.textarea && el.style.cssText) {
      this.textarea.value = el.style.cssText.split(';').filter(Boolean)
        .map(s => s.trim() + ';').join('\n');
    }
  }

  private updateSelectorDisplay(sel: string) {
    if (this.selectorEl) {
      this.selectorEl.innerHTML =
        `<span style="color:#64748b">selector:</span> <span style="color:#7dd3fc">${sel}</span>`;
    }
  }

  private getActiveSelector(): string {
    const row = this.panel?.querySelector('#fli-sel-row');
    if (!row) return this.target?.tagName.toLowerCase() ?? 'element';
    const active = row.querySelector('button[style*="1a3a5c"]') as HTMLButtonElement | null;
    return active?.textContent ?? this.target?.tagName.toLowerCase() ?? 'element';
  }

  private applyLive() {
    if (!this.target || !this.textarea) return;

    // Clear our injected rule
    if (this.ruleIndex >= 0 && this.styleSheet) {
      try { this.styleSheet.deleteRule(this.ruleIndex); } catch {}
      this.ruleIndex = -1;
    }

    const css = this.textarea.value.trim();
    if (!css) return;

    const sel = this.getActiveSelector();
    try {
      this.ruleIndex = this.styleSheet!.insertRule(`${sel} { ${css} }`, 0);
    } catch {
      // Invalid CSS mid-type — silently ignore
    }
  }

  // ── Copy final rule to clipboard ─────────────────────────────────────────

  private copyRule() {
    if (!this.textarea) return;
    const css = this.textarea.value.trim();
    const sel = this.getActiveSelector();
    const rule = `${sel} {\n  ${css.split('\n').join('\n  ')}\n}`;

    navigator.clipboard?.writeText(rule).then(() => {
      const btn = this.panel?.querySelector('#fli-copy') as HTMLButtonElement;
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { if (btn) btn.textContent = orig; }, 1500);
      }
    });
  }

  // ── Clear applied styles ──────────────────────────────────────────────────

  private clearStyles() {
    if (this.textarea) this.textarea.value = '';
    if (this.ruleIndex >= 0 && this.styleSheet) {
      try { this.styleSheet.deleteRule(this.ruleIndex); } catch {}
      this.ruleIndex = -1;
    }
  }

  // ── Deactivate ────────────────────────────────────────────────────────────

  deactivate() {
    this.active = false;
    document.body.style.cursor = '';

    if (this.target) {
      this.target.style.outline = this.savedOutline;
      this.target = null;
    }

    this.overlay?.remove();
    this.overlay = null;
    this.panel?.remove();
    this.panel = null;

    // Keep injected rule so styles persist after closing for comparison
    // (they'll vanish on next page refresh naturally)
    console.info('%c[fl-style] Inspector closed', 'color:#64748b;font-style:italic');
  }

  // ── Drag panel ────────────────────────────────────────────────────────────

  private makeDraggable(panel: HTMLElement, handle: HTMLElement) {
    let ox = 0, oy = 0;
    handle.addEventListener('mousedown', (e) => {
      ox = e.clientX - panel.offsetLeft;
      oy = e.clientY - panel.offsetTop;
      const onMove = (ev: MouseEvent) => {
        panel.style.left   = (ev.clientX - ox) + 'px';
        panel.style.top    = (ev.clientY - oy) + 'px';
        panel.style.right  = 'auto';
        panel.style.bottom = 'auto';
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }
}