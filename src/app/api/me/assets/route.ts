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
  ).select('provisionedAssets').lean();

  if (!emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

  return NextResponse.json({ data: emp.provisionedAssets ?? [] });
});
