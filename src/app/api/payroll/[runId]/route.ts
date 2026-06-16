import { NextRequest, NextResponse }     from 'next/server';
import { runWithSession, auditEvent }    from '@/lib/withRoute';
import { WorkspacePayrollRun }           from '@/models/workspace.models';
import { notify }                        from '@/lib/notificationService';
import { TenantContext }                 from '@/infrastructure/multiTenantCore';
import { createHash }                    from 'node:crypto';
import mongoose                          from 'mongoose';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/payroll/[runId]  — full run detail with audit flags and line-item summary
// POST /api/payroll/[runId] — state transitions: { action: 'approve' | 'reverse' }
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  return runWithSession(async () => {
    if (!mongoose.isValidObjectId(runId)) {
      return NextResponse.json({ error: 'Invalid runId' }, { status: 400 });
    }

    const run = await WorkspacePayrollRun.findById(runId).lean();
    if (!run) return NextResponse.json({ error: 'Payroll run not found' }, { status: 404 });

    // Return metadata and flags — lineItems are omitted at this level (too large);
    // each line-item's encrypted salary fields are not returned to the client.
    const lineItemsSummary = ((run as unknown as { lineItems: Array<{ employeeId: unknown; employeeCode: string; currencyCode: string; varianceFlag: boolean; varianceNotes?: string; lineHash?: string }> }).lineItems ?? [])
      .map((li) => ({
        employeeId:   li.employeeId,
        employeeCode: li.employeeCode,
        currencyCode: li.currencyCode,
        varianceFlag: li.varianceFlag,
        varianceNotes: li.varianceNotes,
        lineHash: li.lineHash,
        // baseSalaryEnc / grossSalaryEnc / netSalaryEnc intentionally omitted
      }));

    return NextResponse.json({
      data: {
        _id:           run._id,
        runCode:       run.runCode,
        payPeriodMonth: run.payPeriodMonth,
        payPeriodYear:  run.payPeriodYear,
        runStatus:      run.runStatus,
        employeeCount:  run.employeeCount,
        currencyCode:   run.currencyCode,
        criticalFlagCount: run.criticalFlagCount,
        auditFlags:     run.auditFlags,
        approvedById:   run.approvedById,
        approvedAt:     run.approvedAt,
        lineItemsSummary,
      },
    });
  }, ['super_admin', 'hr_admin', 'payroll_officer', 'finance_auditor']);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  return runWithSession(async (session) => {
    if (!mongoose.isValidObjectId(runId)) {
      return NextResponse.json({ error: 'Invalid runId' }, { status: 400 });
    }

    const { action } = await req.json().catch(() => ({ action: null }));

    if (action === 'mark_audit_passed') {
      const run = await WorkspacePayrollRun.findById(runId).lean();
      if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 });
      if (!['draft', 'agentic_audit_queued', 'audit_failed'].includes(run.runStatus)) {
        return NextResponse.json({ error: `Run is already in "${run.runStatus}" state.` }, { status: 409 });
      }
      const updated = await WorkspacePayrollRun.findByIdAndUpdate(
        runId,
        { $set: { runStatus: 'audit_passed', criticalFlagCount: 0 } },
        { new: true },
      );
      await auditEvent({
        actionType: 'PAYROLL_AUDIT_MANUAL_PASS',
        targetCollection: 'ws_payroll_runs',
        targetDocumentId: runId,
        newStateHash: createHash('sha256').update(`${runId}:audit_passed:${Date.now()}`).digest('hex'),
        changeSummary: { runCode: run.runCode, markedBy: session.userId },
      });
      return NextResponse.json({ data: { runId, runStatus: updated?.runStatus } });
    }

    if (action === 'approve') {
      const run = await WorkspacePayrollRun.findById(runId).lean();
      if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 });
      if (run.runStatus !== 'audit_passed') {
        return NextResponse.json({
          error: `Cannot approve a run in "${run.runStatus}" state. Must be "audit_passed".`,
        }, { status: 409 });
      }
      if (run.criticalFlagCount > 0) {
        return NextResponse.json({
          error: `Cannot approve: ${run.criticalFlagCount} critical flags are unresolved.`,
        }, { status: 409 });
      }

      const updated = await WorkspacePayrollRun.findByIdAndUpdate(
        runId,
        { $set: { runStatus: 'approved', approvedById: new mongoose.Types.ObjectId(session.userId), approvedAt: new Date() } },
        { new: true },
      );

      await auditEvent({
        actionType:       'PAYROLL_APPROVED',
        targetCollection: 'ws_payroll_runs',
        targetDocumentId: runId,
        newStateHash:     createHash('sha256').update(`${runId}:approved:${Date.now()}`).digest('hex'),
        changeSummary:    { runCode: run.runCode, approvedBy: session.userId },
      });

      // Notify all employees + payroll team that payslips are ready
      const ctx = TenantContext.requireStore('approve payroll');
      await notify.payrollApproved({
        tenantId:       ctx.tenantId.toString(),
        runCode:        run.runCode,
        runId,
        payPeriodMonth: run.payPeriodMonth,
        payPeriodYear:  run.payPeriodYear,
      });

      return NextResponse.json({ data: { runId, runStatus: updated?.runStatus } });
    }

    if (action === 'reverse') {
      const run = await WorkspacePayrollRun.findById(runId).lean();
      if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 });
      if (!['paid', 'approved'].includes(run.runStatus)) {
        return NextResponse.json({
          error: `Cannot reverse a run in "${run.runStatus}" state.`,
        }, { status: 409 });
      }

      const updated = await WorkspacePayrollRun.findByIdAndUpdate(
        runId,
        { $set: { runStatus: 'reversed' } },
        { new: true },
      );

      await auditEvent({
        actionType:       'PAYROLL_REVERSED',
        targetCollection: 'ws_payroll_runs',
        targetDocumentId: runId,
        newStateHash:     createHash('sha256').update(`${runId}:reversed:${Date.now()}`).digest('hex'),
        changeSummary:    { runCode: run.runCode, reversedBy: session.userId },
      });

      // Notify payroll team about the reversal
      const ctx2 = TenantContext.requireStore('reverse payroll');
      await notify.payrollReversed({
        tenantId:   ctx2.tenantId.toString(),
        runCode:    run.runCode,
        runId,
        reversedBy: session.userId,
      });

      return NextResponse.json({ data: { runId, runStatus: updated?.runStatus } });
    }

    if (action === 'mark_paid') {
      const run = await WorkspacePayrollRun.findById(runId).lean();
      if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 });
      if (run.runStatus !== 'approved') {
        return NextResponse.json({
          error: `Cannot mark paid: run is "${run.runStatus}", must be "approved".`,
        }, { status: 409 });
      }

      const updated = await WorkspacePayrollRun.findByIdAndUpdate(
        runId,
        { $set: { runStatus: 'paid', payDate: new Date() } },
        { new: true },
      );

      await auditEvent({
        actionType:       'PAYROLL_MARKED_PAID',
        targetCollection: 'ws_payroll_runs',
        targetDocumentId: runId,
        newStateHash:     createHash('sha256').update(`${runId}:paid:${Date.now()}`).digest('hex'),
        changeSummary:    { runCode: run.runCode, markedBy: session.userId },
      });

      // TODO: initiate Razorpay Payouts disbursement per employee bank account
      // await initiateRazorpayPayouts(run, session.userId);

      return NextResponse.json({ data: { runId, runStatus: updated?.runStatus, payDate: updated?.payDate } });
    }

    return NextResponse.json({ error: 'action must be "approve", "reverse", "mark_audit_passed", or "mark_paid"' }, { status: 400 });
  }, ['super_admin', 'hr_admin', 'payroll_officer']);
}
