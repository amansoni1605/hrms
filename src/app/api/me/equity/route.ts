import { NextResponse }                  from 'next/server';
import { withRoute }                     from '@/lib/withRoute';
import { WorkspaceEmployee }             from '@/models/workspace.models';
import mongoose                          from 'mongoose';

export const GET = withRoute(async (_req, session) => {
  if (!session.employeeId) {
    return NextResponse.json({ error: 'No employee record linked to this account' }, { status: 404 });
  }

  const emp = await WorkspaceEmployee.findById(
    new mongoose.Types.ObjectId(session.employeeId),
  ).select('vestingSchedules').lean();

  if (!emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

  // Return the vesting schedules with *Enc fields stripped (toJSON is lean-safe here
  // because we map to plain objects)
  const grants = (emp.vestingSchedules ?? []).map((g) => {
    const { walletAddressEnc: _, ...safe } = g as typeof g & { walletAddressEnc?: unknown };
    return safe;
  });

  return NextResponse.json({ data: grants });
});
