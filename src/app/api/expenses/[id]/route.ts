import { NextRequest, NextResponse }  from 'next/server';
import { runWithSession }             from '@/lib/withRoute';
import { WorkspaceExpenseClaim, WorkspaceUser, WorkspaceInAppNotification } from '@/models/workspace.models';
import mongoose                       from 'mongoose';

// ── Helper: fire-and-forget in-app notification to the expense submitter ──────
async function notifySubmitter(
  tenantId: mongoose.Types.ObjectId,
  employeeId: mongoose.Types.ObjectId,
  title: string,
  body: string,
  claimId: string,
): Promise<void> {
  try {
    // Resolve the user linked to this employee
    const userQ = (WorkspaceUser as any).findOne({ tenantId, employeeId, isActive: true }).select('_id');
    userQ._bypassTenantPlugin = true;
    const user = await userQ.lean() as { _id: mongoose.Types.ObjectId } | null;
    if (!user) return;

    await WorkspaceInAppNotification.create({
      tenantId,
      userId:     user._id,
      employeeId,
      type:       'system_message',
      title,
      body,
      actionUrl:  '/my/expenses',
      priority:   'normal',
      isRead:     false,
      metadata:   { claimId },
    });
  } catch {
    // Never block the primary operation
  }
}

// PATCH /api/expenses/[id] — approve or reject a claim
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runWithSession(async (session) => {
    const body    = await req.json() as { action: string; reason?: string };
    const claim   = await WorkspaceExpenseClaim.findById(id);
    if (!claim) return NextResponse.json({ error: 'Claim not found' }, { status: 404 });

    const isFinance = ['finance_auditor','super_admin','hr_admin'].includes(session.role);
    const isManager = ['hr_manager','hr_admin','super_admin'].includes(session.role);

    let notifTitle = '';
    let notifBody  = '';

    if (body.action === 'manager_approve' && isManager) {
      claim.status            = 'manager_approved';
      claim.managerId         = new mongoose.Types.ObjectId(session.userId);
      claim.managerApprovedAt = new Date();
      notifTitle = 'Your expense claim was approved by your manager';
      notifBody  = `Total claimed: ${claim.totalClaimed}. Awaiting finance approval.`;
    } else if (body.action === 'finance_approve' && isFinance) {
      if (claim.status !== 'manager_approved') {
        return NextResponse.json({ error: 'Manager approval required first' }, { status: 400 });
      }
      claim.status            = 'finance_approved';
      claim.financeId         = new mongoose.Types.ObjectId(session.userId);
      claim.financeApprovedAt = new Date();
      claim.totalSanctioned   = claim.items.reduce((s, i) => s + (i.sanctionedAmount ?? i.amount), 0);
      notifTitle = 'Your expense claim has been approved by Finance';
      notifBody  = `Sanctioned amount: ${claim.totalSanctioned}. Payment is being processed.`;
    } else if (body.action === 'reject') {
      claim.status         = 'rejected';
      claim.rejectedById   = new mongoose.Types.ObjectId(session.userId);
      claim.rejectedReason = body.reason ?? '';
      notifTitle = 'Your expense claim was not approved';
      notifBody  = body.reason ?? 'Please review and re-submit if needed.';
    } else if (body.action === 'mark_paid' && isFinance) {
      claim.status  = 'paid';
      claim.paidAt  = new Date();
      notifTitle = 'Your expense claim has been paid';
      notifBody  = `Amount paid: ${claim.totalSanctioned}.`;
    } else {
      return NextResponse.json({ error: 'Invalid action or insufficient permissions' }, { status: 403 });
    }

    await claim.save();

    // Notify the submitter (fire-and-forget)
    if (notifTitle) {
      void notifySubmitter(claim.tenantId, claim.employeeId, notifTitle, notifBody, id);
    }

    return NextResponse.json({ data: claim });
  }, ['super_admin','hr_admin','hr_manager','payroll_officer','finance_auditor']);
}
