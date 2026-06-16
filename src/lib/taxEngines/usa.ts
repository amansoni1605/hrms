/**
 * lib/taxEngines/usa.ts — US Federal tax engine (TY 2024)
 *
 * State tax is approximated via a flat-rate lookup; for precise state
 * calculations the production system should call the state-specific module.
 *
 * Filing status defaults to 'single'. Supported regimes:
 *   • 'single'
 *   • 'married_joint'
 *   • 'married_separate'
 *   • 'head_of_household'
 */

import type {
  TaxEngine,
  TaxComputeInput,
  TaxComputeBreakdown,
  TaxDeclarationField,
} from './index';
import { type TaxBracket, computeBracketTax } from './bracket';

// ─────────────────────────────────────────────────────────────────────────────
// Federal brackets — Tax Year 2024
// ─────────────────────────────────────────────────────────────────────────────

const FEDERAL_BRACKETS_SINGLE: TaxBracket[] = [
  { upTo:     11_600, rate: 0.10 },
  { upTo:     47_150, rate: 0.12 },
  { upTo:    100_525, rate: 0.22 },
  { upTo:    191_950, rate: 0.24 },
  { upTo:    243_725, rate: 0.32 },
  { upTo:    609_350, rate: 0.35 },
  { upTo:    Infinity, rate: 0.37 },
];

const FEDERAL_BRACKETS_MARRIED_JOINT: TaxBracket[] = [
  { upTo:     23_200, rate: 0.10 },
  { upTo:     94_300, rate: 0.12 },
  { upTo:    201_050, rate: 0.22 },
  { upTo:    383_900, rate: 0.24 },
  { upTo:    487_450, rate: 0.32 },
  { upTo:    731_200, rate: 0.35 },
  { upTo:    Infinity, rate: 0.37 },
];

const FEDERAL_BRACKETS_HEAD_OF_HOUSEHOLD: TaxBracket[] = [
  { upTo:     16_550, rate: 0.10 },
  { upTo:     63_100, rate: 0.12 },
  { upTo:    100_500, rate: 0.22 },
  { upTo:    191_950, rate: 0.24 },
  { upTo:    243_700, rate: 0.32 },
  { upTo:    609_350, rate: 0.35 },
  { upTo:    Infinity, rate: 0.37 },
];

// Standard deduction (TY 2024)
const STANDARD_DEDUCTION_SINGLE         = 14_600;
const STANDARD_DEDUCTION_MARRIED_JOINT  = 29_200;
const STANDARD_DEDUCTION_HEAD_HH        = 21_900;

// 401(k) employee contribution limit (2024)
const CONTRIB_LIMIT_401K     = 23_000;
const CONTRIB_LIMIT_401K_50  = 30_500;     // Catch-up for age 50+
const CONTRIB_LIMIT_HSA      = 4_150;      // Self-only HSA
const CONTRIB_LIMIT_HSA_FAM  = 8_300;      // Family HSA
const CONTRIB_LIMIT_FSA      = 3_200;
const CONTRIB_LIMIT_IRA      = 7_000;
const CONTRIB_LIMIT_IRA_50   = 8_000;

// State flat-rate approximation (production: use precise per-state engine)
const STATE_FLAT_RATE: Record<string, number> = {
  CA: 0.093,   NY: 0.0685,  TX: 0.00,    FL: 0.00,    WA: 0.00,
  NV: 0.00,    OR: 0.099,   IL: 0.0495,  MA: 0.05,    NJ: 0.0637,
  CO: 0.044,   GA: 0.0575,  NC: 0.0475,  PA: 0.0307,  OH: 0.0399,
  AZ: 0.025,   MI: 0.0425,  VA: 0.0575,
};

// ─────────────────────────────────────────────────────────────────────────────
// Declaration fields
// ─────────────────────────────────────────────────────────────────────────────

