/**
 * GET  /api/me/attendance/regularize  — employee's own regularization requests (last 60)
 * POST /api/me/attendance/regularize  — submit a new regularization request
 *
 * On submit: looks up the employee's line manager (managerId on WorkspaceEmployee)
 * and stores it on the request so the manager receives it in their approval queue.
 */

import { NextRequest, NextResponse }    from 'next/server';
import { withRoute }                    from '@/lib/withRoute';
import { WorkspaceAttendanceReg, WorkspaceEmployee } from '@/models/workspace.models';
import { TenantContext }                from '@/infrastructure/multiTenantCore';
import mongoose                         from 'mongoose';

// ── GET ────────────────────────────────────────────────────────────────────

export const GET = withRoute(async (_req, session) => {
  if (!session.employeeId) {
    return NextResponse.json({ error: 'No employee linked to your account' }, { status: 400 });
  }

  const requests = await WorkspaceAttendanceReg.find({
    employeeId: new mongoose.Types.ObjectId(session.employeeId),
  })
    .sort({ createdAt: -1 })
    .limit(60)
    .lean();

  return NextResponse.json({ data: requests });
});

// ── POST ───────────────────────────────────────────────────────────────────

export const POST = withRoute(async (req, session) => {
  if (!session.employeeId) {
    return NextResponse.json({ error: 'No employee linked to your account' }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });

  const { date, requestedCheckIn, requestedCheckOut, reason } = body as {
    date: string;
    requestedCheckIn: string;
    requestedCheckOut?: string;
    reason: string;
  };

  if (!date || !requestedCheckIn || !reason?.trim()) {
    return NextResponse.json({ error: 'date, requestedCheckIn, and reason are required' }, { status: 400 });
  }

  const dayDate   = new Date(date);
  const checkInDt = new Date(requestedCheckIn);

  if (isNaN(dayDate.getTime()) || isNaN(checkInDt.getTime())) {
    return NextResponse.json({ error: 'Invalid date or requestedCheckIn' }, { status: 400 });
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (dayDate >= today) {
    return NextResponse.json({ error: 'Can only regularize past dates' }, { status: 422 });
  }

  // Prevent duplicate pending request for same date
  const existing = await WorkspaceAttendanceReg.findOne({
    employeeId: new mongoose.Types.ObjectId(session.employeeId),
    date:       dayDate,
    status:     'pending',
  }).lean();
  if (existing) {
    return NextResponse.json({
      error: 'A pending regularization request already exists for this date',
    }, { status: 409 });
  }

  const ctx = TenantContext.requireStore('POST /api/me/attendance/regularize');

  // Resolve line manager from employee record
  const emp = await WorkspaceEmployee
    .findById(session.employeeId)
    .select('managerId')
    .lean();
  const managerId = (emp as unknown as { managerId?: mongoose.Types.ObjectId })?.managerId ?? null;

  const reg = await WorkspaceAttendanceReg.create({
    tenantId:          ctx.tenantId,
    employeeId:        new mongoose.Types.ObjectId(session.employeeId),
    managerId:         managerId ?? undefined,
    date:              dayDate,
    requestedCheckIn:  checkInDt,
    requestedCheckOut: requestedCheckOut ? new Date(requestedCheckOut) : undefined,
    reason:            reason.trim(),
    status:            'pending',
  });

  return NextResponse.json({ data: { _id: reg._id, status: reg.status } }, { status: 201 });
});
