import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Database, ref, get, set as dbSet } from '@angular/fire/database';
import { firstValueFrom } from 'rxjs';
import { TabId } from '@schema/models';
import { DebugService } from '@core/services/debug';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CalculatorFieldConfig {
  included: boolean;
  taxable?: boolean;
  label?: string;
  default?: number;
}

export interface CalculatorTabConfig {
  fields: Record<string, CalculatorFieldConfig>;
  disclaimer: string;
}

export type CalculatorConfig = Record<TabId, CalculatorTabConfig>;

// ── Default configuration ──────────────────────────────────────────────────────
//
// Single source of truth for every field's default value, label, taxability,
// and included state. The component NEVER repeats these values — it reads
// them from the service via fieldDefault().

export const DEFAULT_CALCULATOR_CONFIG: CalculatorConfig = {
  'purchase-mortgage': {
    fields: {
      otherDisbursements:   { included: true,  taxable: true,  label: 'Other Disbursements (est.)',              default: 250 },
      titleInsurance:       { included: false, taxable: true,  label: 'Title Insurance (est.)',                  default: 300 },
      titleRegistration:    { included: true,  taxable: false, label: 'Land Titles \u2014 Title Registration'                 },
      mortgageRegistration: { included: true,  taxable: false, label: 'Land Titles \u2014 Mortgage Registration'              },
      gst:                  { included: true,                  label: 'GST (5% on legal fee & disbursements)'                },
    },
    disclaimer:
      'Land Titles fees use the Government of Alberta\u2019s current registration formula ($50 + $5 per ' +
      '$5,000 of value, effective Oct. 2024) and are GST-exempt. Title insurance is not included in this ' +
      'estimate and may vary by lender, bank and/or circumstance.',
  },
  'cash-purchase': {
    fields: {
      otherDisbursements: { included: true,  taxable: true,  label: 'Other Disbursements (est.)',              default: 200 },
      titleInsurance:     { included: false, taxable: true,  label: 'Title Insurance (est.)',                  default: 300 },
      titleRegistration:  { included: true,  taxable: false, label: 'Land Titles \u2014 Title Registration'                 },
      gst:                { included: true,                  label: 'GST (5% on legal fee & disbursements)'                },
    },
    disclaimer:
      'Land Titles fees use the Government of Alberta\u2019s current registration formula and are GST-exempt.',
  },
  sale: {
    fields: {
      rpr:                { included: false,  taxable: true,  label: 'Real Property Report (est.)',                   default: 850 },
      condoEstoppel:      { included: false,  taxable: true,  label: 'Condominium Estoppel Certificate (est.)',       default: 250 },
      titleInsurance:     { included: false, taxable: true,  label: 'Title Insurance (est.)',                        default: 300 },
      mortgageDischarge:  { included: true,  taxable: false, label: 'Land Titles \u2014 Mortgage Discharge Fee',     default: 10  },
      otherDisbursements: { included: true,  taxable: true,  label: 'Other Disbursements (est.)',                    default: 200 },
      gst:                { included: true,                  label: 'GST (5% on legal fee & disbursements)'                     },
    },
    disclaimer:
      'The Land Titles discharge fee is GST-exempt. Title insurance is not included in this estimate and ' +
      'may vary by lender, bank and/or circumstance. Your lender may also charge separate payout fees.',
  },
  refinance: {
    fields: {
      mortgageRegistration: { included: true,  taxable: false, label: 'Land Titles \u2014 New Mortgage Registration' },
      dischargeFee:         { included: true,  taxable: false, label: 'Land Titles \u2014 Discharge Fee(s)'          },
      titleInsurance:       { included: false, taxable: true,  label: 'Title Insurance (est.)',                  default: 300 },
      otherDisbursements:   { included: true,  taxable: true,  label: 'Other Disbursements (est.)',              default: 250 },
      gst:                  { included: true,                  label: 'GST (5% on legal fee & disbursements)'                },
    },
    disclaimer:
      'Land Titles fees use the Government of Alberta\u2019s current registration formula and are ' +
      'GST-exempt. Title insurance is not included in this estimate and may vary by lender, bank ' +
      'and/or circumstance.',
  },
  wills: {
    fields: {
      gst: { included: true, label: 'GST (5%)' },
    },
    disclaimer: 'Estate planning fees are flat rates plus GST; disbursements typically do not apply.',
  },
  incorporation: {
    fields: {
      filingFee:     { included: true, taxable: true,  label: 'Filing Fee',                              default: 100 },
      disbursements: { included: true, taxable: true,  label: 'Disbursements (est.)',                    default: 75  },
      govtFee:       { included: true, taxable: false, label: 'Government Filing Fee (tax-exempt)',      default: 275 },
      gst:           { included: true,                 label: 'GST (5% on legal fee, filing fee & disbursements)'    },
    },
    disclaimer: 'The government filing fee is GST-exempt. Disbursements may include name/NUANS searches.',
  },
};

// ── Service ───────────────────────────────────────────────────────────────────

const STORAGE_KEY   = 'fl-calculator-config-v1';
const FIREBASE_PATH = 'public/calcConfig';

@Injectable({ providedIn: 'root' })
export class CalculatorConfigService {
  private http: HttpClient = inject(HttpClient);
  private db: Database   = inject(Database);
  private log  = inject(DebugService).ns('CalcConfig');

  private readonly _config = signal<CalculatorConfig>(this.loadLocal());
  readonly config = this._config.asReadonly();
  readonly lastSyncEntry = signal<string | null>(null);

  // ── Reads ────────────────────────────────────────────────────────────────

  isIncluded(tab: TabId, field: string): boolean {
    return this._config()[tab]?.fields?.[field]?.included ?? false;
  }

