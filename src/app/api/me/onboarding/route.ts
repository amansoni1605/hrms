import { NextRequest, NextResponse }  from 'next/server';
import { runWithSession }             from '@/lib/withRoute';
import { WorkspaceOnboarding }        from '@/models/workspace.models';
import mongoose                       from 'mongoose';

// GET /api/me/onboarding — employee fetches their own onboarding record
export async function GET(_req: NextRequest) {
  return runWithSession(async (session) => {
    if (!session.employeeId)
      return NextResponse.json({ data: null });

    const record = await WorkspaceOnboarding.findOne({
      employeeId: new mongoose.Types.ObjectId(session.employeeId),
    }).lean();

    return NextResponse.json({ data: record ?? null });
  });
}

// PATCH /api/me/onboarding — employee marks their own tasks complete/pending
export async function PATCH(req: NextRequest) {
  return runWithSession(async (session) => {
    if (!session.employeeId)
      return NextResponse.json({ error: 'No employee profile linked to this account' }, { status: 403 });

    const body   = await req.json() as Record<string, unknown>;
    const record = await WorkspaceOnboarding.findOne({
      employeeId: new mongoose.Types.ObjectId(session.employeeId),
    });

    if (!record)
      return NextResponse.json({ error: 'No onboarding record found' }, { status: 404 });

    if (body['taskId'] && body['taskStatus']) {
      const task = record.tasks.find(
        (t) => (t as unknown as { _id: mongoose.Types.ObjectId })._id?.toString() === body['taskId'],
      );

      // Employees can only update tasks assigned to them
      if (task && task.assignedTo === 'employee') {
        task.status      = body['taskStatus'] as string;
        task.completedAt = body['taskStatus'] === 'completed' ? new Date() : undefined;
      }

      const allDone = record.tasks.every((t) => t.status === 'completed');
      const anyDone = record.tasks.some((t)  => t.status === 'completed');
      record.status = allDone ? 'completed' : anyDone ? 'in_progress' : 'not_started';
      if (allDone) record.completedAt = new Date();
    }

    await record.save();
    return NextResponse.json({ data: record });
  });
}
