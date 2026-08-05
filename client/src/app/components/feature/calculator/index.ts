import {
    Component,
    ChangeDetectionStrategy,
    signal,
    computed,
    inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgClass } from '@angular/common';
import { Router } from '@angular/router';
import { FLIcon } from '@components/ui/icon';
import { ltoFee, round2 } from '@schema/utils';
import { TabId, CalcResult, ResultLine } from '@schema/models';
import { TABS, WILL_LABELS, GST_RATE } from '@schema/constants';
import { injectDialogClose } from '@components/factory/dialog/tokens';
import { DebugService } from '@core/services/debug';
import {
    CalculatorConfigService,
    CalculatorConfig,
    CalculatorFieldConfig,
    DEFAULT_CALCULATOR_CONFIG,
} from '@core/services/calc-config';

// ── Component ─────────────────────────────────────────────────────────────────

const ADMIN_PASSWORD = 'calculator';
const SPINNER_MIN_MS = 600;

type CalculatorMode = 'calculator' | 'settings';

@Component({
    selector: 'app-calculator',
    standalone: true,
    imports: [FormsModule, FLIcon],
    templateUrl: './index.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
    styles: [`
    :host .fl-label {
      @apply block font-sans text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5;
    }
    :host .fl-input {
      @apply w-full border rounded-lg px-3 py-2.5 font-sans text-sm text-brand border-gray-300
             focus:outline-none focus:ring-2 focus:ring-brand-light focus:border-transparent
             transition-shadow;
    }
    :host .fl-hint {
      @apply mt-1.5 font-sans text-[11px] text-gray-400 leading-relaxed;
    }
    @keyframes fl-spin {
      to { transform: rotate(360deg); }
    }
    :host .fl-spinner {
      display: inline-block;
      width: 1.25rem;
      height: 1.25rem;
      border: 2px solid #e5e7eb;
      border-top-color: #b8932a;
      border-radius: 50%;
      animation: fl-spin 0.6s linear infinite;
    }
  `],
})
export class Calculator {
    private router = inject(Router);
    private log    = inject(DebugService).ns('Calculator');
    close          = injectDialogClose<void>();
    readonly calcConfig = inject(CalculatorConfigService);

    tabs = TABS;
    activeTab = signal<TabId>('purchase-mortgage');
    pdfBlocked = signal(false);

    // ── View mode ──────────────────────────────────────────────────────────────
    mode = signal<CalculatorMode>('calculator');
    settingsLoading = signal(false);
    settingsUnlocked = signal(false);
    passwordInput = signal('');
    passwordError = signal(false);
    settingsTab = signal<TabId>('purchase-mortgage');
    showRawJson = signal(false);
    rawJsonDraft = signal('');
    rawJsonError = signal<string | null>(null);

    // ── Draft for settings panel ───────────────────────────────────────────────
    draft = signal<CalculatorConfig | null>(null);
    isDirty = computed(() => {
        const d = this.draft();
        if (!d) return false;
        return JSON.stringify(d) !== JSON.stringify(this.calcConfig.config());
    });
    submitting = signal(false);

    // ── Calculator inputs — initialised from the service's committed config ───
    //
    // No hardcoded fallback values here. fieldDefault() reads from the config
    // signal (localStorage → mergeWithDefaults → DEFAULT_CALCULATOR_CONFIG),
    // which always has every field. syncInputDefaults() re-reads them after
    // a config change (submit or useDefaults).

    propertyValue      = signal(500_000);
    mortgageAmount     = signal(400_000);
    hasMortgage        = signal(true);
    otherDisbursements = signal(this.calcConfig.fieldDefault('purchase-mortgage', 'otherDisbursements'));
    titleInsurance     = signal(this.calcConfig.fieldDefault('purchase-mortgage', 'titleInsurance'));

    propertyKind       = signal<'house' | 'condo'>('house');
    rprFee             = signal(this.calcConfig.fieldDefault('sale', 'rpr'));
    condoEstoppelFee   = signal(this.calcConfig.fieldDefault('sale', 'condoEstoppel'));