const FIELDS: TaxDeclarationField[] = [
  { key: 'contribution401k',     label: '401(k) traditional contribution',  type: 'currency', maxAmount: CONTRIB_LIMIT_401K_50, section: 'Retirement', description: 'Up to $23,000 ($30,500 if age 50+) for 2024.' },
  { key: 'contributionHsa',      label: 'HSA contribution',                  type: 'currency', maxAmount: CONTRIB_LIMIT_HSA_FAM, section: 'Healthcare', description: 'Triple tax-advantaged. $4,150 self-only, $8,300 family for 2024.' },
  { key: 'contributionFsa',      label: 'Flexible Spending Account (FSA)',   type: 'currency', maxAmount: CONTRIB_LIMIT_FSA,     section: 'Healthcare' },
  { key: 'contributionTraditionalIra', label: 'Traditional IRA contribution', type: 'currency', maxAmount: CONTRIB_LIMIT_IRA_50, section: 'Retirement' },
  { key: 'studentLoanInterest',  label: 'Student loan interest paid',        type: 'currency', maxAmount: 2_500,                section: 'Education',  description: 'Phase-out applies; max $2,500/yr.' },
  { key: 'mortgageInterest',     label: 'Mortgage interest paid',            type: 'currency',                                   section: 'Housing',    description: 'Only if itemizing; replaces standard deduction.' },
  { key: 'charitableContribution', label: 'Charitable contributions',         type: 'currency',                                   section: 'Other' },
  { key: 'stateAndLocalTax',     label: 'State and local taxes (SALT)',     type: 'currency', maxAmount: 10_000,                section: 'Other' },
  { key: 'dependents',           label: 'Number of dependents',              type: 'number',  section: 'Family' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Compute
// ─────────────────────────────────────────────────────────────────────────────

function compute(input: TaxComputeInput): TaxComputeBreakdown {
  const regime = input.regime ?? 'single';
  const num = (k: string, cap?: number): number => {
    const v = Number(input.declarations[k] ?? 0) || 0;
    return cap ? Math.min(v, cap) : v;
  };

  // 1. Standard deduction by filing status
  const stdDeduction =
    regime === 'married_joint'     ? STANDARD_DEDUCTION_MARRIED_JOINT :
    regime === 'married_separate'  ? STANDARD_DEDUCTION_SINGLE :
    regime === 'head_of_household' ? STANDARD_DEDUCTION_HEAD_HH :
                                      STANDARD_DEDUCTION_SINGLE;

  // 2. Above-the-line deductions (reduce AGI directly)
  const limit401k    = (input.age ?? 0) >= 50 ? CONTRIB_LIMIT_401K_50 : CONTRIB_LIMIT_401K;
  const limitIra     = (input.age ?? 0) >= 50 ? CONTRIB_LIMIT_IRA_50  : CONTRIB_LIMIT_IRA;
  const contrib401k  = num('contribution401k',           limit401k);
  const contribHsa   = num('contributionHsa',            CONTRIB_LIMIT_HSA_FAM);
  const contribFsa   = num('contributionFsa',            CONTRIB_LIMIT_FSA);
  const contribIra   = num('contributionTraditionalIra', limitIra);
  const studentLoan  = num('studentLoanInterest',        2_500);

  const aboveTheLine = contrib401k + contribHsa + contribFsa + contribIra + studentLoan;

  // 3. Itemized vs standard — itemize only if higher
  const mortgage    = num('mortgageInterest');
  const charity     = num('charitableContribution');
  const salt        = num('stateAndLocalTax', 10_000);
  const itemizedTotal = mortgage + charity + salt;
  const usedItemized  = itemizedTotal > stdDeduction;
  const belowTheLine  = usedItemized ? itemizedTotal : stdDeduction;

  // 4. Adjusted Gross Income → Taxable Income
  const agi = Math.max(0, input.grossAnnualIncome - aboveTheLine);
  const taxableIncome = Math.max(0, agi - belowTheLine);

  // 5. Federal tax via brackets
  const brackets =
    regime === 'married_joint'     ? FEDERAL_BRACKETS_MARRIED_JOINT :
    regime === 'head_of_household' ? FEDERAL_BRACKETS_HEAD_OF_HOUSEHOLD :
                                      FEDERAL_BRACKETS_SINGLE;

  const fed = computeBracketTax(taxableIncome, brackets);

  // 6. State tax (flat approximation)
  const stateRate = input.state ? (STATE_FLAT_RATE[input.state.toUpperCase()] ?? 0) : 0;
  const stateTax  = Math.round(taxableIncome * stateRate);

  // 7. FICA: 7.65% on wages up to social-security wage base
  const ssWageBase = 168_600;       // 2024
  const ssTax      = Math.min(input.grossAnnualIncome, ssWageBase) * 0.062;
  const medicare   = input.grossAnnualIncome * 0.0145;
  const fica       = Math.round(ssTax + medicare);

  // 8. Child tax credit ($2,000 per qualifying child under 17)
  const dependents = num('dependents');
  const childTaxCredit = Math.min(dependents * 2_000, fed.total);

  const estimatedTax = fed.total - childTaxCredit + stateTax + fica;

  // 9. Per-declaration savings — same proportional approach as IN engine
  const declarationSavings: TaxComputeBreakdown['declarationSavings'] = [];
  if (aboveTheLine > 0) {
    // Tax without above-the-line deductions
    const taxWithout = computeBracketTax(
      Math.max(0, input.grossAnnualIncome - belowTheLine),
      brackets,
    ).total;
    const totalSavedFromAtL = Math.max(0, taxWithout - fed.total);

    const items = [
      { key: 'contribution401k',          label: '401(k)',                  amount: contrib401k },
      { key: 'contributionHsa',           label: 'HSA',                     amount: contribHsa },
      { key: 'contributionFsa',           label: 'FSA',                     amount: contribFsa },
      { key: 'contributionTraditionalIra', label: 'Traditional IRA',         amount: contribIra },
      { key: 'studentLoanInterest',       label: 'Student Loan Interest',   amount: studentLoan },
    ];
    for (const it of items) {
      if (it.amount > 0) {
        const proportional = (it.amount / aboveTheLine) * totalSavedFromAtL;
        declarationSavings.push({ ...it, taxSaved: Math.round(proportional) });
      }
    }
  }

  // 10. Total tax saved vs no declarations
  const noDeductTax = computeBracketTax(
    Math.max(0, input.grossAnnualIncome - stdDeduction),
    brackets,
  ).total;
  const totalTaxSaved = Math.max(0, noDeductTax - fed.total);

  const totalDeductions  = aboveTheLine + belowTheLine;
  const netAnnualIncome  = input.grossAnnualIncome - estimatedTax;
  const netMonthlyIncome = Math.round(netAnnualIncome / 12);
  const effectiveRate    = input.grossAnnualIncome > 0 ? estimatedTax / input.grossAnnualIncome : 0;

  return {
    totalDeductions,
    taxableIncome,
    estimatedTax:    Math.round(estimatedTax),
    effectiveRate,
    netAnnualIncome: Math.round(netAnnualIncome),
    netMonthlyIncome,
    brackets:        fed.perBracket,
    declarationSavings,
    totalTaxSaved:   Math.round(totalTaxSaved),
    currency:        'USD',
    regime,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

export const usaEngine: TaxEngine = {
  country:     'US',
  displayName: 'United States',
  currency:    'USD',
  regimes:     ['single', 'married_joint', 'married_separate', 'head_of_household'],
  fields:      FIELDS,
  compute,
};
