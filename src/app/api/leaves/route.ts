import { NextRequest, NextResponse }         from 'next/server';
import { withRoute, auditEvent }             from '@/lib/withRoute';
import { WorkspaceLeaveRequest }             from '@/models/workspace.models';
import { TenantContext }                     from '@/infrastructure/multiTenantCore';
import { notify }                            from '@/lib/notificationService';
import { createHash }                        from 'node:crypto';
import mongoose                              from 'mongoose';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/leaves
//   HR/Admin: returns all leaves for the tenant with filters.
//   Employees: see their own leaves only (enforced by employeeId filter).
// ─────────────────────────────────────────────────────────────────────────────

export const GET = withRoute(async (req) => {
  const { searchParams } = new URL(req.url);
  const page       = parseInt(searchParams.get('page')   ?? '1');
  const limit      = parseInt(searchParams.get('limit')  ?? '40');
  const status     = searchParams.get('status')     ?? '';
  const employeeId = searchParams.get('employeeId') ?? '';
  const from       = searchParams.get('from')       ?? '';
  const to         = searchParams.get('to')         ?? '';

  const query: Record<string, unknown> = {};
  if (status)     query['status']     = status;
  if (employeeId) query['employeeId'] = employeeId;

  // Date-range filter: leaves that overlap the [from, to] window
  if (from || to) {
    const dateFilter: Record<string, Date> = {};
    if (from) { const d = new Date(from); if (!isNaN(d.getTime())) dateFilter['$gte'] = d; }
    if (to)   { const d = new Date(to);   if (!isNaN(d.getTime())) dateFilter['$lte'] = d; }
    if (Object.keys(dateFilter).length) query['startDate'] = dateFilter;
  }

  const [data, total] = await Promise.all([
    WorkspaceLeaveRequest.find(query)
      .populate('employeeId', 'employeeCode jobTitle')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    WorkspaceLeaveRequest.countDocuments(query),
  ]);

  return NextResponse.json({
    data,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/leaves
//   HR/Admin only — submit a leave on behalf of an employee.
//   SECURITY: status is ALWAYS forced to 'pending' regardless of body payload.
//   Employees must use POST /api/me/leaves.
// ─────────────────────────────────────────────────────────────────────────────

export const POST = withRoute(async (req, session) => {
  const body = await req.json() as Record<string, unknown>;
  const ctx  = TenantContext.requireStore('POST /api/leaves');

  const VALID_LEAVE_TYPES = ['annual', 'sick', 'maternity', 'paternity', 'unpaid', 'compensatory'];
  if (!body['employeeId'] || !body['leaveType'] || !body['startDate'] || !body['endDate'] || !body['reason']) {
    return NextResponse.json({ error: 'employeeId, leaveType, startDate, endDate and reason are required' }, { status: 400 });
  }
  if (!VALID_LEAVE_TYPES.includes(String(body['leaveType']))) {
    return NextResponse.json({ error: `Invalid leaveType. Must be one of: ${VALID_LEAVE_TYPES.join(', ')}` }, { status: 400 });
  }
  if (!String(body['reason']).trim()) {
    return NextResponse.json({ error: 'reason cannot be blank' }, { status: 400 });
  }

  const start = new Date(String(body['startDate']));
  const end   = new Date(String(body['endDate']));

  if (isNaN(start.getTime())) return NextResponse.json({ error: 'startDate is not a valid date' }, { status: 400 });
  if (isNaN(end.getTime()))   return NextResponse.json({ error: 'endDate is not a valid date' }, { status: 400 });
  if (end < start)            return NextResponse.json({ error: 'endDate must be on or after startDate' }, { status: 400 });

  const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000) + 1);

  // SECURITY: never trust status from client — always start as pending
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leave = await (WorkspaceLeaveRequest as any).create({
    tenantId:   ctx.tenantId,
    employeeId: body['employeeId'],
    leaveType:  body['leaveType'],
    startDate:  start,
    endDate:    end,
    reason:     body['reason'],
    totalDays,
    status:     'pending',      // always pending — HR must explicitly approve
  });

  await auditEvent({
    actionType:       'LEAVE_REQUESTED',
    targetCollection: 'ws_leave_requests',
    targetDocumentId: leave._id.toString(),
    newStateHash:     createHash('sha256').update(leave._id.toString() + Date.now()).digest('hex'),
    changeSummary:    { leaveType: body['leaveType'], totalDays, submittedBy: session.userId },
  });

  return NextResponse.json({ data: leave }, { status: 201 });
}, ['super_admin', 'hr_admin', 'hr_manager']);  // employees cannot call this directly
