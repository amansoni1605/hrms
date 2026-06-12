import { NextRequest, NextResponse }     from 'next/server';
import { withRoute }                     from '@/lib/withRoute';
import {
  WorkspaceLeaveRequest, WorkspaceEmployee, WorkspaceUser, Tenant,
}                                        from '@/models/workspace.models';
import { TenantContext }                 from '@/infrastructure/multiTenantCore';
import { notify }                        from '@/lib/notificationService';
import { sendLeaveSubmittedEmail }       from '@/lib/mailer';
import mongoose                          from 'mongoose';

export const GET = withRoute(async (req, session) => {
  if (!session.employeeId) return NextResponse.json({ error: 'No employee linked' }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const year      = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()));
  const yearStart = new Date(year, 0, 1);
  const yearEnd   = new Date(year, 11, 31);

  const empOid = new mongoose.Types.ObjectId(session.employeeId);

  const [leaves, balancePipeline] = await Promise.all([
    WorkspaceLeaveRequest.find({
      employeeId: empOid,
      startDate:  { $gte: yearStart, $lte: yearEnd },
    }).sort({ createdAt: -1 }).lean(),
    WorkspaceLeaveRequest.aggregate([
      { $match: { employeeId: empOid, status: 'approved', startDate: { $gte: yearStart } } },
      { $group: { _id: '$leaveType', totalDays: { $sum: '$totalDays' } } },
    ]),
  ]);

  const balMap: Record<string, number> = {};
  for (const b of balancePipeline as Array<{ _id: string; totalDays: number }>) {
    balMap[b._id] = Math.round(b.totalDays);
  }

  return NextResponse.json({
    data: leaves,
    balance: {
      annual:     21,
      sick:       12,
      earned:     5,
      usedAnnual: balMap['annual'] ?? 0,
      usedSick:   balMap['sick']   ?? 0,
      remaining:  Math.max(0, 21 - (balMap['annual'] ?? 0)),
    },
  });
});

export const POST = withRoute(async (req, session) => {
  if (!session.employeeId) return NextResponse.json({ error: 'No employee linked' }, { status: 404 });

  const body = await req.json();
  const { leaveType, startDate, endDate, reason } = body;

  const VALID_LEAVE_TYPES = ['annual', 'sick', 'maternity', 'paternity', 'unpaid', 'compensatory'];
  if (!leaveType || !startDate || !endDate || !reason) {
    return NextResponse.json({ error: 'leaveType, startDate, endDate and reason are required' }, { status: 400 });
  }
  if (!VALID_LEAVE_TYPES.includes(String(leaveType))) {
    return NextResponse.json({ error: `Invalid leaveType. Must be one of: ${VALID_LEAVE_TYPES.join(', ')}` }, { status: 400 });
  }
  if (!String(reason).trim()) {
    return NextResponse.json({ error: 'reason cannot be blank' }, { status: 400 });
  }

  const ctx       = TenantContext.requireStore('POST /api/me/leaves');
  const start     = new Date(startDate);
  const end       = new Date(endDate);

  if (isNaN(start.getTime())) return NextResponse.json({ error: 'startDate is not a valid date' }, { status: 400 });
  if (isNaN(end.getTime()))   return NextResponse.json({ error: 'endDate is not a valid date' }, { status: 400 });
  if (end < start)            return NextResponse.json({ error: 'endDate must be on or after startDate' }, { status: 400 });

  const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000) + 1);
  const empOid    = new mongoose.Types.ObjectId(session.employeeId);

  // Double-booking guard — can't apply if there's already an approved/pending leave overlapping
  const clash = await WorkspaceLeaveRequest.findOne({
    employeeId: empOid,
    status:     { $in: ['pending_manager', 'pending_hr', 'pending', 'approved'] },
    startDate:  { $lte: end },
    endDate:    { $gte: start },
  }).lean();
  if (clash) {
    return NextResponse.json({ error: 'You already have a leave request overlapping these dates' }, { status: 409 });
  }

  // Look up employee to find their direct manager
  const empDoc = await WorkspaceEmployee
    .findById(empOid)
    .select('employeeCode managerId')
    .lean() as { employeeCode?: string; managerId?: mongoose.Types.ObjectId } | null;

  const employeeCode = empDoc?.employeeCode ?? session.name ?? session.email;
  const managerId    = empDoc?.managerId ?? null;

  // Route to manager first if they have one, otherwise straight to HR
  const initialStatus = managerId ? 'pending_manager' : 'pending_hr';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leave = await (WorkspaceLeaveRequest as any).create({
    tenantId:   ctx.tenantId,
    employeeId: empOid,
    leaveType,
    startDate:  start,
    endDate:    end,
    totalDays,
    reason,
    status:     initialStatus,
    managerId:  managerId ?? undefined,
  });

  await notify.leaveSubmitted({
    tenantId:     ctx.tenantId.toString(),
    employeeCode,
    employeeId:   session.employeeId!,
    leaveType,
    totalDays,
    startDate:    start.toISOString().slice(0, 10),
    leaveId:      leave._id.toString(),
    managerId:    managerId?.toString(),
  });

  // ── Email the manager ───────────────────────────────────────────────────────
  if (managerId) {
    void (async () => {
      const [managerUser, tenantDoc] = await Promise.all([
        (WorkspaceUser as any).findOne({ employeeId: managerId }).select('email name').lean() as
          Promise<{ email: string; name: string } | null>,
        Tenant.findById(ctx.tenantId).select('displayName legalName brandColor').lean() as
          Promise<{ displayName?: string; legalName: string; brandColor?: string } | null>,
      ]);
      if (!managerUser?.email) return;
      await sendLeaveSubmittedEmail({
        to:           managerUser.email,
        managerName:  managerUser.name,
        employeeName: String(empDoc ? (empDoc as any).jobTitle ?? employeeCode : employeeCode),
        leaveType,
        startDate:    start.toISOString().slice(0, 10),
        endDate:      end.toISOString().slice(0, 10),
        totalDays,
        reason:       String(reason),
        leaveId:      leave._id.toString(),
        companyName:  tenantDoc?.displayName ?? tenantDoc?.legalName ?? 'HRMS',
        brandColor:   tenantDoc?.brandColor,
      });
    })();
  }

  return NextResponse.json({ data: leave }, { status: 201 });
});
