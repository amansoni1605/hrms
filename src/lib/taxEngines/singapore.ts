/**
 * lib/taxEngines/singapore.ts — Singapore tax engine (YA 2024)
 *
 * Resident tax brackets are progressive but tax-free up to S$20,000.
 * Includes:
 *   • CPF contribution (employee 20% — up to ceilings)
 *   • SRS (Supplementary Retirement Scheme) — voluntary, tax-deductible
 *   • Parenthood Tax Rebate (PTR), Working Mother's Child Relief (WMCR)
 */

import type {
  TaxEngine,
  TaxComputeInput,
  TaxComputeBreakdown,
  TaxDeclarationField,
} from './index';
import { type TaxBracket, computeBracketTax } from './bracket';

// ─────────────────────────────────────────────────────────────────────────────
// Resident tax brackets — YA 2024
// ─────────────────────────────────────────────────────────────────────────────

const RESIDENT_BRACKETS: TaxBracket[] = [
  { upTo:     20_000, rate: 0.00 },
  { upTo:     30_000, rate: 0.02 },
  { upTo:     40_000, rate: 0.035 },
  { upTo:     80_000, rate: 0.07 },
  { upTo:    120_000, rate: 0.115 },
  { upTo:    160_000, rate: 0.15 },
  { upTo:    200_000, rate: 0.18 },
  { upTo:    240_000, rate: 0.19 },
  { upTo:    280_000, rate: 0.195 },
  { upTo:    320_000, rate: 0.20 },
  { upTo:    500_000, rate: 0.22 },
  { upTo:  1_000_000, rate: 0.23 },
  { upTo:   Infinity, rate: 0.24 },
];

// CPF Ordinary Wage ceiling (2024)
const OW_CEILING_MONTHLY      = 6_800;     // S$6,800/month from Jan 2024
const OW_CEILING_ANNUAL       = OW_CEILING_MONTHLY * 12;
const CPF_EMPLOYEE_RATE_U55   = 0.20;
const CPF_EMPLOYEE_RATE_55_60 = 0.17;
const CPF_EMPLOYEE_RATE_60_65 = 0.115;
const CPF_EMPLOYEE_RATE_65_70 = 0.075;
const CPF_EMPLOYEE_RATE_O70   = 0.05;

// SRS contribution cap (2024)
const SRS_CAP_LOCAL    = 15_300;
const SRS_CAP_FOREIGN  = 35_700;

// ─────────────────────────────────────────────────────────────────────────────
// Declaration fields
// ─────────────────────────────────────────────────────────────────────────────

const FIELDS: TaxDeclarationField[] = [
  { key: 'srsContribution',         label: 'SRS contribution',                  type: 'currency', maxAmount: SRS_CAP_FOREIGN, section: 'Retirement', description: 'Singaporeans/PRs: S$15,300. Foreigners: S$35,700.' },
  { key: 'srsForeigner',            label: 'I am a foreigner (higher SRS cap)', type: 'boolean',                              section: 'Retirement' },
  { key: 'parenthoodRebate',        label: 'Parenthood Tax Rebate (PTR)',       type: 'currency',                              section: 'Family',     description: 'One-off rebate, varies by birth order.' },
  { key: 'wmcrChildren',            label: 'Number of qualifying children',     type: 'number',                                section: 'Family',     description: 'Working Mother\'s Child Relief.' },
  { key: 'lifeInsurancePremium',    label: 'Life insurance premium',            type: 'currency', maxAmount: 5_000,            section: 'Insurance',  description: 'Capped at S$5,000.' },
  { key: 'courseFeeRelief',         label: 'Course fees paid',                  type: 'currency', maxAmount: 5_500,            section: 'Education' },
  { key: 'donationsApproved',       label: 'Approved IPC donations',             type: 'currency',                              section: 'Other',      description: '2.5× tax-deductible amount.' },
  { key: 'cpfTopUp',                label: 'CPF voluntary cash top-up',         type: 'currency', maxAmount: 16_000,           section: 'Retirement' },
];

// ─────────────────────────────────────────────────────────────────────────────
// CPF rate by age
// ─────────────────────────────────────────────────────────────────────────────

function cpfEmployeeRate(age: number): number {
  if (age < 55)  return CPF_EMPLOYEE_RATE_U55;
  if (age < 60)  return CPF_EMPLOYEE_RATE_55_60;
  if (age < 65)  return CPF_EMPLOYEE_RATE_60_65;
  if (age < 70)  return CPF_EMPLOYEE_RATE_65_70;
  return CPF_EMPLOYEE_RATE_O70;
}

// ─────────────────────────────────────────────────────────────────────────────
// Compute
// ─────────────────────────────────────────────────────────────────────────────