    refinanceAmount    = signal(400_000);
    payoutCount        = signal(1);

    willParty          = signal<'single' | 'couple'>('single');
    willPackage        = signal<string>('package');

    corpType           = signal<'standard' | 'professional'>('standard');
    incorpDisbursements = signal(this.calcConfig.fieldDefault('incorporation', 'disbursements'));

    saleReportAvailability = computed(() => {
        const fields = this.calcConfig.config()['sale'].fields;
        return {
            house: fields['rpr']?.included ?? false,
            condo: fields['condoEstoppel']?.included ?? false,
        };
    });
    effectiveSaleKind = computed<'house' | 'condo' | null>(() => {
        const avail = this.saleReportAvailability();
        if (avail.house && avail.condo) return this.propertyKind();
        if (avail.house) return 'house';
        if (avail.condo) return 'condo';
        return null;
    });

    result = computed<CalcResult>(() => {
        switch (this.activeTab()) {
            case 'purchase-mortgage': return this.purchaseMortgageResult();
            case 'cash-purchase':     return this.cashPurchaseResult();
            case 'sale':              return this.saleResult();
            case 'refinance':         return this.refinanceResult();
            case 'wills':             return this.willsResult();
            case 'incorporation':     return this.incorporationResult();
        }
    });

    // ── Navigation ───────────────────────────────────────────────────────────

    goToContact(): void {
        this.close();
        this.router.navigateByUrl('/contact-us');
    }

    // ── Input handlers (clamped) ────────────────────────────────────────────

    onPropertyValue(v: unknown)      { this.propertyValue.set(Math.max(0, Number(v) || 0)); }
    onMortgageAmount(v: unknown)     { this.mortgageAmount.set(Math.max(0, Number(v) || 0)); }
    onOtherDisbursements(v: unknown) { this.otherDisbursements.set(Math.max(0, Number(v) || 0)); }
    onTitleInsurance(v: unknown)     { this.titleInsurance.set(Math.max(0, Number(v) || 0)); }
    onRprFee(v: unknown)            { this.rprFee.set(Math.max(0, Number(v) || 0)); }
    onCondoEstoppelFee(v: unknown)  { this.condoEstoppelFee.set(Math.max(0, Number(v) || 0)); }
    onRefinanceAmount(v: unknown)   { this.refinanceAmount.set(Math.max(0, Number(v) || 0)); }
    onPayoutCount(v: unknown)       { this.payoutCount.set(Math.max(1, Math.round(Number(v)) || 1)); }
    onIncorpDisbursements(v: unknown){ this.incorpDisbursements.set(Math.max(0, Number(v) || 0)); }

    fmt(n: number): string {
        return new Intl.NumberFormat('en-CA', {
            style: 'currency', currency: 'CAD', maximumFractionDigits: 0,
        }).format(n || 0);
    }

    activeTabLabel(): string {
        return this.tabs.find(t => t.id === this.activeTab())?.label ?? '';
    }

    // ── Use Defaults (header button) ────────────────────────────────────────

    useDefaults(): void {
        this.log.info('Resetting to defaults');
        this.calcConfig.resetToDefaults();
        this.syncInputDefaults();
    }

    // ── Admin settings panel ────────────────────────────────────────────────

    async openSettings(): Promise<void> {
        this.log.group('openSettings');
        this.mode.set('settings');
        this.settingsLoading.set(true);
        this.settingsUnlocked.set(false);
        this.passwordInput.set('');
        this.passwordError.set(false);
        this.settingsTab.set(this.activeTab());
        this.showRawJson.set(false);
        this.rawJsonError.set(null);

        this.log.debug('Fetching remote config with', SPINNER_MIN_MS, 'ms minimum spinner');

        const [remote] = await Promise.all([
            this.calcConfig.fetchRemote(),
            new Promise(r => setTimeout(r, SPINNER_MIN_MS)),
        ]);

        if (remote) {
            this.log.info('Draft populated from remote config');
            this.draft.set(structuredClone(remote));
        } else {
            this.log.info('Draft populated from current committed config (remote unavailable)');
            this.draft.set(structuredClone(this.calcConfig.config()));
        }

        this.settingsLoading.set(false);
        this.log.groupEnd();
    }

