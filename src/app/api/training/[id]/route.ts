import { NextRequest, NextResponse }  from 'next/server';
import { runWithSession }             from '@/lib/withRoute';
import {
  WorkspaceTrainingProgram,
  WorkspaceJobApplicant,
  WorkspaceUser,
}                                     from '@/models/workspace.models';
import mongoose                       from 'mongoose';

// GET /api/training/[id] — program detail; HR gets enrolled employee names
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runWithSession(async (session) => {
    const program = await WorkspaceTrainingProgram.findById(id).lean();
    if (!program) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const isHR = ['super_admin','hr_admin','hr_manager'].includes(session.role);

    if (isHR && program.enrollments.length > 0) {
      const empIds = program.enrollments.map((e) => e.employeeId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const users = await (WorkspaceUser as any).find(
        { employeeId: { $in: empIds } },
      ).select('employeeId name email').lean() as Array<{ employeeId: mongoose.Types.ObjectId; name: string; email: string }>;

      const nameMap = new Map(users.map((u) => [u.employeeId.toString(), { name: u.name, email: u.email }]));

      return NextResponse.json({
        data: {
          ...program,
          enrollments: program.enrollments.map((e) => ({
            ...e,
            ...(nameMap.get(e.employeeId.toString()) ?? {}),
          })),
        },
      });
    }

    return NextResponse.json({ data: program });
  });
}

// PATCH /api/training/[id] — update status, enroll/withdraw/attend
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
    } else if (body['action'] === 'attend' && session.employeeId) {
      const enrollment = program.enrollments.find(
        (e) => e.employeeId.toString() === session.employeeId,
      );
      if (enrollment) {
        enrollment.status     = 'completed';
        enrollment.attendedAt = new Date();
        enrollment.result     = 'pass';
      }
      await program.save();

      const empOid = new mongoose.Types.ObjectId(session.employeeId);

      // Only check mandatory programs this employee is actually enrolled in
      // (avoids false negatives from programs in draft or programs they weren't enrolled in)
      const enrolledMandatory = await WorkspaceTrainingProgram.find({
        isMandatory: true,
        'enrollments.employeeId': empOid,
      }).select('enrollments').lean();

      const allDone = enrolledMandatory.length > 0 && enrolledMandatory.every((p) => {
        const e = p.enrollments.find((en) => en.employeeId.toString() === session.employeeId);
        return e?.status === 'completed';
      });

      if (allDone) {
        // Direct update via employeeId — covers any post-hire status
        await WorkspaceJobApplicant.findOneAndUpdate(
          { employeeId: empOid, candidateStatus: { $in: ['ONBOARDING_COMPLETED', 'TRAINING_IN_PROGRESS'] } },
          { $set: { candidateStatus: 'FULLY_RAMPED' } },
        );
      }

      return NextResponse.json({ data: program, fullyRamped: allDone });
    } else if (isHR) {
      if (body['status']) program.status = body['status'] as typeof program.status;
      if (body['scheduledAt']) program.scheduledAt = new Date(String(body['scheduledAt']));
    }

    await program.save();
    return NextResponse.json({ data: program });
  });
}
