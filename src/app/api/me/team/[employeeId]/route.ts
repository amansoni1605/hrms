import { NextRequest, NextResponse }     from 'next/server';
import { runWithSession }                 from '@/lib/withRoute';
import {
  WorkspaceEmployee,
  WorkspaceLeaveBalance, WorkspaceLeaveRequest,
  WorkspaceAttendance,
  WorkspacePerformanceReview,
  WorkspaceGoal,
  WorkspaceExpenseClaim,
}                                         from '@/models/workspace.models';
import { TenantContext, decryptField }    from '@/infrastructure/multiTenantCore';
import mongoose                           from 'mongoose';

interface EmergencyContact { name?: string; relationship?: string; phone?: string; email?: string }

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/me/team/[employeeId]
//
// 360° view of a single team member — only accessible to their direct or
// skip-level manager.  Decrypts PII (name / email / phone) for this one
// employee; all other encrypted fields are stripped before the response.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> },
) {
  const { employeeId } = await params;
  return runWithSession(async (session) => {
    if (!session.employeeId)
      return NextResponse.json({ error: 'No employee linked' }, { status: 401 });

    const ctx      = TenantContext.requireStore('GET /api/me/team/[employeeId]');
    const tenantId = ctx.tenantId.toString();
    const myEmpId  = new mongoose.Types.ObjectId(session.employeeId);

    let targetId: mongoose.Types.ObjectId;
    try { targetId = new mongoose.Types.ObjectId(employeeId); }
    catch { return NextResponse.json({ error: 'Invalid id' }, { status: 400 }); }

    const emp = await WorkspaceEmployee.findOne({ _id: targetId, isActive: true }).lean();
    if (!emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

    // Authorization: caller must be a direct or skip-level manager
    const isDirectManager = emp.managerId?.toString() === session.employeeId;
    let isSkipLevel = false;
    if (!isDirectManager && emp.managerId) {
      const directMgr = await WorkspaceEmployee.findById(emp.managerId)
        .select('managerId').lean();
      isSkipLevel = directMgr?.managerId?.toString() === session.employeeId;
    }
    if (!isDirectManager && !isSkipLevel)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // Decrypt PII — best-effort, never leak Buffer in response
    const tryDec = async (buf: unknown): Promise<string | null> => {
      try { return buf ? await decryptField(tenantId, buf as Buffer) : null; }
      catch { return null; }
    };

    const [fullName, email, phone] = await Promise.all([
      tryDec(emp.fullNameEnc),
      tryDec(emp.emailEnc),
      tryDec(emp.phoneEnc),
    ]);

    const hireDate    = emp.hireDate ? new Date(emp.hireDate) : null;
    const tenureYears = hireDate
      ? +((Date.now() - hireDate.getTime()) / (365.25 * 86_400_000)).toFixed(1)
      : null;

    // Parallel data fetch for all 360° sections
    const currentYear = new Date().getFullYear();
    const since30 = new Date();
    since30.setDate(since30.getDate() - 30);
    since30.setHours(0, 0, 0, 0);

    const [leaveBalance, leaveRequests, attendanceLogs, reviews, goals, expenses] =
      await Promise.all([
        WorkspaceLeaveBalance.findOne({ employeeId: targetId, year: currentYear }).lean(),
        WorkspaceLeaveRequest.find({ employeeId: targetId })
          .sort({ createdAt: -1 }).limit(10).lean(),
        WorkspaceAttendance.find({
          'meta.employeeId': targetId,
          ts: { $gte: since30 },
        }).sort({ ts: 1 }).lean(),
        WorkspacePerformanceReview.find({ employeeId: targetId, isActive: true })
          .sort({ createdAt: -1 }).limit(5)
          .select('cycleLabel status overallRating periodStart periodEnd createdAt')
          .lean(),
        WorkspaceGoal.find({ employeeId: targetId, isActive: true })
          .sort({ createdAt: -1 }).limit(10)
          .select('title category status progressPct cycleLabel keyResults weight periodStart periodEnd')
          .lean(),
        WorkspaceExpenseClaim.find({ employeeId: targetId })
          .sort({ createdAt: -1 }).limit(10)
          .select('status totalClaimed totalSanctioned month createdAt items')
          .lean(),
      ]);

    // Build daily attendance summary (same logic as /api/me/attendance)
    const byDate = new Map<string, {
      checkIn?: Date; checkOut?: Date; hours: number; status: string;
    }>();
    for (const log of attendanceLogs) {
      const key = log.ts.toISOString().slice(0, 10);
      const day = byDate.get(key) ?? { hours: 0, status: 'absent' };
      if (log.eventType === 'check_in')  day.checkIn  = log.ts;
      if (log.eventType === 'check_out') day.checkOut = log.ts;
      if (day.checkIn && day.checkOut) {
        day.hours  = (day.checkOut.getTime() - day.checkIn.getTime()) / 3_600_000;
        day.status = day.hours < 2 ? 'absent' : day.hours < 4 ? 'half_day' : 'present';
      }
      byDate.set(key, day);
    }
    const attendanceSummary = Array.from(byDate.entries()).map(([date, d]) => ({
      date,
      status:   d.status,
      checkIn:  d.checkIn?.toISOString()  ?? null,
      checkOut: d.checkOut?.toISOString() ?? null,
      hours:    +d.hours.toFixed(1),
    }));

    return NextResponse.json({
      data: {
        employee: {
          _id:            targetId.toString(),
          employeeCode:   emp.employeeCode,
          jobTitle:       emp.jobTitle,
          departmentName: emp.departmentName,
          departmentCode: emp.departmentCode,
          employeeStatus: emp.employeeStatus,
          employmentType: emp.employmentType,
          hireDate:       emp.hireDate ?? null,
          tenureYears,
          countryCode:    emp.countryCode,
          timezone:       emp.timezone,
          salaryBand:     emp.salaryBand ?? null,
          managerName:    (emp as unknown as { managerName?: string }).managerName ?? null,
          emergencyContact: (emp as unknown as { emergencyContact?: EmergencyContact }).emergencyContact ?? null,
          burnoutRiskScore: emp.burnoutRiskScore,
          flightRiskScore:  emp.flightRiskScore,
          engagementPct:    emp.engagementPct ?? null,
          skills: (emp.skills ?? []).map((s) => ({
            skillName:   s.skillName,
            category:    (s as unknown as { category?: string }).category ?? null,
            proficiency: s.proficiency,
          })),
          isDirectReport: isDirectManager,
          // Decrypted PII
          fullName,
          email,
          phone,
        },
        leaveBalance: leaveBalance
          ? {
              year:      leaveBalance.year,
              annual:    leaveBalance.annual,
              sick:      leaveBalance.sick,
              earned:    leaveBalance.earned,
              used:      leaveBalance.used,
              remaining: leaveBalance.remaining,
            }
          : null,
        leaveRequests: leaveRequests.map((l) => ({
          _id:       (l._id as mongoose.Types.ObjectId).toString(),
          leaveType: l.leaveType,
          startDate: l.startDate,
          endDate:   l.endDate,
          totalDays: l.totalDays,
          status:    l.status,
          reason:    l.reason,
          createdAt: (l as unknown as { createdAt: Date }).createdAt,
        })),
        attendance: {
          stats: {
            presentDays: attendanceSummary.filter((d) => d.status === 'present').length,
            halfDays:    attendanceSummary.filter((d) => d.status === 'half_day').length,
            totalLogged: attendanceSummary.length,
            days:        30,
          },
          summary: attendanceSummary,
        },
        reviews: reviews.map((r) => ({
          _id:           (r._id as mongoose.Types.ObjectId).toString(),
          cycleLabel:    r.cycleLabel,
          status:        r.status,
          overallRating: r.overallRating ?? null,
          periodStart:   r.periodStart   ?? null,
          periodEnd:     r.periodEnd     ?? null,
          createdAt:     r.createdAt,
        })),
        goals: goals.map((g) => ({
          _id:        (g._id as mongoose.Types.ObjectId).toString(),
          title:      g.title,
          category:   g.category,
          status:     g.status,
          progressPct: g.progressPct,
          cycleLabel: g.cycleLabel  ?? null,
          weight:     g.weight,
          keyResults: (g.keyResults ?? []).map((kr: Record<string, unknown>) => ({
            title:        kr.title,
            done:         kr.done,
            currentValue: kr.currentValue,
            targetValue:  kr.targetValue,
            unit:         kr.unit,
          })),
        })),
        expenses: expenses.map((e) => ({
          _id:             (e._id as mongoose.Types.ObjectId).toString(),
          status:          e.status,
          totalClaimed:    e.totalClaimed,
          totalSanctioned: e.totalSanctioned,
          month:           e.month ?? null,
          itemCount:       e.items?.length ?? 0,
          createdAt:       e.createdAt,
        })),
      },
    });
  });
}
