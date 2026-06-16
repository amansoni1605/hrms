import { NextRequest, NextResponse }  from 'next/server';
import { runWithSession }             from '@/lib/withRoute';
import {
  WorkspaceTrainingProgram,
  WorkspaceOnboarding,
  WorkspaceJobApplicant,
}                                     from '@/models/workspace.models';
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
      // Employee self-marks completion
      const enrollment = program.enrollments.find(
        (e) => e.employeeId.toString() === session.employeeId,
      );
      if (enrollment) {
        enrollment.status     = 'completed';
        enrollment.attendedAt = new Date();
        enrollment.result     = 'pass';
      }
      await program.save();

      // Check if ALL mandatory programs for this employee are now complete
      const empOid = new mongoose.Types.ObjectId(session.employeeId);
      const allMandatory = await WorkspaceTrainingProgram.find({
        isMandatory: true,
        status: { $in: ['scheduled', 'in_progress', 'completed'] },
      }).select('enrollments').lean();

      const allDone = allMandatory.every((p) => {
        const e = p.enrollments.find(
          (en) => en.employeeId.toString() === session.employeeId,
        );
        return e?.status === 'completed';
      });

      if (allDone && allMandatory.length > 0) {
        // Advance candidateStatus → FULLY_RAMPED via the onboarding → applicant chain
        const onboarding = await WorkspaceOnboarding.findOne({ employeeId: empOid }).select('applicantId').lean();
        if (onboarding?.applicantId) {
          await WorkspaceJobApplicant.findByIdAndUpdate(onboarding.applicantId, {
            $set: { candidateStatus: 'FULLY_RAMPED' },
          });
        }
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