    closeSettings(): void {
        if (this.isDirty() && !confirm('You have unsaved changes. Discard them?')) {
            this.log.debug('Close cancelled — unsaved changes');
            return;
        }
        this.log.debug('Settings closed');
        this.draft.set(null);
        this.mode.set('calculator');
    }

    submitChanges(): void {
        const d = this.draft();
        if (!d) return;

        this.log.group('submitChanges');
        this.submitting.set(true);

        this.log.debug('Committing draft to service');
        this.calcConfig.commit(d);
        this.draft.set(null);
        this.submitting.set(false);

        this.log.debug('Relaunching calculator with new defaults');
        this.relaunch();
        this.log.groupEnd();
    }

    tryUnlock(): void {
        if (this.passwordInput() === ADMIN_PASSWORD) {
            this.settingsUnlocked.set(true);
            this.passwordError.set(false);
            this.rawJsonDraft.set(JSON.stringify(this.draft(), null, 2));
            this.log.debug('Settings unlocked');
        } else {
            this.passwordError.set(true);
            this.log.debug('Incorrect password attempt');
        }
    }

    // ── Draft reads ─────────────────────────────────────────────────────────

    fieldKeysFor(tab: TabId): string[] {
        return Object.keys(this.draft()?.[tab]?.fields ?? {});
    }

    isFieldIncluded(tab: TabId, field: string): boolean {
        return this.draft()?.[tab]?.fields?.[field]?.included ?? false;
    }

    fieldHasTaxable(tab: TabId, field: string): boolean {
        return this.draft()?.[tab]?.fields?.[field]?.taxable !== undefined;
    }

    isFieldTaxable(tab: TabId, field: string): boolean {
        return this.draft()?.[tab]?.fields?.[field]?.taxable ?? false;
    }

    fieldLabelValue(tab: TabId, field: string): string {
        return this.draft()?.[tab]?.fields?.[field]?.label ?? field;
    }

    fieldHasDefault(tab: TabId, field: string): boolean {
        return this.draft()?.[tab]?.fields?.[field]?.default !== undefined;
    }

    fieldDefaultValue(tab: TabId, field: string): number {
        return this.draft()?.[tab]?.fields?.[field]?.default ?? 0;
    }

    disclaimerValue(tab: TabId): string {
        return this.draft()?.[tab]?.disclaimer ?? '';
    }

    // ── Draft writes ────────────────────────────────────────────────────────

    setFieldIncluded(tab: TabId, field: string, value: boolean): void {
        this.patchDraft(tab, field, { included: value });
    }

    setFieldTaxable(tab: TabId, field: string, value: boolean): void {
        this.patchDraft(tab, field, { taxable: value });
    }

    setFieldLabel(tab: TabId, field: string, value: string): void {
        this.patchDraft(tab, field, { label: value });
    }

    setFieldDefault(tab: TabId, field: string, value: unknown): void {
        this.patchDraft(tab, field, { default: Math.max(0, Number(value) || 0) });
    }

    setDisclaimer(tab: TabId, value: string): void {
        this.draft.update((d: any) => {
            if (!d) return d;
            const next = structuredClone(d);
            next[tab].disclaimer = value;
            return next;
        });
    }

    private patchDraft(tab: TabId, field: string, patch: Partial<CalculatorFieldConfig>): void {
        this.draft.update((d: any) => {
            if (!d) return d;
            const next = structuredClone(d);
            if (next[tab]?.fields?.[field]) {
                next[tab].fields[field] = { ...next[tab].fields[field], ...patch };
            }
            return next;
        });
    }

    resetConfig(): void {
        this.log.debug('Draft reset to defaults');
        this.draft.set(structuredClone(DEFAULT_CALCULATOR_CONFIG));
        this.rawJsonDraft.set(JSON.stringify(this.draft(), null, 2));
        this.rawJsonError.set(null);
    }

