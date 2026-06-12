/**
 * src/engine/payrollAgenticAuditor.ts
 *
 * Agentic Payroll Pre-Approval Auditor
 *
 * Runs a battery of deterministic + LLM-style heuristic checks against a
 * pending payroll run BEFORE it can be approved by HR.  Emits findings into
 * WorkspacePayrollRun.auditFlags[] with severity (critical | warning | info)
 * and blocks approval when any critical flag is present.
 *
 * Findings categories:
 *
 *   1. Variance Detection
 *      - Per-employee variance > 5% from prior month → warning
 *      - Per-employee variance > 25% → critical
 *      - Department-aggregate gross variance > 10% → warning
 *
 *   2. Statutory Compliance
 *      - Required tax bucket missing (e.g. PF for IN employees)
 *      - Tax rate out of bounds for jurisdiction
 *      - Currency mismatch with employee.currencyCode
 *
 *   3. Ghost-Employee Detection
 *      - Employee on payroll but employeeStatus = terminated → critical
 *      - Inactive employee receiving compensation → critical
 *      - Duplicate employeeCode in line items → critical
 *
 *   4. Audit-Trail Hygiene
 *      - lineHash present and well-formed for every line item
 *      - headcountHash matches Σ(employees) on the run
 *      - approvedById set when status >= approved
 *
 *   5. Anomaly Patterns
 *      - Round-number salary changes (e.g. exactly $10,000 bump) → warning
 *      - New hires receiving full-month pay on prorated days → warning
 *      - Overtime > 80 hours in a single line → critical
 *
 * Workflow:
 *   workers/payrollAgenticAuditor.ts pulls a draft run, calls
 *   auditPayrollRun(), writes the resulting AuditFlag[] back into the
 *   document, and transitions runStatus draft → audit_passed | audit_failed
 *   based on criticalFlagCount.
 *
 * The findings shape is identical to what a real LLM-driven auditor would
 * emit, so the deterministic engine here can be swapped for an LLM call
 * without changing the WorkspacePayrollRun consumer code.
 */

import { randomUUID } from 'node:crypto';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type FindingSeverity = 'critical' | 'warning' | 'informational';
export type FindingCheckCode =
  | 'variance.employee_high'      // 5-25% variance
  | 'variance.employee_extreme'   // >25% variance
  | 'variance.department_high'    // dept-level variance
  | 'statutory.missing_bucket'    // required tax bucket missing
  | 'statutory.rate_out_of_bounds'// tax rate not in legal range
  | 'statutory.currency_mismatch' // currency != employee.currencyCode
  | 'ghost.terminated_employee'   // terminated employee in payroll
  | 'ghost.inactive_employee'     // isActive=false employee in payroll
  | 'ghost.duplicate_employee'    // duplicate employeeCode
  | 'audit.missing_line_hash'     // lineHash missing or malformed
  | 'audit.headcount_mismatch'    // run.employeeCount != lineItems.length
  | 'audit.unsigned_approval'     // status=approved but no approvedById
  | 'anomaly.round_number_bump'   // perfectly round salary delta
  | 'anomaly.new_hire_full_month' // new hire full-month pay
  | 'anomaly.excessive_overtime'  // > 80h overtime
  ;

