import { NextResponse }              from 'next/server';
import { withRoute }                  from '@/lib/withRoute';
import {
  WorkspacePMSReview,
  WorkspaceAppraisalCycle,
}                                     from '@/models/pms.models';
import { TenantContext }              from '@/infrastructure/multiTenantCore';
import mongoose                       from 'mongoose';

/**
 * GET /api/me/performance/pms
 *
 * Returns the current employee's PMS self-reviews (i.e. the self-appraisals
 * they need to fill in), each enriched with the cycle's name, status, type,
 * startDate, and endDate.
 *
 * No role restriction — any authenticated employee with an employeeId may call this.
 */
export const GET = withRoute(async (_req, session) => {
  if (!session.employeeId) {
    return NextResponse.json({ error: 'No employee profile linked to this account' }, { status: 404 });
  }

  // runWithSession / withRoute already called connectDB() and bound TenantContext
  const ctx        = TenantContext.requireStore('GET /api/me/performance/pms');
  const employeeId = new mongoose.Types.ObjectId(session.employeeId);

  // ── Fetch all self-reviews where this employee is the reviewee ───────────────
  const reviews = await WorkspacePMSReview.find({
    revieweeId:   employeeId,
    reviewerRole: 'self',
  })
    .sort({ createdAt: -1 })
    .lean();

  if (reviews.length === 0) {
    return NextResponse.json({ data: [] });
  }

  // ── Enrich each review with cycle metadata ───────────────────────────────────
  const cycleIds = [...new Set(reviews.map((r) => r.cycleId.toString()))];
  const cycles   = await WorkspaceAppraisalCycle.find({
    _id: { $in: cycleIds.map((cid) => new mongoose.Types.ObjectId(cid)) },
  })
    .select('name status type startDate endDate')
    .lean();

  const cycleMap = new Map(cycles.map((c) => [c._id.toString(), c]));

  const data = reviews.map((review) => {
    const cycle = cycleMap.get(review.cycleId.toString());
    return {
      review: {
        _id:          review._id,
        cycleId:      review.cycleId,
        status:       review.status,
        draftSavedAt: review.draftSavedAt ?? null,
        submittedAt:  review.submittedAt  ?? null,
        finalScore:   review.finalScore   ?? null,
        createdAt:    review.createdAt,
        updatedAt:    review.updatedAt,
      },
      cycle: cycle
        ? {
            name:      cycle.name,
            status:    cycle.status,
            type:      cycle.type,
            startDate: cycle.startDate,
            endDate:   cycle.endDate,
          }
        : null,
    };
  });

  return NextResponse.json({ data });
});