function compute(input: TaxComputeInput): TaxComputeBreakdown {
  const num = (k: string, cap?: number): number => {
    const v = Number(input.declarations[k] ?? 0) || 0;
    return cap ? Math.min(v, cap) : v;
  };
  const bool = (k: string): boolean => input.declarations[k] === true || input.declarations[k] === 'true';

  // 1. Mandatory CPF (employee share, up to OW ceiling)
  const age          = input.age ?? 30;
  const cpfRate      = cpfEmployeeRate(age);
  const cpfBaseSalary = Math.min(input.grossAnnualIncome, OW_CEILING_ANNUAL);
  const cpfDeduction = Math.round(cpfBaseSalary * cpfRate);

  // 2. SRS voluntary contribution
  const srsCap          = bool('srsForeigner') ? SRS_CAP_FOREIGN : SRS_CAP_LOCAL;
  const srsContribution = num('srsContribution', srsCap);

  // 3. CPF voluntary cash top-up (capped at S$16,000 per year)
  const cpfTopUp = num('cpfTopUp', 16_000);

  // 4. Reliefs
  const insurance       = num('lifeInsurancePremium', 5_000);
  const courseFee       = num('courseFeeRelief', 5_500);
  const donations       = num('donationsApproved');
  const donationsRelief = Math.round(donations * 2.5);      // 2.5× tax-deductible
  const wmcrChildren    = num('wmcrChildren');

  // Working Mother's Child Relief: 15% / 20% / 25% of mother's earned income, capped
  // For simplicity here, treat as fixed reliefs (the actual rules are complex)
  const wmcrRelief = wmcrChildren > 0
    ? Math.min(input.grossAnnualIncome * Math.min(0.25 + (wmcrChildren - 1) * 0.05, 1.00), 50_000)
    : 0;

  const totalDeductions =
    cpfDeduction + srsContribution + cpfTopUp + insurance + courseFee + donationsRelief + wmcrRelief;

  // 5. Taxable income
  const taxableIncome = Math.max(0, input.grossAnnualIncome - totalDeductions);

  // 6. Resident tax
  const bracketRes  = computeBracketTax(taxableIncome, RESIDENT_BRACKETS);
  let estimatedTax  = bracketRes.total;

  // 7. Parenthood Tax Rebate (one-off, applied against tax)
  const ptr = num('parenthoodRebate');
  estimatedTax = Math.max(0, estimatedTax - ptr);

  // 8. Per-declaration savings (proportional to marginal rate)
  const declarationSavings: TaxComputeBreakdown['declarationSavings'] = [];
  const reliefItems = [
    { key: 'srsContribution',     label: 'SRS Contribution',         amount: srsContribution },
    { key: 'cpfTopUp',            label: 'CPF Voluntary Top-up',     amount: cpfTopUp },
    { key: 'lifeInsurancePremium', label: 'Life Insurance Premium',   amount: insurance },
    { key: 'courseFeeRelief',     label: 'Course Fee Relief',         amount: courseFee },
    { key: 'donationsApproved',   label: 'IPC Donations (2.5× relief)', amount: donations },
  ];

  if (totalDeductions > cpfDeduction) {
    const taxWithout = computeBracketTax(
      Math.max(0, input.grossAnnualIncome - cpfDeduction),
      RESIDENT_BRACKETS,
    ).total;
    const totalSaved = Math.max(0, taxWithout - bracketRes.total);

    for (const it of reliefItems) {
      if (it.amount > 0) {
        // Some items get multipliers (e.g. donations × 2.5)
        const effectiveAmount = it.key === 'donationsApproved' ? it.amount * 2.5 : it.amount;
        const proportional    = (effectiveAmount / (totalDeductions - cpfDeduction)) * totalSaved;
        declarationSavings.push({
          key:      it.key,
          label:    it.label,
          amount:   it.amount,
          taxSaved: Math.round(proportional),
        });
      }
    }
  }

  // 9. Total tax saved vs CPF-only baseline
  const noDeductTaxable = Math.max(0, input.grossAnnualIncome - cpfDeduction);
  const noDeductTax     = computeBracketTax(noDeductTaxable, RESIDENT_BRACKETS).total;
  const totalTaxSaved   = Math.max(0, noDeductTax - bracketRes.total);

  const netAnnualIncome  = input.grossAnnualIncome - estimatedTax - cpfDeduction;
  const netMonthlyIncome = Math.round(netAnnualIncome / 12);
  const effectiveRate    = input.grossAnnualIncome > 0 ? estimatedTax / input.grossAnnualIncome : 0;

  return {
    totalDeductions,
    taxableIncome,
    estimatedTax:    Math.round(estimatedTax),
    effectiveRate,
    netAnnualIncome: Math.round(netAnnualIncome),
    netMonthlyIncome,
    brackets:        bracketRes.perBracket,
    declarationSavings,
    totalTaxSaved:   Math.round(totalTaxSaved),
    currency:        'SGD',
    regime:          'resident',
  };
}

// ─────────────────────────────────────────────────────────────────────────────

export const singaporeEngine: TaxEngine = {
  country:     'SG',
  displayName: 'Singapore',
  currency:    'SGD',
  regimes:     ['resident'],
  fields:      FIELDS,
  compute,
};