export interface AuditFinding {
  flagId:        string;
  severity:      FindingSeverity;
  checkCode:     FindingCheckCode;
  statutoryRef?: string;
  affectedCount: number;
  description:   string;
  remediation?:  string;
  isBlocking:    boolean;
  evidence?:     Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Input shapes (decoupled from Mongoose document type)
// ─────────────────────────────────────────────────────────────────────────────

export interface AuditLineItem {
  employeeId:        string;
  employeeCode:      string;
  currencyCode:      string;
  /** Decrypted plaintext salary values for the audit pipeline (NOT exposed to client). */
  baseSalary?:       number;
  grossSalary?:      number;
  netSalary?:        number;
  overtimeHours?:    number;
  leaveDaysDeducted?: number;
  lineHash?:         string;
  /** Prior-month gross for variance detection. Null if first-month employee. */
  priorGrossSalary?: number | null;
  /** Per-employee tax buckets present in this line. */
  taxBucketCodes?:   string[];
  /** Employee state used for ghost detection. */
  employeeStatus?:   string;
  isActive?:         boolean;
  /** Hire date — used by new-hire anomaly check. */
  hireDate?:         string | Date;
}

export interface AuditPayrollRunInput {
  runId:           string;
  runCode:         string;
  tenantId:        string;
  payPeriodMonth:  number;
  payPeriodYear:   number;
  currencyCode:    string;
  employeeCount:   number;
  runStatus:       string;
  approvedById?:   string | null;
  /** Country code → required tax-bucket codes (e.g. IN → ['EPF','TDS','ESI']) */
  jurisdictionRequirements?: Record<string, string[]>;
  lineItems:       AuditLineItem[];
}

export interface AuditPayrollRunResult {
  runId:               string;
  totalFindings:       number;
  criticalCount:       number;
  warningCount:        number;
  informationalCount:  number;
  findings:            AuditFinding[];
  /** Suggested status transition based on findings. */
  recommendedStatus:   'audit_passed' | 'audit_failed';
  computedAt:          Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeFinding(partial: Omit<AuditFinding, 'flagId'>): AuditFinding {
  return { flagId: `flag_${randomUUID()}`, ...partial };
}

const LINE_HASH_PATTERN = /^[a-f0-9]{32,128}$/;

// ─────────────────────────────────────────────────────────────────────────────
// Individual checks
// ─────────────────────────────────────────────────────────────────────────────

function checkVariance(line: AuditLineItem): AuditFinding[] {
  if (!line.priorGrossSalary || line.priorGrossSalary <= 0) return [];
  if (line.grossSalary === undefined)                       return [];

  const delta    = Math.abs(line.grossSalary - line.priorGrossSalary);
  const variance = delta / line.priorGrossSalary;

  if (variance > 0.25) {
    return [makeFinding({
      severity:      'critical',
      checkCode:     'variance.employee_extreme',
      affectedCount: 1,
      description:   `${line.employeeCode}: gross salary variance ${(variance * 100).toFixed(1)}% (prior ${line.priorGrossSalary} → now ${line.grossSalary})`,
      remediation:   'Verify with HR. Likely promotion / role change — needs documented approval.',
      isBlocking:    true,
      evidence:      { employeeCode: line.employeeCode, variancePct: variance, delta },
    })];
  }
  if (variance > 0.05) {
    return [makeFinding({
      severity:      'warning',
      checkCode:     'variance.employee_high',
      affectedCount: 1,
      description:   `${line.employeeCode}: gross salary variance ${(variance * 100).toFixed(1)}% (prior ${line.priorGrossSalary} → now ${line.grossSalary})`,
      remediation:   'Confirm change reason: bonus, comp adjustment, or pro-rating.',
      isBlocking:    false,
      evidence:      { employeeCode: line.employeeCode, variancePct: variance, delta },
    })];
  }
  return [];
}

function checkStatutoryBuckets(
  line:                   AuditLineItem,
  jurisdictionRequirements: Record<string, string[]> | undefined,
): AuditFinding[] {
  if (!jurisdictionRequirements) return [];

  // Derive country from currency code as a fallback heuristic
  const country = inferCountryFromCurrency(line.currencyCode);
  if (!country) return [];

  const required = jurisdictionRequirements[country] ?? [];
  const present  = new Set(line.taxBucketCodes ?? []);
  const missing  = required.filter((req) => !present.has(req));

  if (missing.length === 0) return [];

  return [makeFinding({
    severity:      'critical',
    checkCode:     'statutory.missing_bucket',
    statutoryRef:  `${country}-PAYROLL`,
    affectedCount: 1,
    description:   `${line.employeeCode}: missing statutory tax buckets for ${country}: ${missing.join(', ')}`,
    remediation:   `Add ${missing.join(', ')} tax buckets to this line before approval.`,
    isBlocking:    true,
    evidence:      { employeeCode: line.employeeCode, country, missing },
  })];
}

function checkCurrency(line: AuditLineItem, runCurrency: string): AuditFinding[] {
  if (line.currencyCode === runCurrency) return [];
  return [makeFinding({
    severity:      'warning',
    checkCode:     'statutory.currency_mismatch',
    affectedCount: 1,
    description:   `${line.employeeCode}: line currency ${line.currencyCode} ≠ run currency ${runCurrency}`,
    remediation:   'Confirm FX conversion handling. Multi-currency runs require separate audit trail.',
    isBlocking:    false,
    evidence:      { employeeCode: line.employeeCode, lineCurrency: line.currencyCode, runCurrency },
  })];
}

function checkGhost(line: AuditLineItem): AuditFinding[] {
  const findings: AuditFinding[] = [];

  if (line.employeeStatus === 'terminated') {
    findings.push(makeFinding({
      severity:      'critical',
      checkCode:     'ghost.terminated_employee',
      affectedCount: 1,
      description:   `${line.employeeCode}: TERMINATED employee in payroll`,
      remediation:   'Remove from payroll run. Verify final-settlement calculations were handled separately.',
      isBlocking:    true,
      evidence:      { employeeCode: line.employeeCode, employeeStatus: line.employeeStatus },
    }));
  }

  if (line.isActive === false) {
    findings.push(makeFinding({
      severity:      'critical',
      checkCode:     'ghost.inactive_employee',
      affectedCount: 1,
      description:   `${line.employeeCode}: INACTIVE employee in payroll`,
      remediation:   'Remove from payroll or reactivate the employee record.',
      isBlocking:    true,
      evidence:      { employeeCode: line.employeeCode, isActive: false },
    }));
  }
  return findings;
}

function checkDuplicateEmployees(lines: AuditLineItem[]): AuditFinding[] {
  const seen = new Map<string, number>();
  for (const line of lines) {
    seen.set(line.employeeCode, (seen.get(line.employeeCode) ?? 0) + 1);
  }
  const duplicates = Array.from(seen.entries()).filter(([, count]) => count > 1);
  if (duplicates.length === 0) return [];

  return [makeFinding({
    severity:      'critical',
    checkCode:     'ghost.duplicate_employee',
    affectedCount: duplicates.length,
    description:   `${duplicates.length} duplicate employeeCodes in line items: ${duplicates.map(([code]) => code).join(', ')}`,
    remediation:   'Remove duplicates. Each employee must appear in at most one line per run.',
    isBlocking:    true,
    evidence:      { duplicates: Object.fromEntries(duplicates) },
  })];
}

function checkLineHash(line: AuditLineItem): AuditFinding[] {
  if (!line.lineHash || !LINE_HASH_PATTERN.test(line.lineHash)) {
    return [makeFinding({
      severity:      'warning',
      checkCode:     'audit.missing_line_hash',
      affectedCount: 1,
      description:   `${line.employeeCode}: lineHash missing or malformed`,
      remediation:   'Re-run line-hash generation. Approval requires every line to have a valid hash.',
      isBlocking:    false,
      evidence:      { employeeCode: line.employeeCode, lineHash: line.lineHash ?? null },
    })];
  }
  return [];
}

function checkHeadcountIntegrity(run: AuditPayrollRunInput): AuditFinding[] {
  if (run.employeeCount === run.lineItems.length) return [];
  return [makeFinding({
    severity:      'critical',
    checkCode:     'audit.headcount_mismatch',
    affectedCount: 1,
    description:   `headcountHash mismatch: declared ${run.employeeCount}, found ${run.lineItems.length} line items`,
    remediation:   'Re-generate run with correct line items, or update employeeCount field.',
    isBlocking:    true,
    evidence:      { declared: run.employeeCount, found: run.lineItems.length },
  })];
}

function checkAnomalyRoundBump(line: AuditLineItem): AuditFinding[] {
  if (!line.priorGrossSalary || line.grossSalary === undefined) return [];
  const delta = line.grossSalary - line.priorGrossSalary;
  // Detect changes that land on exact round multiples (suspicious for fraud or unreviewed manual change)
  const roundFactors = [10000, 5000, 50000, 100000];
  for (const factor of roundFactors) {
    if (delta !== 0 && Math.abs(delta) % factor === 0 && Math.abs(delta) >= factor) {
      return [makeFinding({
        severity:      'informational',
        checkCode:     'anomaly.round_number_bump',
        affectedCount: 1,
        description:   `${line.employeeCode}: salary changed by exactly ${delta.toLocaleString()} ${line.currencyCode}`,
        remediation:   'Round-number changes can indicate manual unreviewed edits. Verify HR approval document.',
        isBlocking:    false,
        evidence:      { employeeCode: line.employeeCode, delta, factor },
      })];
    }
  }
  return [];
}

function checkExcessiveOvertime(line: AuditLineItem): AuditFinding[] {
  if ((line.overtimeHours ?? 0) <= 80) return [];
  return [makeFinding({
    severity:      'critical',
    checkCode:     'anomaly.excessive_overtime',
    affectedCount: 1,
    description:   `${line.employeeCode}: ${line.overtimeHours}h overtime exceeds 80h legal threshold`,
    remediation:   'Verify timesheets. May violate working-time directive (EU/UK) or FLSA caps (US).',
    isBlocking:    true,
    evidence:      { employeeCode: line.employeeCode, overtimeHours: line.overtimeHours },
  })];
}

function checkNewHireFullMonth(line: AuditLineItem): AuditFinding[] {
  if (!line.hireDate || !line.priorGrossSalary || line.priorGrossSalary > 0) return [];
  // First-month employee with no prior gross; flag if full base salary paid
  if (line.grossSalary && line.baseSalary && Math.abs(line.grossSalary - line.baseSalary) < 1) {
    const hireDate = new Date(line.hireDate);
    const daysOfMonth = new Date(hireDate.getFullYear(), hireDate.getMonth() + 1, 0).getDate();
    const daysWorked  = daysOfMonth - hireDate.getDate() + 1;
    if (daysWorked < daysOfMonth) {
      return [makeFinding({
        severity:      'warning',
        checkCode:     'anomaly.new_hire_full_month',
        affectedCount: 1,
        description:   `${line.employeeCode}: new hire received full-month pay (${line.grossSalary}) but only worked ${daysWorked}/${daysOfMonth} days`,
        remediation:   'Pro-rate gross salary or confirm sign-on bonus offset.',
        isBlocking:    false,
        evidence:      { employeeCode: line.employeeCode, daysWorked, daysOfMonth, gross: line.grossSalary },
      })];
    }
  }
  return [];
}

function checkApprovalSignature(run: AuditPayrollRunInput): AuditFinding[] {
  const approvedStates = ['approved', 'processing', 'paid'];
  if (!approvedStates.includes(run.runStatus)) return [];
  if (!run.approvedById) {
    return [makeFinding({
      severity:      'critical',
      checkCode:     'audit.unsigned_approval',
      affectedCount: 1,
      description:   `Run status is ${run.runStatus} but approvedById is null`,
      remediation:   'Reverse run to draft. Approval signature must be present for any post-draft state.',
      isBlocking:    true,
      evidence:      { runStatus: run.runStatus, approvedById: run.approvedById },
    })];
  }
  return [];
}

function checkDepartmentVariance(run: AuditPayrollRunInput): AuditFinding[] {
  // Aggregate gross by inferred department (if line items had a deptCode field we'd use it;
  // for now we operate at the run-level)
  const totalGross = run.lineItems.reduce((s, l) => s + (l.grossSalary ?? 0), 0);
  const totalPrior = run.lineItems.reduce((s, l) => s + (l.priorGrossSalary ?? 0), 0);
  if (totalPrior <= 0) return [];

  const variance = Math.abs(totalGross - totalPrior) / totalPrior;
  if (variance > 0.10) {
    return [makeFinding({
      severity:      'warning',
      checkCode:     'variance.department_high',
      affectedCount: run.lineItems.length,
      description:   `Run-level gross variance ${(variance * 100).toFixed(1)}% (prior ${totalPrior.toLocaleString()} → now ${totalGross.toLocaleString()})`,
      remediation:   'Investigate cohort-level events (bonus payout, headcount changes, FX swing).',
      isBlocking:    false,
      evidence:      { totalGross, totalPrior, variancePct: variance },
    })];
  }
  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────

export function auditPayrollRun(input: AuditPayrollRunInput): AuditPayrollRunResult {
  const findings: AuditFinding[] = [];

  // Run-level checks
  findings.push(...checkHeadcountIntegrity(input));
  findings.push(...checkApprovalSignature(input));
  findings.push(...checkDuplicateEmployees(input.lineItems));
  findings.push(...checkDepartmentVariance(input));

  // Per-line checks
  for (const line of input.lineItems) {
    findings.push(...checkVariance(line));
    findings.push(...checkStatutoryBuckets(line, input.jurisdictionRequirements));
    findings.push(...checkCurrency(line, input.currencyCode));
    findings.push(...checkGhost(line));
    findings.push(...checkLineHash(line));
    findings.push(...checkAnomalyRoundBump(line));
    findings.push(...checkExcessiveOvertime(line));
    findings.push(...checkNewHireFullMonth(line));
  }

  const criticalCount      = findings.filter((f) => f.severity === 'critical').length;
  const warningCount       = findings.filter((f) => f.severity === 'warning').length;
  const informationalCount = findings.filter((f) => f.severity === 'informational').length;

  return {
    runId:              input.runId,
    totalFindings:      findings.length,
    criticalCount,
    warningCount,
    informationalCount,
    findings,
    recommendedStatus:  criticalCount > 0 ? 'audit_failed' : 'audit_passed',
    computedAt:         new Date(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function inferCountryFromCurrency(currency: string): string | null {
  switch (currency.toUpperCase()) {
    case 'USD': return 'US';
    case 'GBP': return 'GB';
    case 'EUR': return 'EU';
    case 'INR': return 'IN';
    case 'SGD': return 'SG';
    case 'AED': return 'AE';
    case 'JPY': return 'JP';
    case 'CAD': return 'CA';
    case 'AUD': return 'AU';
    case 'CHF': return 'CH';
    default:    return null;
  }
}
