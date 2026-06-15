import { NextRequest, NextResponse }       from 'next/server';
import { runWithSession, auditEvent }       from '@/lib/withRoute';
import { WorkspaceEmployee }                from '@/models/workspace.models';
import {
  WorkspaceAppraisalCycle,
  WorkspacePMSReview,
}                                           from '@/models/pms.models';
import { TenantContext }                    from '@/infrastructure/multiTenantCore';
import mongoose                             from 'mongoose';

/**
 * POST /api/ws/performance/cycles/[id]/bulk-open-reviews
 *
 * Opens self-reviews for ALL active + on_leave employees in the tenant for the
 * given cycle.  Called by HR when a cycle enters the `self_appraisal` phase.
 *
 * Returns: { created: number, skipped: number, total: number }
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return runWithSession(async () => {
    // ── Validate id ────────────────────────────────────────────────────────────
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: 'Invalid cycle id' }, { status: 400 });
    }

    const ctx     = TenantContext.requireStore('POST bulk-open-reviews');
    const cycleId = new mongoose.Types.ObjectId(id);

    // ── 1. Load cycle ──────────────────────────────────────────────────────────
    const cycle = await WorkspaceAppraisalCycle.findById(cycleId).lean();
    if (!cycle) {
      return NextResponse.json({ error: 'Cycle not found' }, { status: 404 });
    }
    if (cycle.status !== 'self_appraisal') {
      return NextResponse.json(
        { error: 'Cycle must be in self_appraisal status to bulk-open reviews', currentStatus: cycle.status },
        { status: 409 },
      );
    }

    // ── 2. Load all active / on-leave employees ────────────────────────────────
    const employees = await WorkspaceEmployee.find({
      status: { $in: ['active', 'on_leave'] },
    })
      .select('_id')
      .lean();

    const total = employees.length;

    if (total === 0) {
      return NextResponse.json({ created: 0, skipped: 0, total: 0 });
    }

    // ── 3. Find employees who already have a self-review for this cycle ────────
    const existing = await WorkspacePMSReview.find({
      cycleId,
      reviewerRole: 'self',
    })
      .select('revieweeId')
      .lean();

    const existingSet = new Set(existing.map((r) => r.revieweeId.toString()));

    // ── 4. Build docs for employees without a review ──────────────────────────
    const newDocs = employees
      .filter((e) => !existingSet.has(e._id.toString()))
      .map((e) => ({
        tenantId:     ctx.tenantId,
        cycleId,
        revieweeId:   e._id,
        reviewerId:   e._id,   // self-review: reviewer is the employee themselves
        reviewerRole: 'self' as const,
        isAnonymous:  false,
        status:       'draft' as const,
        ratings:      [],
        pipTriggered: false,
      }));

    const skipped = total - newDocs.length;

    if (newDocs.length === 0) {
      return NextResponse.json({ created: 0, skipped, total });
    }

    // ── 5. Bulk-insert; tolerate duplicate-key errors (E11000) gracefully ─────
    let created = newDocs.length;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (WorkspacePMSReview as any).insertMany(newDocs, { ordered: false });
    } catch (err: unknown) {
      // insertMany with ordered:false throws a BulkWriteError after inserting
      // as many docs as possible; extract the actual inserted count.
      const bulkErr = err as { code?: number; insertedCount?: number; result?: { insertedCount?: number } };
      if (bulkErr?.code === 11000 || (bulkErr as { name?: string })?.name === 'BulkWriteError') {
        const insertedCount =
          bulkErr.insertedCount ??
          bulkErr.result?.insertedCount ??
          0;
        created = insertedCount;
      } else {
        throw err;
      }
    }

    await auditEvent({
      actionType:        'BULK_OPEN_SELF_REVIEWS',
      targetCollection:  'ws_pms_reviews',
      targetDocumentId:  cycleId.toString(),
      newStateHash:      `${cycle.status}:${created}`,
      changeSummary:     { cycleId: id, created, skipped, total },
    });

    return NextResponse.json({ created, skipped, total });
  }, ['super_admin', 'hr_admin']);
}
