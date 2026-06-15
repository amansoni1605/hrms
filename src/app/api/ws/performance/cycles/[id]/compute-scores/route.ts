import { NextRequest, NextResponse }  from 'next/server';
import { runWithSession }             from '@/lib/withRoute';
import {
  WorkspaceAppraisalCycle,
  WorkspacePMSReview,
}                                      from '@/models/pms.models';
import mongoose                        from 'mongoose';

// POST /api/ws/performance/cycles/[id]/compute-scores
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return runWithSession(async () => {
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    const cycle = await WorkspaceAppraisalCycle.findById(id).lean();
    if (!cycle) return NextResponse.json({ error: 'Cycle not found' }, { status: 404 });

    // Only allow score computation from calibration onward
    const validPhases = new Set(['calibration', 'approved_hr', 'signed_off']);
    if (!validPhases.has(cycle.status)) {
      return NextResponse.json(
        { error: `Scores can only be computed during calibration or later. Current status: ${cycle.status}` },
        { status: 409 },
      );
    }

    if (!cycle.formulaConfig) {
      return NextResponse.json({ error: 'Cycle has no formula configuration' }, { status: 422 });
    }

    const { components, scale } = cycle.formulaConfig;

    // Aggregate per-reviewee per-role average scores from submitted/locked reviews
    const pipeline = [
      {
        $match: {
          cycleId: new mongoose.Types.ObjectId(id),
          status:  { $in: ['submitted', 'locked'] },
        },
      },
      { $unwind: '$ratings' },
      {
        $group: {
          _id: { revieweeId: '$revieweeId', reviewerRole: '$reviewerRole' },
          avgScore: { $avg: '$ratings.score' },
        },
      },
      {
        $group: {
          _id: '$_id.revieweeId',
          scores: {
            $push: { role: '$_id.reviewerRole', avg: '$avgScore' },
          },
        },
      },
    ];

    const rows = await WorkspacePMSReview.aggregate(pipeline);

    // Build a lookup map from source → weight
    const weightMap = new Map<string, number>();
    for (const c of components) {
      weightMap.set(c.source, c.weight);
    }
    const totalWeight = components.reduce((s, c) => s + c.weight, 0) || 1;

    let computed = 0;
    for (const row of rows) {
      const revieweeId: mongoose.Types.ObjectId = row._id;
      const scores: Array<{ role: string; avg: number }> = row.scores;

      // Collapse multiple peer entries into a single average before weighting.
      // The $group pipeline pushes one entry per reviewer; without this step,
      // 3 peers would contribute 3× the peer weight instead of 1×.
      const roleAccum = new Map<string, { sum: number; count: number }>();
      for (const s of scores) {
        const key = s.role === 'peer' ? 'peer_avg' : s.role;
        const cur = roleAccum.get(key) ?? { sum: 0, count: 0 };
        roleAccum.set(key, { sum: cur.sum + s.avg, count: cur.count + 1 });
      }

      let weightedSum = 0;
      for (const [key, { sum, count }] of roleAccum) {
        const roleAvg = sum / count;
        const weight  = weightMap.get(key) ?? 0;
        weightedSum  += roleAvg * weight;
      }

      let finalScore = weightedSum / totalWeight;
      // Cap to scale range
      finalScore = Math.min(scale.max, Math.max(scale.min, finalScore));

      // Only stamp finalScore on submitted/locked reviews — not drafts
      await WorkspacePMSReview.updateMany(
        {
          cycleId:     new mongoose.Types.ObjectId(id),
          revieweeId,
          status:      { $in: ['submitted', 'locked'] },
        },
        { $set: { finalScore } },
      );

      computed++;
    }

    return NextResponse.json({ computed });
  }, ['super_admin', 'hr_admin']);
}
