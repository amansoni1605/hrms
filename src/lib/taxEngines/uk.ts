/**
 * lib/taxEngines/uk.ts — UK tax engine (Tax Year 2024-25)
 *
 * Combines:
 *   • Income Tax (Personal Allowance + bands)
 *   • National Insurance Contributions (NIC) — Class 1 employee
 *   • Tax-advantaged savings: SIPP (pension), ISA (no tax saving — ring-fenced)
 *
 * The Personal Allowance tapers down at incomes above £100,000 (reduced by
 * £1 for every £2 above the threshold).
 */

import type {
  TaxEngine,
  TaxComputeInput,
  TaxComputeBreakdown,
  TaxDeclarationField,
} from './index';
import { type TaxBracket, computeBracketTax } from './bracket';

// ─────────────────────────────────────────────────────────────────────────────
// Constants — TY 2024-25 (England, Wales, NI; Scotland has different bands)
// ─────────────────────────────────────────────────────────────────────────────

const PERSONAL_ALLOWANCE_BASE     = 12_570;       // 0% band
const PERSONAL_ALLOWANCE_TAPER_AT = 100_000;
const ADDITIONAL_RATE_THRESHOLD   = 125_140;      // 45% kicks in here

const INCOME_TAX_BRACKETS_BASE: TaxBracket[] = [
  { upTo:   50_270,  rate: 0.20 },     // basic rate
  { upTo:  125_140,  rate: 0.40 },     // higher rate
  { upTo:  Infinity, rate: 0.45 },     // additional rate
];

// National Insurance (Class 1 employee, post-Jan-2024 rates)
const NI_PRIMARY_THRESHOLD = 12_570;
const NI_UPPER_LIMIT       = 50_270;
const NI_RATE_MAIN         = 0.08;
const NI_RATE_HIGHER       = 0.02;

// Pension contribution annual allowance (2024-25): £60,000
const ANNUAL_PENSION_ALLOWANCE = 60_000;

// ISA annual allowance (no income-tax saving, but tax-free growth)
const ISA_ANNUAL_ALLOWANCE = 20_000;

// ─────────────────────────────────────────────────────────────────────────────
// Declaration fields
// ─────────────────────────────────────────────────────────────────────────────

const FIELDS: TaxDeclarationField[] = [
  { key: 'sippContribution',       label: 'SIPP / Pension contribution',     type: 'currency', maxAmount: ANNUAL_PENSION_ALLOWANCE, section: 'Retirement', description: 'Reduces taxable income £-for-£. Annual allowance £60,000.' },
  { key: 'isaContribution',        label: 'ISA contribution',                 type: 'currency', maxAmount: ISA_ANNUAL_ALLOWANCE,    section: 'Savings',    description: 'Tax-free growth and withdrawals. Up to £20,000/year.' },
  { key: 'charitableContribution', label: 'Gift Aid donations',               type: 'currency',                                    section: 'Other',     description: 'Higher-rate taxpayers can claim back the extra 20%.' },
  { key: 'studentLoanPlan',        label: 'Student loan plan',                type: 'select',  options: [
                                       { value: 'none', label: 'None' },
                                       { value: 'plan1', label: 'Plan 1' },
                                       { value: 'plan2', label: 'Plan 2' },
                                       { value: 'plan4', label: 'Plan 4 (Scotland)' },
                                       { value: 'plan5', label: 'Plan 5' },
                                       { value: 'pgl',   label: 'Postgraduate Loan' },
                                  ], section: 'Education' },
  { key: 'professionalSubscriptions', label: 'Professional body subscriptions', type: 'currency', section: 'Other' },
];

// Student loan repayment thresholds and rates (2024-25)
const STUDENT_LOAN_PLANS: Record<string, { threshold: number; rate: number }> = {
  plan1: { threshold: 24_990,  rate: 0.09 },
  plan2: { threshold: 27_295,  rate: 0.09 },
  plan4: { threshold: 31_395,  rate: 0.09 },
  plan5: { threshold: 25_000,  rate: 0.09 },
  pgl:   { threshold: 21_000,  rate: 0.06 },
};

// ─────────────────────────────────────────────────────────────────────────────
// Compute
// ─────────────────────────────────────────────────────────────────────────────

