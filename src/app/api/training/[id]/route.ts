import { NextRequest, NextResponse }  from 'next/server';
import { runWithSession }             from '@/lib/withRoute';
import { WorkspaceTrainingProgram }   from '@/models/workspace.models';
import mongoose                       from 'mongoose';

// GET /api/training/[id] — program details
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runWithSession(async () => {
    const program = await WorkspaceTrainingProgram.findById(id).lean();
    if (!program) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ data: program });
  });
}

// PATCH /api/training/[id] — update status, enroll/withdraw
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runWithSession(async (session) => {
    const body    = await req.json() as Record<string, unknown>;
    const program = await WorkspaceTrainingProgram.findById(id);
    if (!program) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const isHR = ['super_admin','hr_admin','hr_manager'].includes(session.role);

    if (body['action'] === 'enroll' && session.employeeId) {
      const already = program.enrollments.some(
        (e) => e.employeeId.toString() === session.employeeId,
      );
      if (!already && program.enrollments.length < program.maxEnrollment) {
        program.enrollments.push({
          employeeId: new mongoose.Types.ObjectId(session.employeeId),
          enrolledAt: new Date(),
          status:     'enrolled',
          result:     'na',
        } as typeof program.enrollments[0]);
      }
    } else if (body['action'] === 'withdraw' && session.employeeId) {
      program.enrollments = program.enrollments.filter(
        (e) => e.employeeId.toString() !== session.employeeId,
      );
    } else if (isHR) {
      if (body['status']) program.status = body['status'] as typeof program.status;
      if (body['scheduledAt']) program.scheduledAt = new Date(String(body['scheduledAt']));
    }

    await program.save();
    return NextResponse.json({ data: program });
  });
}