  isTaxable(tab: TabId, field: string): boolean {
    return this._config()[tab]?.fields?.[field]?.taxable ?? false;
  }

  hasTaxableFlag(tab: TabId, field: string): boolean {
    return this._config()[tab]?.fields?.[field]?.taxable !== undefined;
  }

  hasDefault(tab: TabId, field: string): boolean {
    return this._config()[tab]?.fields?.[field]?.default !== undefined;
  }

  fieldLabel(tab: TabId, field: string, fallback: string): string {
    return this._config()[tab]?.fields?.[field]?.label ?? fallback;
  }

  /** Returns the configured default for a field. No fallback parameter needed —
   *  mergeWithDefaults() guarantees every field from DEFAULT_CALCULATOR_CONFIG
   *  is always present, so 0 only appears for fields that genuinely have no default. */
  fieldDefault(tab: TabId, field: string): number {
    return this._config()[tab]?.fields?.[field]?.default ?? 0;
  }

  disclaimer(tab: TabId): string {
    return this._config()[tab]?.disclaimer ?? '';
  }

  fieldKeys(tab: TabId): string[] {
    return Object.keys(this._config()[tab]?.fields ?? {});
  }

  exportJson(): string {
    return JSON.stringify(this._config(), null, 2);
  }

  // ── Remote fetch (on demand) ─────────────────────────────────────────────

  async fetchRemote(): Promise<CalculatorConfig | null> {
    const done = this.log.time('fetchRemote');

    // 1. Firebase client SDK
    this.log.debug('Trying Firebase at', FIREBASE_PATH);
    try {
      const snapshot = await get(ref(this.db, FIREBASE_PATH));
      if (snapshot.exists() && snapshot.val()) {
        const remote = this.mergeWithDefaults(snapshot.val() as Partial<CalculatorConfig>);
        this.lastSyncEntry.set(new Date().toISOString());
        this.log.info('Loaded from Firebase', { tabs: Object.keys(remote) });
        done();
        return remote;
      }
      this.log.debug('Firebase returned empty snapshot');
    } catch (err) {
      this.log.warn('Firebase read failed', err);
    }

    // 2. GET /api/calc-config
    this.log.debug('Falling back to GET /api/calc-config');
    try {
      const data = await firstValueFrom(
        this.http.get<Partial<CalculatorConfig>>('/api/calc-config'),
      );
      if (data && Object.keys(data).length > 0) {
        const remote = this.mergeWithDefaults(data);
        this.lastSyncEntry.set(new Date().toISOString());
        this.log.info('Loaded from API', { tabs: Object.keys(remote) });
        done();
        return remote;
      }
      this.log.debug('API returned empty response');
    } catch (err) {
      this.log.warn('API read failed', err);
    }

    this.log.debug('No remote config available');
    done();
    return null;
  }

  // ── Write ────────────────────────────────────────────────────────────────

  commit(config: CalculatorConfig): void {
    this.log.group('commit');
    const merged = this.mergeWithDefaults(config);

    this.log.debug('Updating signal');
    this._config.set(merged);

    this.log.debug('Writing to localStorage');
    this.cacheLocal(merged);

    this.log.debug('Pushing to API');
    this.pushToRemote(merged);

    this.log.groupEnd();
  }

  resetToDefaults(): void {
    this.log.info('Resetting to hardcoded defaults');
    this.commit(structuredClone(DEFAULT_CALCULATOR_CONFIG));
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  mergeWithDefaults(saved: Partial<CalculatorConfig>): CalculatorConfig {
    const merged = structuredClone(DEFAULT_CALCULATOR_CONFIG);
    for (const tab of Object.keys(merged) as TabId[]) {
      const savedTab = saved?.[tab];
      if (!savedTab) continue;
      if (typeof savedTab.disclaimer === 'string') merged[tab].disclaimer = savedTab.disclaimer;
      for (const field of Object.keys(merged[tab].fields)) {
        const savedField = savedTab.fields?.[field];
        if (savedField) {
          merged[tab].fields[field] = { ...merged[tab].fields[field], ...savedField };
        }
      }
    }
    return merged;
  }

  // ── Internals ──────────────────────────────────────────────────────────

  private loadLocal(): CalculatorConfig {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        this.log.debug('No localStorage cache \u2014 using hardcoded defaults');
        return structuredClone(DEFAULT_CALCULATOR_CONFIG);
      }
      this.log.debug('Loaded from localStorage');
      return this.mergeWithDefaults(JSON.parse(raw));
    } catch (err) {
      this.log.warn('localStorage parse failed \u2014 using defaults', err);
      return structuredClone(DEFAULT_CALCULATOR_CONFIG);
    }
  }

  private cacheLocal(config: CalculatorConfig): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      this.log.debug('localStorage updated');
    } catch (err) {
      this.log.warn('localStorage write failed', err);
    }
  }

  private async pushToRemote(config: CalculatorConfig): Promise<void> {
    // 1. Write directly to Firebase (same as SiteService pattern)
    try {
      await dbSet(ref(this.db, FIREBASE_PATH), config);
      this.lastSyncEntry.set(new Date().toISOString());
      this.log.info('Saved to Firebase directly');
      return; // Success — skip the API fallback
    } catch (err) {
      this.log.warn('Direct Firebase write failed, trying API', err);
    }

    // 2. Fallback: try the API (will only work with a valid calc JWT)
    this.http.put('/api/calc-config', config).subscribe({
      next: () => {
        this.lastSyncEntry.set(new Date().toISOString());
        this.log.info('Saved to API → Firebase');
      },
      error: (err) => {
        this.log.warn('API write also failed — changes saved locally only', err?.status ?? err);
      },
    });
  }
}