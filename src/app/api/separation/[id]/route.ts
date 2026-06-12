import { NextRequest, NextResponse }  from 'next/server';
import { runWithSession }             from '@/lib/withRoute';
import { WorkspaceSeparation }        from '@/models/workspace.models';
import mongoose                       from 'mongoose';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runWithSession(async () => {
    const sep = await WorkspaceSeparation.findById(id)
      .populate('employeeId', 'employeeCode firstName lastName jobTitle dateOfJoining currentCtc')
      .lean();
    if (!sep) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ data: sep });
  }, ['super_admin','hr_admin','hr_manager']);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runWithSession(async () => {
    const body = await req.json() as Record<string, unknown>;
    const sep  = await WorkspaceSeparation.findById(id);
    if (!sep) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (body['status']) sep.status = body['status'] as typeof sep.status;
    if (body['exitInterviewNotes']) sep.exitInterviewNotes = String(body['exitInterviewNotes']);

    // Update F&F values
    if (body['fnf']) {
      const fnf             = body['fnf'] as Record<string, number>;
      sep.fnf.pendingSalary    = fnf['pendingSalary']    ?? sep.fnf.pendingSalary;
      sep.fnf.leaveEncashment  = fnf['leaveEncashment']  ?? sep.fnf.leaveEncashment;
      sep.fnf.gratuity         = fnf['gratuity']         ?? sep.fnf.gratuity;
      sep.fnf.advanceDeductions= fnf['advanceDeductions']?? sep.fnf.advanceDeductions;
      sep.fnf.totalPayable     = sep.fnf.pendingSalary + sep.fnf.leaveEncashment + sep.fnf.gratuity - sep.fnf.advanceDeductions;
      if (body['fnfStatus']) sep.fnf.status = String(body['fnfStatus']) as typeof sep.fnf.status;
    }

    // Update individual offboarding task
    if (body['taskId'] && body['taskStatus']) {
      const task = sep.offboardingTasks.find((t) => (t as unknown as { _id: mongoose.Types.ObjectId })._id?.toString() === body['taskId']);
      if (task) {
        task.status      = body['taskStatus'] as string;
        task.completedAt = body['taskStatus'] === 'completed' ? new Date() : undefined;
      }
    }

    await sep.save();
    return NextResponse.json({ data: sep });
  }, ['super_admin','hr_admin','hr_manager']);
}