    applyRawJson(): void {
        try {
            const parsed = JSON.parse(this.rawJsonDraft()) as Partial<CalculatorConfig>;
            this.draft.set(this.calcConfig.mergeWithDefaults(parsed));
            this.rawJsonError.set(null);
            this.log.debug('Raw JSON applied to draft');
        } catch {
            this.rawJsonError.set('Could not parse that JSON \u2014 no changes applied.');
            this.log.warn('Raw JSON parse failed');
        }
    }

    /** Re-reads all editable input defaults from the committed config.
     *  Called by relaunch() and useDefaults() — the ONLY places where
     *  input signals are synced to config. No values are duplicated. */
    private syncInputDefaults(): void {
        this.log.group('syncInputDefaults');
        const cfg = this.calcConfig;

        this.otherDisbursements.set(cfg.fieldDefault('purchase-mortgage', 'otherDisbursements'));
        this.titleInsurance.set(cfg.fieldDefault('purchase-mortgage', 'titleInsurance'));
        this.rprFee.set(cfg.fieldDefault('sale', 'rpr'));
        this.condoEstoppelFee.set(cfg.fieldDefault('sale', 'condoEstoppel'));
        this.incorpDisbursements.set(cfg.fieldDefault('incorporation', 'disbursements'));

        this.log.debug('Synced:', {
            otherDisbursements: this.otherDisbursements(),
            titleInsurance: this.titleInsurance(),
            rprFee: this.rprFee(),
            condoEstoppelFee: this.condoEstoppelFee(),
            incorpDisbursements: this.incorpDisbursements(),
        });
        this.log.groupEnd();
    }

    relaunch(): void {
        this.log.debug('Relaunching calculator');
        this.activeTab.set('purchase-mortgage');
        this.propertyValue.set(500_000);
        this.mortgageAmount.set(400_000);
        this.hasMortgage.set(true);
        this.syncInputDefaults();
        this.propertyKind.set('house');
        this.refinanceAmount.set(400_000);
        this.payoutCount.set(1);
        this.willParty.set('single');
        this.willPackage.set('package');
        this.corpType.set('standard');
        this.mode.set('calculator');
    }

    // ── PDF export ─────────────────────────────────────────────────────────────

