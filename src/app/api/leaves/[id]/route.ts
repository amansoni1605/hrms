import { NextRequest, NextResponse }    from 'next/server';
import { runWithSession, auditEvent }   from '@/lib/withRoute';
import {
  WorkspaceLeaveRequest, WorkspaceLeaveBalance, WorkspaceUser, Tenant,
}                                       from '@/models/workspace.models';
import { TenantContext }                from '@/infrastructure/multiTenantCore';
import { notify }                       from '@/lib/notificationService';
import { sendLeaveApprovedEmail, sendLeaveRejectedEmail } from '@/lib/mailer';
import { createHash }                   from 'node:crypto';
import mongoose                         from 'mongoose';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // Allow employees so line managers (who have 'employee' role) can approve their team's leaves.
  // Role-based access is re-checked inside based on the action and leave status.
  return runWithSession(async (session) => {
    const body   = await req.json();
    const { action, rejectionReason } = body;

    const ctx = TenantContext.requireStore('PUT /api/leaves/[id]');

    // Load the leave BEFORE update so we know the current status
    const leave = await WorkspaceLeaveRequest.findById(id).lean();
    if (!leave) return NextResponse.json({ error: 'Leave not found' }, { status: 404 });

    const update: Record<string, unknown> = {};
    const currentStatus = leave.status as string;

    const isHR                = session.role === 'hr_admin' || session.role === 'super_admin';
    const isMgr               = session.role === 'hr_manager' || isHR;
    // A line manager with 'employee' role can approve/reject their own report's first step
    const isDesignatedManager = !!session.employeeId && leave.managerId?.toString() === session.employeeId;

    if (action === 'approve') {
      if (currentStatus === 'pending_manager') {
        if (!isMgr && !isDesignatedManager) {
          return NextResponse.json({ error: 'Only the designated manager can approve this step' }, { status: 403 });
        }
        // Manager approved → forward to HR
        update['status']              = 'pending_hr';
        update['managerApprovedById'] = session.userId;
        update['managerApprovedAt']   = new Date();
      } else if (currentStatus === 'pending_hr' || currentStatus === 'pending') {
        if (!isHR) {
          return NextResponse.json({ error: 'Only HR can give final approval' }, { status: 403 });
        }
        // Double-booking guard before final approval
        const clash = await WorkspaceLeaveRequest.findOne({
          _id:        { $ne: new mongoose.Types.ObjectId(id) },
          employeeId: leave.employeeId,
          status:     'approved',
          startDate:  { $lte: leave.endDate },
          endDate:    { $gte: leave.startDate },
        }).lean();
        if (clash) {
          return NextResponse.json({ error: 'Employee already has an approved leave overlapping these dates' }, { status: 409 });
        }

        // Final HR approval
        update['status']       = 'approved';
        update['approvedById'] = session.userId;
        update['approvedAt']   = new Date();
      } else {
        return NextResponse.json({ error: `Cannot approve a leave in status '${currentStatus}'` }, { status: 400 });
      }
    } else if (action === 'reject') {
      // Designated manager can reject at pending_manager step; HR can reject at any step
      const canReject = isMgr || (isDesignatedManager && currentStatus === 'pending_manager');
      if (!canReject) {
        return NextResponse.json({ error: 'You are not authorised to reject this leave' }, { status: 403 });
      }
      update['status']          = 'rejected';
      update['rejectionReason'] = rejectionReason || 'Rejected by manager';
    } else if (action === 'cancel') {
      if (!isMgr) {
        return NextResponse.json({ error: 'Only HR/managers can cancel a leave' }, { status: 403 });
      }
      update['status'] = 'cancelled';
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const updated = await WorkspaceLeaveRequest.findByIdAndUpdate(id, update, { new: true });
    if (!updated) return NextResponse.json({ error: 'Leave not found' }, { status: 404 });

    // ── Leave balance deduction on final approval ──────────────────────
    if (update['status'] === 'approved') {
      const year = new Date(leave.startDate).getFullYear();
      const bal  = await WorkspaceLeaveBalance.findOneAndUpdate(
        { employeeId: leave.employeeId, year },
        {
          $setOnInsert: { tenantId: ctx.tenantId, annual: 21, sick: 12, earned: 0 },
          $inc: { used: leave.totalDays, remaining: -leave.totalDays },
        },
        { upsert: true, new: true },
      );
      // Clamp remaining to 0 minimum
      if (bal && (bal.remaining as number) < 0) {
        await WorkspaceLeaveBalance.updateOne({ _id: bal._id }, { $set: { remaining: 0 } });
      }
    }

    await auditEvent({
      actionType:       action === 'approve' ? 'LEAVE_APPROVED' : action === 'reject' ? 'LEAVE_REJECTED' : 'UPDATE',
      targetCollection: 'ws_leave_requests',
      targetDocumentId: id,
      newStateHash:     createHash('sha256').update(`${action}:${id}:${Date.now()}`).digest('hex'),
      changeSummary:    { action, newStatus: update['status'] },
    });

    const tenantId = ctx.tenantId.toString();

    // ── Fire in-app notifications ────────────────────────────────────────
    if (update['status'] === 'pending_hr') {
      // Manager approved — notify HR
      await notify.leaveForwardedToHR({
        tenantId,
        employeeCode: String(body['employeeCode'] ?? leave.employeeId.toString()),
        employeeId:   leave.employeeId.toString(),
        leaveType:    leave.leaveType,
        totalDays:    leave.totalDays,
        startDate:    leave.startDate.toISOString().slice(0, 10),
        leaveId:      id,
      });
    } else if (update['status'] === 'approved') {
      await notify.leaveApproved({
        tenantId,
        employeeId: leave.employeeId.toString(),
        leaveType:  leave.leaveType,
        totalDays:  leave.totalDays,
        startDate:  leave.startDate.toISOString().slice(0, 10),
        approvedBy: session.userId,
        leaveId:    id,
      });
      // Email the employee
      void (async () => {
        const [empUser, tenantDoc] = await Promise.all([
          (WorkspaceUser as any).findOne({ employeeId: leave.employeeId }).select('email name').lean() as
            Promise<{ email: string; name: string } | null>,
          Tenant.findById(ctx.tenantId).select('displayName legalName brandColor').lean() as
            Promise<{ displayName?: string; legalName: string; brandColor?: string } | null>,
        ]);
        if (!empUser?.email) return;
        await sendLeaveApprovedEmail({
          to:           empUser.email,
          employeeName: empUser.name,
          leaveType:    leave.leaveType,
          startDate:    leave.startDate.toISOString().slice(0, 10),
          endDate:      leave.endDate.toISOString().slice(0, 10),
          totalDays:    leave.totalDays,
          companyName:  tenantDoc?.displayName ?? tenantDoc?.legalName ?? 'HRMS',
          brandColor:   tenantDoc?.brandColor,
        });
      })();
    } else if (update['status'] === 'rejected') {
      await notify.leaveRejected({
        tenantId,
        employeeId:      leave.employeeId.toString(),
        leaveType:       leave.leaveType,
        totalDays:       leave.totalDays,
        rejectionReason: String(update['rejectionReason']),
        leaveId:         id,
      });
      // Email the employee
      void (async () => {
        const [empUser, tenantDoc] = await Promise.all([
          (WorkspaceUser as any).findOne({ employeeId: leave.employeeId }).select('email name').lean() as
            Promise<{ email: string; name: string } | null>,
          Tenant.findById(ctx.tenantId).select('displayName legalName brandColor').lean() as
            Promise<{ displayName?: string; legalName: string; brandColor?: string } | null>,
        ]);
        if (!empUser?.email) return;
        await sendLeaveRejectedEmail({
          to:               empUser.email,
          employeeName:     empUser.name,
          leaveType:        leave.leaveType,
          startDate:        leave.startDate.toISOString().slice(0, 10),
          endDate:          leave.endDate.toISOString().slice(0, 10),
          rejectionReason:  String(update['rejectionReason'] ?? ''),
          companyName:      tenantDoc?.displayName ?? tenantDoc?.legalName ?? 'HRMS',
          brandColor:       tenantDoc?.brandColor,
        });
      })();
    }

    return NextResponse.json({ data: updated });
  // 'employee' included so line managers (employee role) can approve their team's leaves
  }, ['super_admin', 'hr_admin', 'hr_manager', 'employee']);
}
