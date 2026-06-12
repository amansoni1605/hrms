import { NextRequest, NextResponse }   from 'next/server';
import { runWithSession, auditEvent }   from '@/lib/withRoute';
import { WorkspacePerformanceReview, WorkspaceEmployee } from '@/models/workspace.models';
import { TenantContext }                from '@/infrastructure/multiTenantCore';
import { notify }                       from '@/lib/notificationService';
import { applyOrStageRevision }         from '@/lib/compensation';
import { createHash }                   from 'node:crypto';
import mongoose                         from 'mongoose';

// First day of the month following `from` (default effective date for a raise).
function firstOfNextMonth(from: Date): Date {
  return new Date(from.getFullYear(), from.getMonth() + 1, 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/performance/[id]/compensation
//
// Acts on the CURRENT step of a compensation recommendation's approval chain.
//
//   Single-step (small merit raise): one HR sign-off.
//   Two-step (promotion / large increment): the employee's SKIP-LEVEL manager
//     endorses first, then a (different) HR approver gives final sign-off.
//
// Controls enforced:
//   • Segregation of duties — the recommender can never approve/reject.
//   • The HR approver must differ from the skip-level endorser.
//   • The skip-level step can only be acted by that manager (or a super admin).
//   • Atomic step transitions via conditional updates (no double-acting).
//
// On final acceptance the salary revision is applied now (if due) or staged for
// its effective date — the same engine payroll reads from.
// ─────────────────────────────────────────────────────────────────────────────

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return runWithSession(async (session) => {
    const body = await req.json() as { action?: 'accept' | 'reject'; note?: string; effectiveDate?: string };
    const action = body.action;
    if (action !== 'accept' && action !== 'reject') {
      return NextResponse.json({ error: "action must be 'accept' or 'reject'" }, { status: 400 });
    }

    const ctx      = TenantContext.requireStore('PUT /api/performance/[id]/compensation');
    const tenantId = ctx.tenantId.toString();
    const role     = session.role;
    const me        = ctx.userId.toString();
    const myEmpId   = ctx.employeeId?.toString();

    const review = await WorkspacePerformanceReview.findById(id);
    if (!review) return NextResponse.json({ error: 'Review not found' }, { status: 404 });
    const comp = review.compensation;
    if (!comp?.recommended || comp.decision !== 'pending') {
      return NextResponse.json({ error: 'No pending compensation recommendation to decide on' }, { status: 409 });
    }

    // ── Segregation of duties — recommender can never decide ────────────────────
    if (comp.recommendedById && comp.recommendedById.toString() === me) {
      return NextResponse.json(
        { error: 'Segregation of duties: you recommended this change and cannot act on it.' },
        { status: 403 },
      );
    }

    const twoStep = !!comp.requiresTwoStep;
    const step    = twoStep ? comp.currentStep : 'hr';
    const hrIdx   = twoStep ? 1 : 0;   // index of the HR step in the approvals[] array
    const now     = new Date();

    // ════════════════════════════════════════════════════════════════════════
    // STEP 1 (two-step only): SKIP-LEVEL MANAGER ENDORSEMENT
    // ════════════════════════════════════════════════════════════════════════
    if (twoStep && step === 'skip_level') {
      const isSkipMgr = !!(myEmpId && comp.skipLevelManagerId && comp.skipLevelManagerId.toString() === myEmpId);
      if (!isSkipMgr && role !== 'super_admin') {
        return NextResponse.json(
          { error: "Only the employee's skip-level manager (or a super admin) can endorse this step." },
          { status: 403 },
        );
      }

      if (action === 'reject') {
        await WorkspacePerformanceReview.updateOne(
          { _id: id, 'compensation.currentStep': 'skip_level' },
          { $set: {
            'compensation.decision': 'rejected', 'compensation.currentStep': null,
            'compensation.approvals.0.status': 'rejected', 'compensation.approvals.0.approverId': ctx.userId,
            'compensation.approvals.0.approverRole': role, 'compensation.approvals.0.decidedAt': now, 'compensation.approvals.0.note': body.note,
            'compensation.decidedById': ctx.userId, 'compensation.decidedAt': now, 'compensation.decisionNote': body.note,
          } },
        );
        await auditEvent({
          actionType: 'COMP_SKIPLEVEL_REJECTED', targetCollection: 'ws_performance_reviews', targetDocumentId: id,
          newStateHash: createHash('sha256').update(`skip-reject:${id}:${Date.now()}`).digest('hex'),
          changeSummary: { decidedBy: session.userId, step: 'skip_level' },
        });
        if (comp.recommendedById) {
          await notify.compRejected({
            tenantId, managerId: comp.recommendedById.toString(), employeeCode: review.employeeCode,
            cycleLabel: review.cycleLabel, note: body.note ?? 'Declined at skip-level review', reviewId: id,
          });
        }
        return NextResponse.json({ data: { reviewId: id, step: 'skip_level', outcome: 'rejected' } });
      }

      // Endorse → advance to the HR step.
      const advanced = await WorkspacePerformanceReview.findOneAndUpdate(
        { _id: id, 'compensation.currentStep': 'skip_level' },
        { $set: {
          'compensation.approvals.0.status': 'approved', 'compensation.approvals.0.approverId': ctx.userId,
          'compensation.approvals.0.approverRole': role, 'compensation.approvals.0.decidedAt': now, 'compensation.approvals.0.note': body.note,
          'compensation.currentStep': 'hr',
        } },
        { new: true },
      );
      if (!advanced) return NextResponse.json({ error: 'This step was already actioned' }, { status: 409 });

      await auditEvent({
        actionType: 'COMP_SKIPLEVEL_ENDORSED', targetCollection: 'ws_performance_reviews', targetDocumentId: id,
        newStateHash: createHash('sha256').update(`endorse:${id}:${Date.now()}`).digest('hex'),
        changeSummary: { endorsedBy: session.userId, nextStep: 'hr' },
      });
      await notify.compReadyForSignoff({
        tenantId, employeeCode: review.employeeCode, cycleLabel: review.cycleLabel,
        incrementPct: comp.incrementPct, promotion: comp.promotion, reviewId: id,
      });
      return NextResponse.json({ data: { reviewId: id, step: 'skip_level', outcome: 'endorsed', nextStep: 'hr' } });
    }

    // ════════════════════════════════════════════════════════════════════════
    // FINAL STEP: HR SIGN-OFF  (single-step, or the 2nd step of two-step)
    // ════════════════════════════════════════════════════════════════════════
    if (role !== 'hr_admin' && role !== 'super_admin') {
      return NextResponse.json({ error: 'Only an HR Admin or Super Admin can give final sign-off.' }, { status: 403 });
    }
    // The HR approver must differ from whoever endorsed the skip-level step.
    const skipApprover = twoStep ? comp.approvals?.[0]?.approverId : undefined;
    if (skipApprover && skipApprover.toString() === me) {
      return NextResponse.json(
        { error: 'You endorsed the skip-level step; a different HR approver must give final sign-off.' },
        { status: 403 },
      );
    }

    // ── Reject at HR ────────────────────────────────────────────────────────
    if (action === 'reject') {
      await WorkspacePerformanceReview.updateOne(
        { _id: id, 'compensation.decision': 'pending' },
        { $set: {
          'compensation.decision': 'rejected', 'compensation.currentStep': null,
          [`compensation.approvals.${hrIdx}.status`]: 'rejected', [`compensation.approvals.${hrIdx}.approverId`]: ctx.userId,
          [`compensation.approvals.${hrIdx}.approverRole`]: role, [`compensation.approvals.${hrIdx}.decidedAt`]: now, [`compensation.approvals.${hrIdx}.note`]: body.note,
          'compensation.decidedById': ctx.userId, 'compensation.decidedAt': now, 'compensation.decisionNote': body.note,
        } },
      );
      await auditEvent({
        actionType: 'COMP_RECOMMENDATION_REJECTED', targetCollection: 'ws_performance_reviews', targetDocumentId: id,
        newStateHash: createHash('sha256').update(`reject:${id}:${Date.now()}`).digest('hex'),
        changeSummary: { decidedBy: session.userId, step: 'hr' },
      });
      if (comp.recommendedById) {
        await notify.compRejected({
          tenantId, managerId: comp.recommendedById.toString(), employeeCode: review.employeeCode,
          cycleLabel: review.cycleLabel, note: body.note ?? '', reviewId: id,
        });
      }
      return NextResponse.json({ data: { reviewId: id, step: 'hr', outcome: 'rejected' } });
    }

    // ── Accept at HR → atomically claim, then apply the revision ────────────────
    const claim = await WorkspacePerformanceReview.findOneAndUpdate(
      { _id: id, 'compensation.decision': 'pending' },
      { $set: {
        'compensation.decision': 'accepted', 'compensation.currentStep': null,
        [`compensation.approvals.${hrIdx}.status`]: 'approved', [`compensation.approvals.${hrIdx}.approverId`]: ctx.userId,
        [`compensation.approvals.${hrIdx}.approverRole`]: role, [`compensation.approvals.${hrIdx}.decidedAt`]: now, [`compensation.approvals.${hrIdx}.note`]: body.note,
        'compensation.decidedById': ctx.userId, 'compensation.decidedAt': now, 'compensation.decisionNote': body.note,
      } },
      { new: true },
    );
    if (!claim) return NextResponse.json({ error: 'This recommendation has already been decided' }, { status: 409 });

    const emp = await WorkspaceEmployee.findById(claim.employeeId)
      .select('baseSalaryEnc salaryBand jobTitle currencyCode employeeCode');
    if (!emp) return NextResponse.json({ error: 'Employee record not found' }, { status: 404 });

    const pct           = comp.incrementPct ?? 0;
    const effectiveDate = body.effectiveDate ? new Date(body.effectiveDate) : firstOfNextMonth(new Date());

    let applied: boolean;
    try {
      ({ applied } = await applyOrStageRevision(tenantId, emp, {
        incrementPct:  pct,
        promotion:     comp.promotion,
        proposedTitle: comp.proposedTitle,
        proposedBand:  comp.proposedBand,
        reviewId:      review._id as mongoose.Types.ObjectId,
        cycleLabel:    review.cycleLabel,
        decidedById:   ctx.userId,
        note:          body.note,
      }, effectiveDate));
    } catch (err) {
      // Apply failed after the claim — revert to pending HR step so it returns to the queue.
      await WorkspacePerformanceReview.updateOne(
        { _id: id },
        { $set: { 'compensation.decision': 'pending', 'compensation.currentStep': 'hr', [`compensation.approvals.${hrIdx}.status`]: 'pending' },
          $unset: { 'compensation.decidedById': '', 'compensation.decidedAt': '' } },
      );
      throw err;
    }

    await WorkspacePerformanceReview.updateOne(
      { _id: id },
      { $set: { 'compensation.effectiveDate': effectiveDate } },
    );

    await auditEvent({
      actionType:       applied ? 'COMP_CHANGE' : 'COMP_CHANGE_SCHEDULED',
      targetCollection: 'ws_employees',
      targetDocumentId: review.employeeId.toString(),
      newStateHash:     createHash('sha256').update(`comp:${review.employeeId}:${Date.now()}`).digest('hex'),
      changeSummary:    {
        reviewId: id, incrementPct: pct, promotion: comp.promotion, twoStep,
        effectiveDate: effectiveDate.toISOString().slice(0, 10), applied, decidedBy: session.userId,
      },
    });

    await notify.compApproved({
      tenantId, employeeId: review.employeeId.toString(), cycleLabel: review.cycleLabel,
      incrementPct: pct, promotion: comp.promotion, effectiveDate: effectiveDate.toISOString().slice(0, 10), reviewId: id,
    });

    return NextResponse.json({ data: { reviewId: id, step: 'hr', outcome: 'accepted', _applied: applied } });
  }, ['super_admin', 'hr_admin', 'hr_manager']);   // fine-grained checks happen inside per step
}