    async exportPdf(): Promise<void> {
        const r = this.result();
        if (!r || r.quoteOnly || !Array.isArray(r.lines)) return;
        this.pdfBlocked.set(false);
        this.log.debug('Exporting PDF for', this.activeTabLabel());

        try {
            const html2pdfModule = await import('html2pdf.js');
            const html2pdf = html2pdfModule.default ?? html2pdfModule;

            const esc = (value: unknown): string =>
                String(value ?? '')
                    .replaceAll('&', '&amp;')
                    .replaceAll('<', '&lt;')
                    .replaceAll('>', '&gt;')
                    .replaceAll('"', '&quot;')
                    .replaceAll("'", '&#039;');

            const today = new Date().toLocaleDateString('en-CA', {
                year: 'numeric', month: 'long', day: 'numeric',
            });

            const rows = r.lines
                .map((line: { label: unknown; value: number; }) => `
          <tr>
            <td class="line">${esc(line.label)}</td>
            <td class="line" style="text-align:right; white-space:nowrap;">${esc(this.fmt(line.value))}</td>
          </tr>`)
                .join('');

            const element = document.createElement('div');
            element.innerHTML = `
      <style>
        .pdf-estimate { box-sizing:border-box;width:720px;padding:48px 56px;font-family:Lato,'Sans Serif',serif;color:#1a3a5c;background:#fff }
        .pdf-estimate * { box-sizing:border-box }
        .pdf-estimate .brand { font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#b8932a;font-weight:600 }
        .pdf-estimate h1 { font-size:24px;margin:6px 0 2px;color:#1a3a5c }
        .pdf-estimate .meta { font-size:12px;color:#6b7280;margin-bottom:28px }
        .pdf-estimate table { width:100%;border-collapse:collapse;font-size:14px }
        .pdf-estimate td { padding:9px 0 }
        .pdf-estimate tr+tr td { border-top:1px solid #eee }
        .pdf-estimate .line { color:#6b7280;font-weight:400 }
        .pdf-estimate .total-row td { border-top:2px solid #b8932a!important;padding-top:16px;font-size:18px;font-weight:700;color:#1a3a5c }
        .pdf-estimate .footnote { font-size:11px;color:#9ca3af;line-height:1.6;margin-top:18px }
        .pdf-estimate .contact { margin-top:40px;padding-top:20px;border-top:1px solid #eee;font-size:12px;color:#6b7280;line-height:1.75 }
      </style>
      <div class="pdf-estimate">
        <div class="brand">Fric, Lowenstein &amp; Co. LLP</div>
        <h1>Estimated Cost \u2014 ${esc(this.activeTabLabel())}</h1>
        <div class="meta">Prepared ${esc(today)} &nbsp;&bull;&nbsp; Estimate only, not a firm quote</div>
        <table>
          ${rows}
          <tr class="total-row"><td>Estimated Total</td><td style="text-align:right">${esc(this.fmt(r.total))}</td></tr>
        </table>
        ${r.footnote ? `<p class="footnote">${esc(r.footnote)}</p>` : ''}
        <div class="contact">
          #750, 11012 Macleod Trail S.E., Calgary, Alberta&nbsp;T2J&nbsp;7E4<br/>
          (403) 291-2594 &nbsp;&bull;&nbsp; friclow@gmail.com<br/>
          Fees &amp; disbursements above are estimated. We cannot give a firm amount until we have the file opened and have all information and details.
        </div>
      </div>`;

            element.style.position = 'fixed';
            element.style.left = '0';
            element.style.top = '0';
            element.style.zIndex = '-1';
            element.style.background = '#fff';
            document.body.appendChild(element);

            const pdfElement = element.querySelector<HTMLElement>('.pdf-estimate');
            if (!pdfElement) throw new Error('PDF estimate element was not found');

            await html2pdf()
                .set({
                    margin: 0,
                    filename: `cost-estimate-${new Date().toISOString().slice(0, 10)}.pdf`,
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: { scale: 2, backgroundColor: '#ffffff' },
                    jsPDF: { unit: 'pt', format: 'letter', orientation: 'portrait' },
                })
                .from(pdfElement)
                .save();

            element.remove();
            this.log.debug('PDF exported');
        } catch (err) {
            this.log.error('PDF export failed', err);
            this.pdfBlocked.set(true);
        }
    }

    // ── Calculators ────────────────────────────────────────────────────────────

