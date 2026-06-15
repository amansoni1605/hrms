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

    // Body is optional — if omitted we auto-advance to the sole next status.
    let to: CycleStatus | undefined;
    const contentType = req.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const body = await req.json() as { to?: CycleStatus };
      to = body.to;
    }

    const cycle = await WorkspaceAppraisalCycle.findById(id);
    if (!cycle) return NextResponse.json({ error: 'Cycle not found' }, { status: 404 });

    const fromStatus = cycle.status;
    // Filter out peer_360 when 360° is disabled on this cycle
    const allowed = ALLOWED_TRANSITIONS[fromStatus].filter(
      (s) => s !== 'peer_360' || cycle.enable360,
    );

    if (!to) {
      if (allowed.length === 0) {
        return NextResponse.json({ error: 'Cycle is already in a terminal state.' }, { status: 409 });
      }
      if (allowed.length > 1) {
        return NextResponse.json(
          { error: 'Multiple next states possible — supply "to" in the request body.', allowed },
          { status: 400 },
        );
      }
      to = allowed[0];
    }

    if (!allowed.includes(to)) {
      return NextResponse.json(
        { error: 'Invalid transition', from: fromStatus, allowed },
        { status: 409 },
      );
    }

    const now = new Date();
    const ctx = TenantContext.requireStore('POST /api/ws/performance/cycles/[id]/transition');

    // Exit actions: lock in-flight reviews for the phase we are leaving
    const lockMap: Partial<Record<CycleStatus, string[]>> = {
      self_appraisal: ['self'],
      manager_review:  ['manager', 'skip_level'],
      peer_360:        ['peer'],
    };

    const rolesToLock = lockMap[fromStatus];
    if (rolesToLock && rolesToLock.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (WorkspacePMSReview as any).updateMany(
        { cycleId: cycle._id, reviewerRole: { $in: rolesToLock }, status: 'draft' },
        { $set: { status: 'locked', lockedAt: now } },
      );
    }

    // Guard: scores must have been computed before advancing to HR Approval
    if (to === 'approved_hr') {
      const hasScores = await WorkspacePMSReview.exists({
        cycleId:    cycle._id,
        finalScore: { $ne: null },
      });
      if (!hasScores) {
        return NextResponse.json(
          { error: 'Scores must be computed before advancing to HR Approval. Run "Compute Scores" first.' },
          { status: 409 },
        );
      }
    }

    // Push status log entry and advance status
    cycle.statusLog.push({ from: fromStatus, to, actorId: ctx.userId, at: now });
    cycle.status = to;
    await cycle.save();

    // PIP check when entering approved_hr — use manager calibratedScore as the authoritative score
    if (to === 'approved_hr' && cycle.pipThreshold > 0) {
      const pipCandidates = await WorkspacePMSReview.find({
        cycleId:         cycle._id,
        reviewerRole:    'manager',
        calibratedScore: { $lt: cycle.pipThreshold },
      }).select('revieweeId calibratedScore').lean();

      if (pipCandidates.length > 0) {
        const pipDocs = pipCandidates.map((r) => ({
          tenantId:         ctx.tenantId,
          employeeId:       r.revieweeId,
          cycleId:          cycle._id,
          triggeredScore:   r.calibratedScore,
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
