import { NextResponse }                from 'next/server';
import { withRoute }                    from '@/lib/withRoute';
import { WorkspaceEmployee, WorkspacePerformanceReview } from '@/models/workspace.models';
import { decryptField, TenantContext }  from '@/infrastructure/multiTenantCore';
import mongoose                         from 'mongoose';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/me/team
//
// The authenticated user's team — anyone who reports to them (data-driven via
// employee.managerId, not a role).  Returns direct reports with their current
// review status + risk signals, the skip-level (2nd-line) reports beneath them,
// team KPIs, and the manager's own action list (reviews to finalize, skip-level
// endorsements awaiting them).  All compensation/PII stays encrypted — this view
// is operational metadata only.
// ─────────────────────────────────────────────────────────────────────────────

interface ReportRow {
  _id: string; employeeCode: string; fullName: string;
  jobTitle: string; departmentName: string;
  employeeStatus: string; employmentType: string;
  burnoutRiskScore: number; flightRiskScore: number; engagementPct: number | null;
  managerName: string | null;
  review: { _id: string; cycleLabel: string; status: string; overallRating?: number } | null;
  actionNeeded: 'finalize_review' | 'awaiting_self_assessment' | 'awaiting_employee_ack' | null;
}

interface JoinerRow {
  _id: string; employeeCode: string; jobTitle: string; departmentName: string;
  hireDate: string; countryCode: string; employmentType: string;
}

export const GET = withRoute(async (_req, session) => {
  if (!session.employeeId) {
    return NextResponse.json({ data: { isManager: false, teamSize: 0, directReports: [], skipLevelReports: [], kpis: null, actions: [] } });
  }
  const myEmpId = new mongoose.Types.ObjectId(session.employeeId);

  const reportFields = 'employeeCode fullNameEnc jobTitle departmentName employeeStatus employmentType burnoutRiskScore flightRiskScore engagementPct managerId managerName hireDate countryCode';
  const allDirects = await WorkspaceEmployee.find({ managerId: myEmpId, isActive: true }).select(reportFields).lean();

  // Separate pre-hire (upcoming joiners) from active team members
  const preHireDirects = allDirects.filter((d) => d.employeeStatus === 'pre_hire');
  const directs        = allDirects.filter((d) => d.employeeStatus !== 'pre_hire');

  // Skip-level reports = reports of my direct reports (active only).
  const directIds = directs.map((d) => d._id);
  const skips = directIds.length
    ? await WorkspaceEmployee.find({ managerId: { $in: directIds }, isActive: true }).select(reportFields).lean()
    : [];

  // Latest review per employee across direct + skip reports.
  const allIds = [...directIds, ...skips.map((s) => s._id)];
  const reviews = allIds.length
    ? await WorkspacePerformanceReview.find({ employeeId: { $in: allIds }, isActive: true })
        .select('employeeId cycleLabel status overallRating createdAt')
        .sort({ createdAt: -1 }).lean()
    : [];
  const latestByEmp = new Map<string, typeof reviews[number]>();
  for (const r of reviews) {
    const k = r.employeeId.toString();
    if (!latestByEmp.has(k)) latestByEmp.set(k, r);   // first seen = newest (sorted desc)
  }

  const ctx      = TenantContext.requireStore('GET /api/me/team');
  const tenantId = ctx.tenantId.toString();

  const decryptName = async (e: typeof directs[number]): Promise<string> => {
    const enc = (e as unknown as { fullNameEnc?: Buffer }).fullNameEnc;
    if (!enc) return e.employeeCode;
    try { return await decryptField(tenantId, enc); } catch { return e.employeeCode; }
  };

  const nameMap = new Map<string, string>();
  await Promise.all([...directs, ...skips].map(async (e) => {
    nameMap.set((e._id as mongoose.Types.ObjectId).toString(), await decryptName(e));
  }));

  const toRow = (e: typeof directs[number]): ReportRow => {
    const rv = latestByEmp.get((e._id as mongoose.Types.ObjectId).toString());
    let actionNeeded: ReportRow['actionNeeded'] = null;
    if (rv) {
      if (rv.status === 'manager_review')        actionNeeded = 'finalize_review';
      else if (rv.status === 'self_assessment')  actionNeeded = 'awaiting_self_assessment';
      else if (rv.status === 'finalized')        actionNeeded = 'awaiting_employee_ack';
    }
    return {
      _id:            (e._id as mongoose.Types.ObjectId).toString(),
      employeeCode:   e.employeeCode,
      fullName:       nameMap.get((e._id as mongoose.Types.ObjectId).toString()) ?? e.employeeCode,
      jobTitle:       e.jobTitle,
      departmentName: e.departmentName,
      employeeStatus: e.employeeStatus,
      employmentType: e.employmentType,
      burnoutRiskScore: e.burnoutRiskScore,
      flightRiskScore:  e.flightRiskScore,
      engagementPct:    e.engagementPct ?? null,
      managerName:      (e as unknown as { managerName?: string }).managerName ?? null,
      review: rv ? { _id: (rv._id as mongoose.Types.ObjectId).toString(), cycleLabel: rv.cycleLabel, status: rv.status, overallRating: rv.overallRating } : null,
      actionNeeded,
    };
  };

  const directReports    = directs.map(toRow);
  const skipLevelReports = skips.map(toRow);

  const upcomingJoiners: JoinerRow[] = preHireDirects.map((e) => ({
    _id:            (e._id as mongoose.Types.ObjectId).toString(),
    employeeCode:   e.employeeCode,
    jobTitle:       e.jobTitle,
    departmentName: e.departmentName,
    hireDate:       e.hireDate ? (e.hireDate as Date).toISOString().slice(0, 10) : '',
    countryCode:    e.countryCode,
    employmentType: e.employmentType,
  }));

  // Skip-level endorsements awaiting THIS manager (two-step PMS).
  const pendingEndorsements = await WorkspacePerformanceReview.find({
    'compensation.skipLevelManagerId': myEmpId,
    'compensation.currentStep': 'skip_level',
    'compensation.decision': 'pending',
  }).select('employeeCode cycleLabel compensation.incrementPct compensation.promotion').lean();

  // Build the manager's action list.
  const actions = [
    ...directReports.filter((r) => r.actionNeeded === 'finalize_review').map((r) => ({
      type: 'finalize_review', label: `Finalize ${r.fullName}'s review (${r.employeeCode})`, reviewId: r.review?._id, employeeCode: r.employeeCode,
    })),
    ...pendingEndorsements.map((p) => ({
      type: 'endorse_comp', label: `Endorse ${p.employeeCode}'s compensation`, reviewId: (p._id as mongoose.Types.ObjectId).toString(), employeeCode: p.employeeCode,
    })),
  ];

  const engaged = directReports.filter((r) => r.engagementPct != null);
  const kpis = {
    teamSize:           directReports.length,
    extendedTeamSize:   directReports.length + skipLevelReports.length,
    avgEngagement:      engaged.length ? Math.round(engaged.reduce((a, r) => a + (r.engagementPct ?? 0), 0) / engaged.length) : null,
    atRiskCount:        directReports.filter((r) => r.flightRiskScore >= 0.7 || r.burnoutRiskScore >= 0.7).length,
    reviewsToFinalize:  directReports.filter((r) => r.actionNeeded === 'finalize_review').length,
    pendingEndorsements: pendingEndorsements.length,
  };

  return NextResponse.json({
    data: {
      isManager:    directReports.length > 0 || upcomingJoiners.length > 0 || pendingEndorsements.length > 0,
      teamSize:     directReports.length,
      directReports, skipLevelReports, upcomingJoiners, kpis, actions,
    },
  });
});
