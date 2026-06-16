/**
 * lib/taxEngines/india.ts — Indian tax engine (AY 2025-26)
 *
 * Supports both regimes:
 *   • Old regime — full deductions (80C, 80D, HRA, home loan interest)
 *   • New regime — lower rates, minimal deductions (only standard deduction)
 *
 * Brackets and rebates kept in plain object form so the Tax Studio UI can
 * render comparative side-by-side projections without re-deriving values.
 */

import type {
  TaxEngine,
  TaxComputeInput,
  TaxComputeBreakdown,
  TaxDeclarationField,
} from './index';
import { type TaxBracket, computeBracketTax } from './bracket';

// ─────────────────────────────────────────────────────────────────────────────
// Brackets — FY 2025-26
// ─────────────────────────────────────────────────────────────────────────────

const OLD_REGIME_BRACKETS: TaxBracket[] = [
  { upTo:    250_000, rate: 0.00 },     // ₹0 – ₹2.5L
  { upTo:    500_000, rate: 0.05 },     // ₹2.5L – ₹5L
  { upTo:  1_000_000, rate: 0.20 },     // ₹5L – ₹10L
  { upTo:   Infinity, rate: 0.30 },     // > ₹10L
];

const NEW_REGIME_BRACKETS: TaxBracket[] = [
  { upTo:    300_000, rate: 0.00 },     // ₹0 – ₹3L
  { upTo:    700_000, rate: 0.05 },     // ₹3L – ₹7L
  { upTo:  1_000_000, rate: 0.10 },     // ₹7L – ₹10L
  { upTo:  1_200_000, rate: 0.15 },     // ₹10L – ₹12L
  { upTo:  1_500_000, rate: 0.20 },     // ₹12L – ₹15L
  { upTo:   Infinity, rate: 0.30 },     // > ₹15L
];

// Statutory caps
const SECTION_80C_CEILING   = 150_000;   // ₹1.5L
const SECTION_80D_CEILING   = 25_000;    // ₹25k (self + family below 60)
const SECTION_80D_PARENTS   = 50_000;    // ₹50k (senior-citizen parents)
const SECTION_80CCD_NPS     = 50_000;    // ₹50k (additional NPS over 80C)
const STANDARD_DEDUCTION    = 50_000;    // Both regimes (FY25-26)
const NEW_REGIME_REBATE_87A = 25_000;    // Tax rebate if taxable income ≤ ₹7L

// 4% cess on tax + surcharge (Health & Education Cess)
const HEALTH_EDU_CESS = 0.04;

// ─────────────────────────────────────────────────────────────────────────────
// Declaration form fields
// ─────────────────────────────────────────────────────────────────────────────