    private purchaseMortgageResult(): CalcResult {
        const tab: TabId = 'purchase-mortgage';
        const cfg = this.calcConfig;
        const price = this.propertyValue();
        let legal: number;
        if (price < 350000) legal = 975;
        else if (price < 600000) legal = 1125;
        else if (price < 850000) legal = 1375;
        else legal = 1575;

        const titleFee = ltoFee(price), mortgageFee = ltoFee(this.mortgageAmount());
        const other = this.otherDisbursements(), titleIns = this.titleInsurance();
        const includeOther = cfg.isIncluded(tab, 'otherDisbursements');
        const includeTitleIns = cfg.isIncluded(tab, 'titleInsurance');
        const includeTitleReg = cfg.isIncluded(tab, 'titleRegistration');
        const includeMortgageReg = cfg.isIncluded(tab, 'mortgageRegistration');
        const includeGst = cfg.isIncluded(tab, 'gst');

        let taxable = legal;
        if (includeOther && cfg.isTaxable(tab, 'otherDisbursements')) taxable += other;
        if (includeTitleIns && cfg.isTaxable(tab, 'titleInsurance')) taxable += titleIns;
        const gst = includeGst ? round2(taxable * GST_RATE) : 0;

        const lines: ResultLine[] = [{ label: 'Legal Fee (Purchase & Mortgage)', value: legal }];
        if (includeTitleIns)    lines.push({ label: cfg.fieldLabel(tab, 'titleInsurance', 'Title Insurance (est.)'), value: titleIns, muted: true });
        if (includeOther)       lines.push({ label: cfg.fieldLabel(tab, 'otherDisbursements', 'Other Disbursements (est.)'), value: other, muted: true });
        if (includeGst)         lines.push({ label: cfg.fieldLabel(tab, 'gst', 'GST (5%)'), value: gst, muted: true });
        if (includeTitleReg)    lines.push({ label: cfg.fieldLabel(tab, 'titleRegistration', 'Land Titles \u2014 Title Registration'), value: titleFee, muted: true });
        if (includeMortgageReg) lines.push({ label: cfg.fieldLabel(tab, 'mortgageRegistration', 'Land Titles \u2014 Mortgage Registration'), value: mortgageFee, muted: true });

        const total = legal + (includeTitleIns ? titleIns : 0) + (includeOther ? other : 0) + gst + (includeTitleReg ? titleFee : 0) + (includeMortgageReg ? mortgageFee : 0);
        return { lines, total, footnote: cfg.disclaimer(tab) };
    }

    private cashPurchaseResult(): CalcResult {
        const tab: TabId = 'cash-purchase';
        const cfg = this.calcConfig;
        const price = this.propertyValue();
        if (price >= 850000) return { lines: [], total: 0, quoteOnly: true, quoteNote: 'Cash purchases over $850,000 are quoted individually \u2014 please contact us.' };
        let legal: number;
        if (price < 400000) legal = 850; else if (price < 650000) legal = 1150; else legal = 1275;

        const titleFee = ltoFee(price), other = this.otherDisbursements(), titleIns = this.titleInsurance();
        const includeOther = cfg.isIncluded(tab, 'otherDisbursements'), includeTitleIns = cfg.isIncluded(tab, 'titleInsurance');
        const includeTitleReg = cfg.isIncluded(tab, 'titleRegistration'), includeGst = cfg.isIncluded(tab, 'gst');

        let taxable = legal;
        if (includeOther && cfg.isTaxable(tab, 'otherDisbursements')) taxable += other;
        if (includeTitleIns && cfg.isTaxable(tab, 'titleInsurance')) taxable += titleIns;
        const gst = includeGst ? round2(taxable * GST_RATE) : 0;

        const lines: ResultLine[] = [{ label: 'Legal Fee (Cash Purchase)', value: legal }];
        if (includeTitleIns) lines.push({ label: cfg.fieldLabel(tab, 'titleInsurance', 'Title Insurance (est.)'), value: titleIns, muted: true });
        if (includeOther)    lines.push({ label: cfg.fieldLabel(tab, 'otherDisbursements', 'Other Disbursements (est.)'), value: other, muted: true });
        if (includeGst)      lines.push({ label: cfg.fieldLabel(tab, 'gst', 'GST (5%)'), value: gst, muted: true });
        if (includeTitleReg) lines.push({ label: cfg.fieldLabel(tab, 'titleRegistration', 'Land Titles \u2014 Title Registration'), value: titleFee, muted: true });

        const total = legal + (includeTitleIns ? titleIns : 0) + (includeOther ? other : 0) + gst + (includeTitleReg ? titleFee : 0);
        return { lines, total, footnote: cfg.disclaimer(tab) };
    }

