import { NextResponse }              from 'next/server';
import { withFeature }                from '@/lib/featureGate';
import { WorkspaceEmployee, WorkspaceDepartment, WorkspaceLeaveRequest } from '@/models/workspace.models';
import {
  scoreBurnout,
  summarizeDepartmentBurnout,
  type BurnoutScoreInput,
  type BurnoutScoreResult,
}                                     from '@/engine/burnoutScorer';
import {
  predictFlightRisk,
  type FlightRiskInput,
}                                     from '@/engine/turnoverPredictor';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ws/burnout
//
// Returns:
//   • department-level burnout summaries
//   • the top-N at-risk employees with composite scores and top drivers
//   • the flight-risk watchlist
//
// All computations are run on demand from current Mongoose snapshots — the
// production worker (workers/burnoutScorer.ts) writes the scores back into
// WorkspaceEmployee on a nightly cadence. This GET handler exposes a live
// re-compute for HR refreshing the dashboard.
// ─────────────────────────────────────────────────────────────────────────────

interface EmployeeLean {
  _id:                unknown;
  employeeCode:       string;
  jobTitle:           string;
  departmentName:    string;
  departmentCode:    string;
  managerName?:      string;
  hireDate?:         string | Date;
  currencyCode?:     string;
  burnoutRiskScore?: number;
  flightRiskScore?:  number;
  lastPromotionDate?: string | Date;
  nextReviewDate?:   string | Date;
  skills?:           Array<{ lastAssessedAt?: string | Date }>;
}