const FIELDS: TaxDeclarationField[] = [
  // Old regime deductions
  { key: 'section80c',     label: 'Section 80C (PPF, ELSS, LIC, EPF)',  type: 'currency', maxAmount: SECTION_80C_CEILING, section: 'Deductions (Old Regime)' },
  { key: 'section80d',     label: 'Section 80D (Self + family health insurance)', type: 'currency', maxAmount: SECTION_80D_CEILING, section: 'Deductions (Old Regime)' },
  { key: 'section80dParents', label: 'Section 80D (Senior-citizen parents)', type: 'currency', maxAmount: SECTION_80D_PARENTS, section: 'Deductions (Old Regime)' },
  { key: 'section80ccd',   label: 'Section 80CCD(1B) — NPS additional',  type: 'currency', maxAmount: SECTION_80CCD_NPS,  section: 'Deductions (Old Regime)' },
  { key: 'homeLoanInterest', label: 'Home loan interest (Section 24)',   type: 'currency', maxAmount: 200_000,             section: 'Deductions (Old Regime)' },
  { key: 'hraExemption',   label: 'HRA exemption (least of 3 rules)',    type: 'currency',                                  section: 'Deductions (Old Regime)' },
  { key: 'section80e',     label: 'Section 80E — Education loan interest', type: 'currency',                              section: 'Deductions (Old Regime)' },
  { key: 'section80g',     label: 'Section 80G — Donations',              type: 'currency',                                section: 'Deductions (Old Regime)' },

  // Cross-regime
  { key: 'standardDeduction', label: 'Standard deduction (auto-applied ₹50k)', type: 'currency', section: 'Auto-applied', description: 'Salaried employees only — applied automatically.' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Compute
// ─────────────────────────────────────────────────────────────────────────────

function compute(input: TaxComputeInput): TaxComputeBreakdown {
  const regime = (input.regime === 'new') ? 'new' : 'old';

  // 1. Total deductions
  let totalDeductions = STANDARD_DEDUCTION;
  const declarationSavings: TaxComputeBreakdown['declarationSavings'] = [];

  if (regime === 'old') {
    const d = input.declarations;

    const num = (k: string, cap?: number): number => {
      const v = Number(d[k] ?? 0) || 0;
      return cap ? Math.min(v, cap) : v;
    };

    const claimed80c       = num('section80c',         SECTION_80C_CEILING);
    const claimed80d       = num('section80d',         SECTION_80D_CEILING);
    const claimed80dPar    = num('section80dParents',  SECTION_80D_PARENTS);
    const claimed80ccd     = num('section80ccd',       SECTION_80CCD_NPS);
    const claimedHomeLoan  = num('homeLoanInterest',   200_000);
    const claimedHra       = num('hraExemption');
    const claimed80e       = num('section80e');
    const claimed80g       = num('section80g');

    const items = [
      { key: 'section80c',          label: 'Section 80C',                  amount: claimed80c },
      { key: 'section80d',          label: 'Section 80D (Self/Family)',    amount: claimed80d },
      { key: 'section80dParents',   label: 'Section 80D (Parents)',        amount: claimed80dPar },
      { key: 'section80ccd',        label: 'NPS Additional (80CCD(1B))',   amount: claimed80ccd },
      { key: 'homeLoanInterest',    label: 'Home Loan Interest (Sec 24)',  amount: claimedHomeLoan },
      { key: 'hraExemption',        label: 'HRA Exemption',                amount: claimedHra },
      { key: 'section80e',          label: 'Education Loan Interest',       amount: claimed80e },
      { key: 'section80g',          label: 'Donations (80G)',               amount: claimed80g },
    ];

    for (const it of items) {
      totalDeductions += it.amount;
    }

    // Compute per-declaration tax saved by running a what-if at the top marginal rate
    const grossLessStandard = input.grossAnnualIncome - STANDARD_DEDUCTION;
    const noDeductTax = computeBracketTax(Math.max(0, grossLessStandard), OLD_REGIME_BRACKETS).total;
    const withDeductTax = computeBracketTax(
      Math.max(0, grossLessStandard - (totalDeductions - STANDARD_DEDUCTION)),
      OLD_REGIME_BRACKETS,
    ).total;
    const totalSaved = Math.max(0, noDeductTax - withDeductTax);

    for (const it of items) {
      if (it.amount > 0) {
        const proportional = totalDeductions > STANDARD_DEDUCTION
          ? (it.amount / (totalDeductions - STANDARD_DEDUCTION)) * totalSaved
          : 0;
        declarationSavings.push({ ...it, taxSaved: Math.round(proportional) });
      }
    }
  }

  // 2. Taxable income
  const taxableIncome = Math.max(0, input.grossAnnualIncome - totalDeductions);

  // 3. Tax computation
  const brackets = regime === 'new' ? NEW_REGIME_BRACKETS : OLD_REGIME_BRACKETS;
  const bracketRes = computeBracketTax(taxableIncome, brackets);
  let estimatedTax = bracketRes.total;

  // 4. New-regime 87A rebate (taxable income ≤ ₹7L → no tax)
  if (regime === 'new' && taxableIncome <= 700_000) {
    estimatedTax = Math.max(0, estimatedTax - NEW_REGIME_REBATE_87A);
  } else if (regime === 'old' && taxableIncome <= 500_000) {
    // Old regime 87A: ≤₹5L → up to ₹12,500 rebate
    estimatedTax = Math.max(0, estimatedTax - 12_500);
  }

  // 5. Surcharge (only on top earners ≥ ₹50L)
  let surcharge = 0;
  if (taxableIncome > 5_000_000 && taxableIncome <= 10_000_000)        surcharge = estimatedTax * 0.10;
  else if (taxableIncome > 10_000_000 && taxableIncome <= 20_000_000)  surcharge = estimatedTax * 0.15;
  else if (taxableIncome > 20_000_000 && taxableIncome <= 50_000_000)  surcharge = estimatedTax * 0.25;
  else if (taxableIncome > 50_000_000)                                  surcharge = estimatedTax * (regime === 'new' ? 0.25 : 0.37);
  estimatedTax += surcharge;

  // 6. Health + Education Cess (4% on tax + surcharge)
  estimatedTax = Math.round(estimatedTax * (1 + HEALTH_EDU_CESS));

  // 7. Total tax saved vs no deductions
  const noDeductionsTaxable = Math.max(0, input.grossAnnualIncome - STANDARD_DEDUCTION);
  const noDeductionsTax     = Math.round(
    computeBracketTax(noDeductionsTaxable, brackets).total * (1 + HEALTH_EDU_CESS),
  );
  const totalTaxSaved = Math.max(0, noDeductionsTax - estimatedTax);

  const netAnnualIncome  = input.grossAnnualIncome - estimatedTax;
  const netMonthlyIncome = Math.round(netAnnualIncome / 12);
  const effectiveRate    = input.grossAnnualIncome > 0 ? estimatedTax / input.grossAnnualIncome : 0;

  return {
    totalDeductions,
    taxableIncome,
    estimatedTax,
    effectiveRate,
    netAnnualIncome,
    netMonthlyIncome,
    brackets:           bracketRes.perBracket,
    declarationSavings,
    totalTaxSaved,
    currency:           'INR',
    regime,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────────────────────────────────────

export const indiaEngine: TaxEngine = {
  country:     'IN',
  displayName: 'India',
  currency:    'INR',
  regimes:     ['old', 'new'],
  fields:      FIELDS,
  compute,
};
