import { NextRequest, NextResponse }  from 'next/server';
import { runWithSession }             from '@/lib/withRoute';
import {
  WorkspaceOnboarding,
  WorkspaceJobApplicant,
  WorkspaceTrainingProgram,
}                                     from '@/models/workspace.models';
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

      // Completion trigger — fires exactly once when all tasks finish
      if (allDone && !record.completionTriggerFired) {
        record.completionTriggerFired = true;

        if (record.applicantId) {
          await WorkspaceJobApplicant.findByIdAndUpdate(record.applicantId, {
            $set: { candidateStatus: 'ONBOARDING_COMPLETED' },
          });
        }

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

        if (record.applicantId && mandatoryPrograms.length > 0) {
          await WorkspaceJobApplicant.findByIdAndUpdate(record.applicantId, {
            $set: { candidateStatus: 'TRAINING_IN_PROGRESS' },
          });
        }
      }
    }

    await record.save();
    return NextResponse.json({ data: record });
  });
}