function compute(input: TaxComputeInput): TaxComputeBreakdown {
  const num = (k: string, cap?: number): number => {
    const v = Number(input.declarations[k] ?? 0) || 0;
    return cap ? Math.min(v, cap) : v;
  };

  // 1. Pension contribution reduces taxable income before bands
  const sipp = num('sippContribution', ANNUAL_PENSION_ALLOWANCE);

  // 2. Adjusted income for personal allowance taper
  const adjustedIncome = input.grossAnnualIncome - sipp;
  let personalAllowance = PERSONAL_ALLOWANCE_BASE;
  if (adjustedIncome > PERSONAL_ALLOWANCE_TAPER_AT) {
    // Reduce by £1 for every £2 above £100k
    const reduction = Math.min(
      PERSONAL_ALLOWANCE_BASE,
      Math.floor((adjustedIncome - PERSONAL_ALLOWANCE_TAPER_AT) / 2),
    );
    personalAllowance = Math.max(0, PERSONAL_ALLOWANCE_BASE - reduction);
  }

  // 3. Taxable income
  const taxableIncome = Math.max(0, adjustedIncome - personalAllowance);

  // 4. Income tax via brackets — adjust upTo values by the personal allowance
  // We compute tax on `taxableIncome` directly using the band widths relative
  // to the personal-allowance zero-band.
  const bracketsAdjusted: TaxBracket[] = [
    { upTo:    50_270 - personalAllowance, rate: 0.20 },     // 20% band width
    { upTo:   125_140 - personalAllowance, rate: 0.40 },     // 40% band width
    { upTo:   Infinity,                    rate: 0.45 },
  ];
  const incomeTaxRes = computeBracketTax(taxableIncome, bracketsAdjusted);

  // 5. National Insurance Contributions (Class 1 employee)
  let nic = 0;
  if (input.grossAnnualIncome > NI_PRIMARY_THRESHOLD) {
    const mainBand = Math.min(input.grossAnnualIncome - NI_PRIMARY_THRESHOLD,
                              NI_UPPER_LIMIT - NI_PRIMARY_THRESHOLD);
    nic += mainBand * NI_RATE_MAIN;
    if (input.grossAnnualIncome > NI_UPPER_LIMIT) {
      nic += (input.grossAnnualIncome - NI_UPPER_LIMIT) * NI_RATE_HIGHER;
    }
  }
  nic = Math.round(nic);

  // 6. Student loan repayment
  const studentLoanPlan = String(input.declarations['studentLoanPlan'] ?? 'none');
  let studentLoan = 0;
  if (studentLoanPlan !== 'none' && STUDENT_LOAN_PLANS[studentLoanPlan]) {
    const { threshold, rate } = STUDENT_LOAN_PLANS[studentLoanPlan]!;
    if (input.grossAnnualIncome > threshold) {
      studentLoan = Math.round((input.grossAnnualIncome - threshold) * rate);
    }
  }

  // 7. Gift Aid uplift (higher-rate taxpayers can reclaim 20% more)
  const charity = num('charitableContribution');

  const estimatedTax = incomeTaxRes.total + nic + studentLoan;

  // 8. Per-declaration savings
  const declarationSavings: TaxComputeBreakdown['declarationSavings'] = [];

  if (sipp > 0) {
    // Tax that would have been owed without the SIPP contribution
    const taxableWithout    = Math.max(0, input.grossAnnualIncome - personalAllowance);
    const bracketsWithoutPA: TaxBracket[] = [
      { upTo:    50_270 - personalAllowance, rate: 0.20 },
      { upTo:   125_140 - personalAllowance, rate: 0.40 },
      { upTo:   Infinity,                    rate: 0.45 },
    ];
    const taxWithoutSipp = computeBracketTax(taxableWithout, bracketsWithoutPA).total;
    const savedBySipp    = Math.max(0, taxWithoutSipp - incomeTaxRes.total);
    declarationSavings.push({
      key: 'sippContribution', label: 'SIPP / Pension',
      amount: sipp, taxSaved: Math.round(savedBySipp),
    });
  }

  if (charity > 0) {
    // 20% extra tax-relief for higher-rate taxpayers (taxable income > £50,270 - PA)
    const higherRateOver = Math.max(0, taxableIncome - (50_270 - personalAllowance));
    const reliefRate     = higherRateOver > 0 ? 0.20 : 0;
    declarationSavings.push({
      key: 'charitableContribution', label: 'Gift Aid',
      amount: charity, taxSaved: Math.round(charity * reliefRate),
    });
  }

  // 9. Total tax saved baseline (compare to no SIPP/charity)
  const noDeductTax = computeBracketTax(
    Math.max(0, input.grossAnnualIncome - PERSONAL_ALLOWANCE_BASE),
    INCOME_TAX_BRACKETS_BASE,
  ).total;
  const totalTaxSaved = Math.max(0, noDeductTax - incomeTaxRes.total);

  const totalDeductions  = sipp + personalAllowance;
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
    brackets:        incomeTaxRes.perBracket,
    declarationSavings,
    totalTaxSaved:   Math.round(totalTaxSaved),
    currency:        'GBP',
    regime:          'standard',
  };
}

// ─────────────────────────────────────────────────────────────────────────────

export const ukEngine: TaxEngine = {
  country:     'GB',
  displayName: 'United Kingdom',
  currency:    'GBP',
  regimes:     ['standard'],
  fields:      FIELDS,
  compute,
};
