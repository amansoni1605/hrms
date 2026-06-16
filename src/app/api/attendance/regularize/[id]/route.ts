/**
 * POST /api/attendance/regularize/[id]
 *
 * Approve or reject an attendance regularization request.
 * Body: { action: 'approve' | 'reject', rejectionReason?: string }
 *
 * Access:
 *   - The designated line manager (managerId === session.employeeId) — any role
 *   - HR roles: super_admin, hr_admin, hr_manager
 *
 * On approve: creates manual_adjust check_in (and check_out) events in
 * ws_attendance_timeseries, then marks request approved.
 */

import { NextRequest, NextResponse }    from 'next/server';
import { runWithSession, auditEvent }   from '@/lib/withRoute';
import { createHash }                   from 'node:crypto';
import {
  WorkspaceAttendanceReg,
  WorkspaceAttendance,
  WorkspaceEmployee,
}                                       from '@/models/workspace.models';
import { TenantContext }                from '@/infrastructure/multiTenantCore';
import mongoose                         from 'mongoose';

const HR_ROLES = new Set(['super_admin', 'hr_admin', 'hr_manager']);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // No role restriction at HOF level — manager check is done inside
  return runWithSession(async (session) => {
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: 'Invalid request id' }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    const { action, rejectionReason } = (body ?? {}) as {
      action?: string;
      rejectionReason?: string;
    };

    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ error: 'action must be "approve" or "reject"' }, { status: 400 });
    }

    const regReq = await WorkspaceAttendanceReg.findById(id);
    if (!regReq) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    if (regReq.status !== 'pending') {
      return NextResponse.json({ error: `Request is already "${regReq.status}"` }, { status: 409 });
    }

    // Access control: must be line manager OR an HR role
    const isHR = HR_ROLES.has(session.role);
    const isDesignatedManager = !!session.employeeId &&
      !!regReq.managerId &&
      regReq.managerId.toString() === session.employeeId;

    if (!isHR && !isDesignatedManager) {
      return NextResponse.json({ error: 'Only the employee\'s line manager or HR can act on this request' }, { status: 403 });
    }

    const ctx = TenantContext.requireStore('POST /api/attendance/regularize/[id]');
    const now = new Date();

    if (action === 'reject') {
      await WorkspaceAttendanceReg.findByIdAndUpdate(id, {
        $set: {
          status:              'rejected',
          managerApprovedById: new mongoose.Types.ObjectId(session.userId),
          managerApprovedAt:   now,
          rejectionReason:     rejectionReason?.trim() ?? '',
        },
      });

      await auditEvent({
        actionType:       'ATTENDANCE_REGULARIZATION_REJECTED',
        targetCollection: 'ws_attendance_regularizations',
        targetDocumentId: id,
        newStateHash:     createHash('sha256').update(`${id}:rejected:${Date.now()}`).digest('hex'),
        changeSummary:    { rejectedBy: session.userId, reason: rejectionReason },
      });

      return NextResponse.json({ data: { id, status: 'rejected' } });
    }

    // ── APPROVE ────────────────────────────────────────────────────────────

    const emp = await WorkspaceEmployee
      .findById(regReq.employeeId)
      .select('employeeCode')
      .lean();

    const sharedMeta = {
      tenantId:     ctx.tenantId,
      employeeId:   regReq.employeeId,
      employeeCode: emp?.employeeCode ?? 'UNKNOWN',
      siteCode:     'REGULARIZED',
    };

    const baseEvent = {
      tenantId:        ctx.tenantId,
      meta:            sharedMeta,
      verifiedInZone:  false,
      biometricPassed: false,
      biometricMethod: 'manual',
      sourceProvider:  'web_portal',
      anomalyCode:     'none',
      receivedAt:      now,
    };

    await WorkspaceAttendance.create({
      ...baseEvent,
      eventType: 'check_in',
      ts:        regReq.requestedCheckIn,
    });

    if (regReq.requestedCheckOut) {
      await WorkspaceAttendance.create({
        ...baseEvent,
        eventType: 'check_out',
        ts:        regReq.requestedCheckOut,
      });
    }

    await WorkspaceAttendanceReg.findByIdAndUpdate(id, {
      $set: {
        status:              'approved',
        managerApprovedById: new mongoose.Types.ObjectId(session.userId),
        managerApprovedAt:   now,
        appliedAt:           now,
      },
    });

    await auditEvent({
      actionType:       'ATTENDANCE_REGULARIZATION_APPROVED',
      targetCollection: 'ws_attendance_regularizations',
      targetDocumentId: id,
      newStateHash:     createHash('sha256').update(`${id}:approved:${Date.now()}`).digest('hex'),
      changeSummary:    { approvedBy: session.userId, employeeId: regReq.employeeId.toString() },
    });

    return NextResponse.json({ data: { id, status: 'approved' } });
  });
}