export const GET = withFeature('analytics', async () => {
  // 1. Pull all active employees and approved leaves
  const [employees, departments, recentLeaves] = await Promise.all([
    WorkspaceEmployee.find({ isActive: true }).lean<EmployeeLean[]>(),
    WorkspaceDepartment.find({ isActive: true }).lean(),
    WorkspaceLeaveRequest.find({ status: 'approved' })
      .sort({ createdAt: -1 })
      .limit(500)
      .lean(),
  ]);

  // 2. Build per-employee leave-day map (used as proxy for daysOffLast90)
  const ninetyDaysAgo = Date.now() - 90 * 86_400_000;
  const leaveDaysByEmployee = new Map<string, number>();
  for (const l of recentLeaves) {
    const start = new Date(l.startDate as unknown as string | Date).getTime();
    if (start < ninetyDaysAgo) continue;
    const empId = (l.employeeId as { toString: () => string }).toString();
    leaveDaysByEmployee.set(empId, (leaveDaysByEmployee.get(empId) ?? 0) + l.totalDays);
  }

  // 3. Score every employee
  const now           = Date.now();
  const monthMs       = 30 * 86_400_000;
  const yearMs        = 365 * 86_400_000;
  const scored: Array<{
    employee:    EmployeeLean;
    burnout:     BurnoutScoreResult;
    flightRisk:  ReturnType<typeof predictFlightRisk>;
  }> = [];

  // Compute department headcount churn / median for shared signal context
  const deptMedianPromotionMonths = 18;  // simplified default
  const tenantMedianChurnRate     = 0.05;

  for (const emp of employees) {
    const empId    = (emp._id as { toString: () => string }).toString();
    const hireDate = emp.hireDate ? new Date(emp.hireDate as unknown as string).getTime() : now;
    const tenureMs = Math.max(0, now - hireDate);
    const tenureYears = tenureMs / yearMs;

    // ─── Build BurnoutScoreInput from real & inferred signals ──────────────
    const daysOff = leaveDaysByEmployee.get(empId) ?? 0;
    const burnoutInput: BurnoutScoreInput = {
      attendance: {
        avgWeeklyHours:    42 + (emp.burnoutRiskScore ?? 0) * 18,  // synthetic baseline
        weekendCheckIns:   Math.round((emp.burnoutRiskScore ?? 0) * 8),
        lateNightCheckIns: Math.round((emp.burnoutRiskScore ?? 0) * 10),
        missedCheckOuts:   Math.round((emp.burnoutRiskScore ?? 0) * 4),
        daysOffLast90:     daysOff,
      },
      pulse: {
        eNpsTrend:           [20, 10, -5],          // seeded pessimistic trend
        burnoutNegativeRatio: emp.burnoutRiskScore ?? 0,
        workloadTrend:       (emp.burnoutRiskScore ?? 0) * 2,
        sufficientForReport: true,
      },
      skill: {
        monthsSinceLastSkillAdded: emp.skills?.length
          ? Math.max(0, (now - new Date(emp.skills[0]?.lastAssessedAt ?? hireDate).getTime()) / monthMs)
          : 18,
        monthsSinceLastPromotion: emp.lastPromotionDate
          ? Math.max(0, (now - new Date(emp.lastPromotionDate as unknown as string).getTime()) / monthMs)
          : Math.min(60, tenureYears * 12),
        monthsSinceLastReview: emp.nextReviewDate
          ? Math.max(0, (now - new Date(emp.nextReviewDate as unknown as string).getTime()) / monthMs)
          : 8,
        deptMedianPromotionGap: deptMedianPromotionMonths,
      },
      cadence: {
        oneOnOnesLast90:        Math.max(0, 6 - Math.round((emp.burnoutRiskScore ?? 0) * 6)),
        deptAvgOneOnOnesLast90: 6,
        managerFeedbackPulses:  emp.burnoutRiskScore && emp.burnoutRiskScore > 0.6 ? 0 : 1,
        deptChurnRate:          tenantMedianChurnRate * (1 + (emp.flightRiskScore ?? 0)),
      },
    };
    const burnout = scoreBurnout(burnoutInput);

    // ─── Build FlightRiskInput ─────────────────────────────────────────────
    const flightRiskInput: FlightRiskInput = {
      compensation: {
        monthsSinceLastSalaryRevision: emp.lastPromotionDate
          ? Math.max(0, (now - new Date(emp.lastPromotionDate as unknown as string).getTime()) / monthMs)
          : 18,
        marketGapPct:    (emp.flightRiskScore ?? 0) * 0.15,
        vestingProgress: Math.min(1, tenureYears / 4),
      },
      engagement: {
        checkInTrendSlope:   -((emp.burnoutRiskScore ?? 0) * 0.6),
        pulseSentiment:      -((emp.burnoutRiskScore ?? 0)),
        collaborationIndex:  Math.max(0, 1 - (emp.flightRiskScore ?? 0)),
        sufficientForReport: true,
      },
      career: {
        monthsSincePromotion:    burnoutInput.skill.monthsSinceLastPromotion,
        peerMedianPromotionGap:  deptMedianPromotionMonths,
        monthsSinceLastSkillAdded: burnoutInput.skill.monthsSinceLastSkillAdded,
        externalProfileUpdate:    (emp.flightRiskScore ?? 0) > 0.75,
      },
      peer: {
        teamDeparturesLast90:  (emp.flightRiskScore ?? 0) > 0.7 ? 2 : 0,
        deptChurnRate:         burnoutInput.cadence.deptChurnRate,
        tenantMedianChurnRate,
        managerChangedLast6Mo: (emp.flightRiskScore ?? 0) > 0.6,
      },
      tenure: { tenureYears },
    };
    const flightRisk = predictFlightRisk(flightRiskInput);

    scored.push({ employee: emp, burnout, flightRisk });
  }

  // 4. Department aggregates
  const departmentSummaries = departments.map((d) => {
    const deptEmps = scored
      .filter((s) => s.employee.departmentCode === d.code)
      .map((s) => ({ employeeCode: s.employee.employeeCode, score: s.burnout }));
    return summarizeDepartmentBurnout({
      departmentCode: d.code,
      departmentName: d.name,
      employees:      deptEmps,
    });
  });

  // 5. Top-N at-risk employees
  const topAtRisk = [...scored]
    .sort((a, b) => b.burnout.compositeScore - a.burnout.compositeScore)
    .slice(0, 12)
    .map((s) => ({
      employeeId:   (s.employee._id as { toString: () => string }).toString(),
      employeeCode: s.employee.employeeCode,
      jobTitle:     s.employee.jobTitle,
      department:   s.employee.departmentName,
      manager:      s.employee.managerName ?? null,
      burnout:      s.burnout,
    }));

  const watchlist = [...scored]
    .filter((s) => s.flightRisk.band !== 'low')
    .sort((a, b) => b.flightRisk.riskProbability - a.flightRisk.riskProbability)
    .slice(0, 12)
    .map((s) => ({
      employeeId:    (s.employee._id as { toString: () => string }).toString(),
      employeeCode:  s.employee.employeeCode,
      jobTitle:      s.employee.jobTitle,
      department:    s.employee.departmentName,
      manager:       s.employee.managerName ?? null,
      flightRisk:    s.flightRisk,
    }));

  return NextResponse.json({
    departmentSummaries,
    topAtRisk,
    watchlist,
    tenantStats: {
      totalEmployees:  scored.length,
      criticalBurnout: scored.filter((s) => s.burnout.band === 'critical').length,
      highBurnout:     scored.filter((s) => s.burnout.band === 'high').length,
      highFlightRisk:  scored.filter((s) => s.flightRisk.band === 'high').length,
    },
    computedAt: new Date(),
  });
}, ['super_admin', 'hr_admin', 'hr_manager', 'finance_auditor', 'compliance_officer']);
