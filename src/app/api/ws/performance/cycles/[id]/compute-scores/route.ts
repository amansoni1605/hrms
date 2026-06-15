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

      let weightedSum = 0;
      for (const s of scores) {
        // peer scores use 'peer_avg' weight key
        const key    = s.role === 'peer' ? 'peer_avg' : s.role;
        const weight = weightMap.get(key) ?? 0;
        weightedSum += s.avg * weight;
      }

      let finalScore = weightedSum / totalWeight;
      // Cap to scale range
      finalScore = Math.min(scale.max, Math.max(scale.min, finalScore));

      await WorkspacePMSReview.updateMany(
        { cycleId: new mongoose.Types.ObjectId(id), revieweeId },
        { $set: { finalScore } },
      );

      computed++;
    }

    return NextResponse.json({ computed });
  }, ['super_admin', 'hr_admin']);
}
