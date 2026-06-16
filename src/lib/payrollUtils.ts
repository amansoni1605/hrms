/**
 * Shared payroll computation helpers.
 * Used by the payroll run creation route and the audit worker.
 */

import { WorkspaceLeaveRequest, WorkspaceAttendance } from '@/models/workspace.models';
import { indiaEngine }                               from '@/lib/taxEngines/india';
import mongoose                                      from 'mongoose';

// ─────────────────────────────────────────────────────────────────────────────
// Working-day calendar
// ─────────────────────────────────────────────────────────────────────────────

export function workingDaysInMonth(year: number, month: number): number {
  const d = new Date(year, month - 1, 1);
  let count = 0;
  while (d.getMonth() === month - 1) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

// Count Mon-Fri days in [from, to] (inclusive).
function workingDaysBetween(from: Date, to: Date): number {
  let count = 0;
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(23, 59, 59, 999);
  while (d <= end) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

// Leave types where pay is NOT deducted — these protect attendanceDays.
const PAID_LEAVE_TYPES = new Set(['annual', 'sick', 'maternity', 'paternity', 'compensatory']);

// ─────────────────────────────────────────────────────────────────────────────
// Attendance fetch (from ws_attendance_timeseries + ws_leave_requests)
// ─────────────────────────────────────────────────────────────────────────────

export async function getAttendanceForPeriod(
  employeeId: string,
  month:      number,
  year:       number,
  tenantId?:  string,
): Promise<{ attendanceDays: number; leaveDaysDeducted: number; lwpDays: number }> {
  const start = new Date(year, month - 1, 1);
  const end   = new Date(year, month,     0, 23, 59, 59);

  const matchStage: Record<string, unknown> = {
    'meta.employeeId': new mongoose.Types.ObjectId(employeeId),
    eventType:         'check_in',
    ts:                { $gte: start, $lte: end },
  };
  // Aggregate bypasses Mongoose middleware — inject tenantId explicitly.
  if (tenantId) {
    matchStage['meta.tenantId'] = new mongoose.Types.ObjectId(tenantId);
  }

  const agg = await WorkspaceAttendance.aggregate([
    { $match: matchStage },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$ts' } } } },
    { $count: 'days' },
  ]);
  const checkedInDays: number = agg[0]?.days ?? 0;

  // Approved leave overlapping this payroll period.
  const leaveReqs = await WorkspaceLeaveRequest.find({
    employeeId: new mongoose.Types.ObjectId(employeeId),
    status:     'approved',
    startDate:  { $lte: end },
    endDate:    { $gte: start },
  }).lean();

  // Only PAID leave protects against LWP deduction.
  let paidLeaveDays = 0;
  for (const req of leaveReqs) {
    if (PAID_LEAVE_TYPES.has(req.leaveType ?? '')) {
      const overlapStart = req.startDate > start ? req.startDate : start;
      const overlapEnd   = req.endDate   < end   ? req.endDate   : end;
      paidLeaveDays += workingDaysBetween(overlapStart, overlapEnd);
    }
  }

  const working = workingDaysInMonth(year, month);

  const attendanceDays = checkedInDays > 0
    ? Math.min(checkedInDays, working)
    : Math.max(0, working - paidLeaveDays);

  // Days absent without any paid-leave cover = LWP.
  const lwpDays = checkedInDays > 0
    ? Math.max(0, working - attendanceDays - paidLeaveDays)
    : 0;   // no check-in data → assume full attendance

  return { attendanceDays, leaveDaysDeducted: paidLeaveDays, lwpDays };
}

// ─────────────────────────────────────────────────────────────────────────────
// TDS — India new regime (§192 Income Tax Act)
// ─────────────────────────────────────────────────────────────────────────────

export function computeMonthlyTDS(annualGross: number): number {
  const result = indiaEngine.compute({
    grossAnnualIncome: annualGross,
    regime:            'new',
    declarations:      {},
  });
  return Math.max(0, Math.round(result.estimatedTax / 12));
}

// ─────────────────────────────────────────────────────────────────────────────
// Full pay component computation
// ─────────────────────────────────────────────────────────────────────────────

export interface PayComponents {
  gross:      number;
  pf:         number;   // Provident Fund (employee share)
  pt:         number;   // Professional Tax
  tds:        number;   // Tax Deducted at Source
  lwp:        number;   // Loss of Pay deduction (₹)
  deductions: number;   // pf + pt + tds + lwp
  net:        number;
  workingDays:number;
}

export function computePayComponents(
  baseSalary:  number,
  currencyCode = 'INR',
  lwpDays      = 0,
  workingDays  = 26,
): PayComponents {
  const gross = Math.round(baseSalary * 1.28); // HRA 40% + transport + medical + other
  const pf    = Math.min(Math.round(baseSalary * 0.12), 1_800);
  const pt    = currencyCode === 'INR' ? 200 : 0;
  // TDS computed on full-month gross (LWP is a separate deduction per India payroll convention)
  const tds   = computeMonthlyTDS(gross * 12);
  // LWP: per-working-day rate × absent-without-leave days
  const lwp   = lwpDays > 0 && workingDays > 0
    ? Math.round(gross * lwpDays / workingDays)
    : 0;
  const deductions = pf + pt + tds + lwp;
  const net   = Math.max(0, gross - deductions);
  return { gross, pf, pt, tds, lwp, deductions, net, workingDays };
}
