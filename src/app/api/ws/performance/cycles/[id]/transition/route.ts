import { NextRequest, NextResponse }    from 'next/server';
import { runWithSession, auditEvent }   from '@/lib/withRoute';
import {
  WorkspaceAppraisalCycle,
  WorkspacePMSReview,
  WorkspacePIP,
  ALLOWED_TRANSITIONS,
  type CycleStatus,
}                                        from '@/models/pms.models';
import { TenantContext }                 from '@/infrastructure/multiTenantCore';
import { createHash }                    from 'node:crypto';
import mongoose                          from 'mongoose';

// POST /api/ws/performance/cycles/[id]/transition
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return runWithSession(async () => {
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    const { to } = await req.json() as { to?: CycleStatus };
    if (!to) {
      return NextResponse.json({ error: '"to" status is required' }, { status: 400 });
    }

    const cycle = await WorkspaceAppraisalCycle.findById(id);
    if (!cycle) return NextResponse.json({ error: 'Cycle not found' }, { status: 404 });

    const fromStatus = cycle.status;
    const allowed    = ALLOWED_TRANSITIONS[fromStatus];
    if (!allowed.includes(to)) {
      return NextResponse.json(
        { error: 'Invalid transition', from: fromStatus, allowed },
        { status: 409 },
      );
    }

    const now = new Date();
    const ctx = TenantContext.requireStore('POST /api/ws/performance/cycles/[id]/transition');

    // Exit actions: lock in-flight reviews for the phase we are leaving
    const lockMap: Partial<Record<CycleStatus, string>> = {
      self_appraisal: 'self',
      manager_review:  'manager',
      peer_360:        'peer',
    };
    const roleToLock = lockMap[fromStatus];
    if (roleToLock) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (WorkspacePMSReview as any).updateMany(
        { cycleId: cycle._id, reviewerRole: roleToLock, status: 'draft' },
        { $set: { status: 'locked', lockedAt: now } },
      );
    }

    // Push status log entry and advance status
    cycle.statusLog.push({ from: fromStatus, to, actorId: ctx.userId, at: now });
    cycle.status = to;
    await cycle.save();

    // PIP check when entering approved_hr
    if (to === 'approved_hr' && cycle.pipThreshold != null) {
      const pipCandidates = await WorkspacePMSReview.find({
        cycleId:      cycle._id,
        reviewerRole: 'self',
        finalScore:   { $lt: cycle.pipThreshold },
      }).select('revieweeId finalScore').lean();

      if (pipCandidates.length > 0) {
        const pipDocs = pipCandidates.map((r) => ({
          tenantId:         ctx.tenantId,
          employeeId:       r.revieweeId,
          cycleId:          cycle._id,
          triggeredScore:   r.finalScore,
          triggerThreshold: cycle.pipThreshold,
          status:           'draft' as const,
          reviewDates:      [],
          objectives:       [],
          checkpoints:      [],
        }));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (WorkspacePIP as any).insertMany(pipDocs, { ordered: false });
      }
    }

    await auditEvent({
      actionType:       'CYCLE_TRANSITIONED',
      targetCollection: 'ws_appraisal_cycles',
      targetDocumentId: id,
      newStateHash:     createHash('sha256').update(`${id}:${to}:${Date.now()}`).digest('hex'),
      changeSummary:    { from: fromStatus, to },
    });

    return NextResponse.json({ data: cycle });
  }, ['super_admin', 'hr_admin']);
}