    private saleResult(): CalcResult {
        const tab: TabId = 'sale';
        const cfg = this.calcConfig;
        const price = this.propertyValue();
        if (price >= 950000) return { lines: [], total: 0, quoteOnly: true, quoteNote: 'Sales over $950,000 are quoted individually \u2014 please contact us.' };
        let legal: number;
        if (price < 400000) legal = 895; else if (price < 650000) legal = 995; else legal = 1195;

        const kind = this.effectiveSaleKind(), reportIncluded = kind !== null, isHouse = kind === 'house';
        const reportFee = reportIncluded ? (isHouse ? this.rprFee() : this.condoEstoppelFee()) : 0;
        const reportField = isHouse ? 'rpr' : 'condoEstoppel';
        const reportLabel = isHouse ? cfg.fieldLabel(tab, 'rpr', 'Real Property Report (est.)') : cfg.fieldLabel(tab, 'condoEstoppel', 'Condominium Estoppel Certificate (est.)');

        const includeTitleIns = cfg.isIncluded(tab, 'titleInsurance'), titleIns = this.titleInsurance();
        const includeOther = cfg.isIncluded(tab, 'otherDisbursements'), other = this.otherDisbursements();
        const includeDischarge = cfg.isIncluded(tab, 'mortgageDischarge') && this.hasMortgage();
        const discharge = includeDischarge ? cfg.fieldDefault(tab, 'mortgageDischarge') : 0;
        const includeGst = cfg.isIncluded(tab, 'gst');

        let taxable = legal;
        if (reportIncluded && cfg.isTaxable(tab, reportField)) taxable += reportFee;
        if (includeTitleIns && cfg.isTaxable(tab, 'titleInsurance')) taxable += titleIns;
        if (includeOther && cfg.isTaxable(tab, 'otherDisbursements')) taxable += other;
        const gst = includeGst ? round2(taxable * GST_RATE) : 0;

        const lines: ResultLine[] = [{ label: 'Legal Fee (Sale)', value: legal }];
        if (reportIncluded)   lines.push({ label: reportLabel, value: reportFee, muted: true });
        if (includeTitleIns)  lines.push({ label: cfg.fieldLabel(tab, 'titleInsurance', 'Title Insurance (est.)'), value: titleIns, muted: true });
        if (includeOther)     lines.push({ label: cfg.fieldLabel(tab, 'otherDisbursements', 'Other Disbursements (est.)'), value: other, muted: true });
        if (includeGst)       lines.push({ label: cfg.fieldLabel(tab, 'gst', 'GST (5%)'), value: gst, muted: true });
        if (includeDischarge) lines.push({ label: cfg.fieldLabel(tab, 'mortgageDischarge', 'Land Titles \u2014 Mortgage Discharge Fee'), value: discharge, muted: true });

        const total = legal + (reportIncluded ? reportFee : 0) + (includeTitleIns ? titleIns : 0) + (includeOther ? other : 0) + gst + discharge;
        return { lines, total, footnote: cfg.disclaimer(tab) };
    }

    private refinanceResult(): CalcResult {
        const tab: TabId = 'refinance';
        const cfg = this.calcConfig;
        const amount = this.refinanceAmount(), payouts = Math.max(1, this.payoutCount());
        const legal = 995 + (payouts - 1) * 175;
        const mortgageFee = ltoFee(amount), dischargeFee = 10;
        const titleIns = this.titleInsurance(), other = this.otherDisbursements();

        const includeMortgageReg = cfg.isIncluded(tab, 'mortgageRegistration');
        const includeDischargeFee = cfg.isIncluded(tab, 'dischargeFee');
        const includeTitleIns = cfg.isIncluded(tab, 'titleInsurance');
        const includeOther = cfg.isIncluded(tab, 'otherDisbursements');
        const includeGst = cfg.isIncluded(tab, 'gst');

        let taxable = legal;
        if (includeTitleIns && cfg.isTaxable(tab, 'titleInsurance')) taxable += titleIns;
        if (includeOther && cfg.isTaxable(tab, 'otherDisbursements')) taxable += other;
        const gst = includeGst ? round2(taxable * GST_RATE) : 0;

        const lines: ResultLine[] = [{ label: `Legal Fee (Refinance, ${payouts} payout${payouts > 1 ? 's' : ''})`, value: legal }];
        if (includeTitleIns)     lines.push({ label: cfg.fieldLabel(tab, 'titleInsurance', 'Title Insurance (est.)'), value: titleIns, muted: true });
        if (includeOther)        lines.push({ label: cfg.fieldLabel(tab, 'otherDisbursements', 'Other Disbursements (est.)'), value: other, muted: true });
        if (includeGst)          lines.push({ label: cfg.fieldLabel(tab, 'gst', 'GST (5%)'), value: gst, muted: true });
        if (includeMortgageReg)  lines.push({ label: cfg.fieldLabel(tab, 'mortgageRegistration', 'Land Titles \u2014 New Mortgage Registration'), value: mortgageFee, muted: true });
        if (includeDischargeFee) lines.push({ label: cfg.fieldLabel(tab, 'dischargeFee', 'Land Titles — Discharge Fee'), value: dischargeFee, muted: true });

        const total = legal + (includeTitleIns ? titleIns : 0) + (includeOther ? other : 0) + gst + (includeMortgageReg ? mortgageFee : 0) + (includeDischargeFee ? dischargeFee : 0);
        return { lines, total, footnote: cfg.disclaimer(tab) };
    }

