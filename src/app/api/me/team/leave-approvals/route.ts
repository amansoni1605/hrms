import { NextResponse }             from 'next/server';
import { withRoute }                from '@/lib/withRoute';
import { WorkspaceLeaveRequest }    from '@/models/workspace.models';
import mongoose                     from 'mongoose';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/me/team/leave-approvals
//
// Returns leave requests in 'pending' status where the current user is
// the designated manager.  Used by the My Team page so line managers (who may
// have 'employee' role) can see and act on their team's leave requests.
// ─────────────────────────────────────────────────────────────────────────────

export const GET = withRoute(async (_req, session) => {
  if (!session.employeeId) {
    return NextResponse.json({ data: [] });
  }

  const empOid = new mongoose.Types.ObjectId(session.employeeId);

  const leaves = await WorkspaceLeaveRequest.find({
    managerId: empOid,
    status:    'pending',
  })
    .populate('employeeId', 'employeeCode jobTitle departmentName')
    .sort({ createdAt: 1 })
    .lean();

  return NextResponse.json({ data: leaves });
});
