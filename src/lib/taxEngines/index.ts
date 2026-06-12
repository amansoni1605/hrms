/**
 * lib/taxEngines/index.ts
 *
 * Multi-jurisdiction tax-saving investment declaration engine.
 *
 * Each country module exports a `TaxEngine` implementing the same interface
 * so the EMPLOYEE-tier Tax Studio widget can render locale-appropriate forms
 * and a unified "estimated annual tax savings" preview.
 *
 * Supported countries (ISO 3166-1 alpha-2):
 *   IN — India  (Old vs New regime, 80C/80D/HRA)
 *   US — USA    (Federal + state, 401(k), HSA, FSA)
 *   GB — UK     (Personal Allowance, SIPP, ISA)
 *   SG — Singapore (CPF, SRS, Parent/Working Mother rebates)
 *
 * Dispatch:
 *   import { getTaxEngine } from '@/lib/taxEngines';
 *   const engine = getTaxEngine('IN');
 *   const result = engine.compute({ grossAnnualIncome: 1_800_000, declarations: { ... } });
 */

import { indiaEngine }     from './india';
import { usaEngine }       from './usa';
import { ukEngine }        from './uk';
import { singaporeEngine } from './singapore';

// ─────────────────────────────────────────────────────────────────────────────
// Shared types
// ─────────────────────────────────────────────────────────────────────────────

export type CountryCode = 'IN' | 'US' | 'GB' | 'SG';

export interface TaxDeclarationField {
  /** Stable identifier used to write back into the user-settings document. */
  key:          string;
  /** Display label shown to the employee in the Tax Studio form. */
  label:        string;
  /** Short helper text below the input. */
  description?: string;
  /** UI field type. */
  type:         'currency' | 'number' | 'boolean' | 'select';
  /** For select fields. */
  options?:     Array<{ value: string; label: string }>;
  /** Statutory ceiling (e.g. ₹1.5 lakh for 80C). UI displays as max attribute. */
  maxAmount?:   number;
  /** Section / category — used for the form UI to group related declarations. */
  section?:     string;
}

export interface TaxComputeInput {
  /** Annual gross income in the country's primary currency. */
  grossAnnualIncome: number;
  /** Per-declaration key → amount map. */
  declarations:      Record<string, number | boolean | string>;
  /** Filing status / regime — country-specific (e.g. 'old' | 'new' for IN). */
  regime?:           string;
  /** Optional cohort — used by US for state-specific tax brackets. */
  state?:            string;
  /** Age — used by IN (senior citizen brackets), UK (state pension qualifying). */
  age?:              number;
}

export interface TaxBracket {
  upTo:      number;            // Income ceiling for this bracket (Infinity for top)
  rate:      number;            // Marginal rate (0.30 = 30%)
  fixedTax?: number;            // Optional flat tax added at the top of the bracket
}

export interface TaxComputeBreakdown {
  /** Total deductions applied (sum of all declarations that reduce taxable income). */
  totalDeductions:    number;
  /** Taxable income after deductions. */
  taxableIncome:      number;
  /** Total tax owed at the applicable brackets. */
  estimatedTax:       number;
  /** Effective tax rate (estimatedTax / grossAnnualIncome). */
  effectiveRate:      number;
  /** Take-home after tax. */
  netAnnualIncome:    number;
  /** Estimated take-home per month. */
  netMonthlyIncome:   number;
  /** Per-bracket breakdown for the UI. */
  brackets:           Array<{ upTo: number; rate: number; taxOnBracket: number }>;
  /** Per-declaration savings (how much tax each declaration saved). */
  declarationSavings: Array<{ key: string; label: string; amount: number; taxSaved: number }>;
  /** Annual tax saved vs no declarations at all. */
  totalTaxSaved:      number;
  /** Currency for display. */
  currency:           string;
  /** Regime used (or fallback). */
  regime:             string;
}

export interface TaxEngine {
  /** ISO country code. */
  country:        CountryCode;
  /** Display name. */
  displayName:    string;
  /** Primary currency. */
  currency:       string;
  /** Supported regimes (or just 'standard' for single-regime countries). */
  regimes:        string[];
  /** Static descriptor of every declaration field this country supports. */
  fields:         TaxDeclarationField[];
  /** Computes take-home + tax breakdown given declarations. */
  compute(input: TaxComputeInput): TaxComputeBreakdown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dispatch
// ─────────────────────────────────────────────────────────────────────────────

const REGISTRY: Record<CountryCode, TaxEngine> = {
  IN: indiaEngine,
  US: usaEngine,
  GB: ukEngine,
  SG: singaporeEngine,
};

/** Returns the tax engine for a country, or `null` if unsupported. */
export function getTaxEngine(country: string): TaxEngine | null {
  const upper = country.toUpperCase() as CountryCode;
  return REGISTRY[upper] ?? null;
}

/** Returns the full list of supported country codes for the Tax Studio dropdown. */
export function listSupportedTaxCountries(): Array<{ code: CountryCode; name: string; currency: string }> {
  return Object.values(REGISTRY).map((e) => ({
    code:     e.country,
    name:     e.displayName,
    currency: e.currency,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared bracket compute helper — reused by every country module
// ─────────────────────────────────────────────────────────────────────────────

export function computeBracketTax(taxableIncome: number, brackets: TaxBracket[]): {
  total:    number;
  perBracket: Array<{ upTo: number; rate: number; taxOnBracket: number }>;
} {
  let remaining = taxableIncome;
  let lastCap   = 0;
  let total     = 0;
  const perBracket: Array<{ upTo: number; rate: number; taxOnBracket: number }> = [];

  for (const b of brackets) {
    if (remaining <= 0) break;
    const bracketWidth = b.upTo === Infinity ? remaining : Math.min(b.upTo - lastCap, remaining);
    const taxOnBracket = Math.max(0, bracketWidth) * b.rate + (b.fixedTax ?? 0);
    total += taxOnBracket;
    remaining -= bracketWidth;
    lastCap = b.upTo;
    perBracket.push({ upTo: b.upTo, rate: b.rate, taxOnBracket });
  }
  return { total: Math.round(total), perBracket };
}