    private willsResult(): CalcResult {
        const tab: TabId = 'wills';
        const cfg = this.calcConfig, party = this.willParty(), pkg = this.willPackage();
        const table: Record<string, number> = party === 'single'
            ? { will: 595, epa: 295, pd: 275, willPlusOne: 750, package: 895, codicil: 275 }
            : { will: 975, epa: 395, pd: 350, willPlusOne: 1075, package: 1175, codicil: 400 };
        const fee = table[pkg] ?? table['package'];
        const includeGst = cfg.isIncluded(tab, 'gst');
        const gst = includeGst ? round2(fee * GST_RATE) : 0;

        const lines: ResultLine[] = [{ label: `${WILL_LABELS[pkg] ?? WILL_LABELS['package']} \u2014 ${party === 'couple' ? 'Couple' : 'Individual'}`, value: fee }];
        if (includeGst) lines.push({ label: cfg.fieldLabel(tab, 'gst', 'GST (5%)'), value: gst, muted: true });
        return { lines, total: fee + gst, footnote: cfg.disclaimer(tab) };
    }

    private incorporationResult(): CalcResult {
        const tab: TabId = 'incorporation';
        const cfg = this.calcConfig;
        const legal = this.corpType() === 'standard' ? 475 : 775;
        const includeFiling = cfg.isIncluded(tab, 'filingFee'), filing = includeFiling ? cfg.fieldDefault(tab, 'filingFee') : 0;
        const includeGovt = cfg.isIncluded(tab, 'govtFee'), govt = includeGovt ? cfg.fieldDefault(tab, 'govtFee') : 0;
        const includeDisb = cfg.isIncluded(tab, 'disbursements'), disb = this.incorpDisbursements();
        const includeGst = cfg.isIncluded(tab, 'gst');

        let taxable = legal;
        if (includeFiling && cfg.isTaxable(tab, 'filingFee')) taxable += filing;
        if (includeDisb && cfg.isTaxable(tab, 'disbursements')) taxable += disb;
        const gst = includeGst ? round2(taxable * GST_RATE) : 0;

        const lines: ResultLine[] = [{ label: this.corpType() === 'standard' ? 'Legal Fee (Standard Incorporation)' : 'Legal Fee (Professional Corporation)', value: legal }];
        if (includeFiling) lines.push({ label: cfg.fieldLabel(tab, 'filingFee', 'Filing Fee'), value: filing, muted: true });
        if (includeDisb)   lines.push({ label: cfg.fieldLabel(tab, 'disbursements', 'Disbursements (est.)'), value: disb, muted: true });
        if (includeGst)    lines.push({ label: cfg.fieldLabel(tab, 'gst', 'GST (5%)'), value: gst, muted: true });
        if (includeGovt)   lines.push({ label: cfg.fieldLabel(tab, 'govtFee', 'Government Filing Fee (tax-exempt)'), value: govt, muted: true });

        const total = legal + filing + govt + gst + (includeDisb ? disb : 0);
        return { lines, total, footnote: cfg.disclaimer(tab) };
    }
}