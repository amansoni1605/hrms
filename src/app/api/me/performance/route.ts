import { NextResponse }                from 'next/server';
import { withRoute }                    from '@/lib/withRoute';
import { WorkspacePerformanceReview }   from '@/models/workspace.models';
import mongoose                         from 'mongoose';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/me/performance
//   The authenticated employee's own performance reviews (newest first).
// ─────────────────────────────────────────────────────────────────────────────

export const GET = withRoute(async (_req, session) => {
  if (!session.employeeId) return NextResponse.json({ error: 'No employee linked' }, { status: 404 });

  const reviews = await WorkspacePerformanceReview.find({
    employeeId: new mongoose.Types.ObjectId(session.employeeId),
    isActive:   true,
  }).sort({ createdAt: -1 }).lean();

  return NextResponse.json({ data: reviews });
});
