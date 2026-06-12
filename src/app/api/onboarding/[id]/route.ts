import { NextRequest, NextResponse }   from 'next/server';
import { runWithSession }              from '@/lib/withRoute';
import {
  WorkspaceOnboarding,
  WorkspaceJobApplicant,
  WorkspaceTrainingProgram,
} from '@/models/workspace.models';
import mongoose                        from 'mongoose';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runWithSession(async () => {
    const record = await WorkspaceOnboarding.findById(id)
      .populate('employeeId', 'employeeCode firstName lastName jobTitle')
      .lean();
    if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ data: record });
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runWithSession(async () => {
    const body   = await req.json() as Record<string, unknown>;
    const record = await WorkspaceOnboarding.findById(id);
    if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Update individual task status
    if (body['taskId'] && body['taskStatus']) {
      const task = record.tasks.find(
        (t) => (t as unknown as { _id: mongoose.Types.ObjectId })._id?.toString() === body['taskId'],
      );
      if (task) {
        task.status      = body['taskStatus'] as string;
        task.completedAt = body['taskStatus'] === 'completed' ? new Date() : undefined;
      }
      const allDone = record.tasks.every((t) => t.status === 'completed');
      const anyDone = record.tasks.some((t)  => t.status === 'completed');
      record.status = allDone ? 'completed' : anyDone ? 'in_progress' : 'not_started';
      if (allDone) record.completedAt = new Date();

      // Completion trigger — fires exactly once when all tasks finish
      if (allDone && !record.completionTriggerFired) {
        record.completionTriggerFired = true;

        // Update applicant candidateStatus
        if (record.applicantId) {
          await WorkspaceJobApplicant.findByIdAndUpdate(record.applicantId, {
            $set: { candidateStatus: 'ONBOARDING_COMPLETED' },
          });
        }

        // Auto-enroll in all mandatory training programs (scheduled or draft)
        const mandatoryPrograms = await WorkspaceTrainingProgram.find({
          isMandatory: true,
          status: { $in: ['draft', 'scheduled'] },
        }).select('_id enrollments maxEnrollment');

        for (const prog of mandatoryPrograms) {
          const alreadyEnrolled = prog.enrollments.some(
            (e) => e.employeeId.toString() === record.employeeId.toString(),
          );
          if (!alreadyEnrolled && prog.enrollments.length < prog.maxEnrollment) {
            prog.enrollments.push({
              employeeId: record.employeeId as mongoose.Types.ObjectId,
              enrolledAt: new Date(),
              status:     'enrolled',
              result:     'na',
            } as typeof prog.enrollments[0]);
            await prog.save();
          }
        }

        // Advance to TRAINING_IN_PROGRESS if we enrolled in at least one program
        if (record.applicantId && mandatoryPrograms.length > 0) {
          await WorkspaceJobApplicant.findByIdAndUpdate(record.applicantId, {
            $set: { candidateStatus: 'TRAINING_IN_PROGRESS' },
          });
        }
      }
    }

    if (body['notes'] !== undefined) record.notes = String(body['notes']);
    await record.save();
    return NextResponse.json({ data: record });
  });
}
