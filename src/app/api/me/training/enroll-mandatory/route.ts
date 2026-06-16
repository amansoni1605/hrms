import { NextResponse }              from 'next/server';
import { runWithSession }            from '@/lib/withRoute';
import { WorkspaceTrainingProgram }  from '@/models/workspace.models';
import mongoose                      from 'mongoose';

// POST /api/me/training/enroll-mandatory
// Idempotent catch-up: enroll employee in every mandatory program they're not yet in.
// Safe to call multiple times — skips already-enrolled programs.
export async function POST() {
  return runWithSession(async (session) => {
    if (!session.employeeId)
      return NextResponse.json({ error: 'No employee profile linked' }, { status: 403 });

    const empId = new mongoose.Types.ObjectId(session.employeeId);

    // All statuses except cancelled — include in_progress so late joiners aren't excluded
    const programs = await WorkspaceTrainingProgram.find({
      isMandatory: true,
      status: { $in: ['draft', 'scheduled', 'in_progress'] },
    }).select('_id enrollments maxEnrollment');

    let enrolled = 0;
    for (const prog of programs) {
      const alreadyIn = prog.enrollments.some(
        (e) => e.employeeId.toString() === session.employeeId,
      );
      if (!alreadyIn && prog.enrollments.length < prog.maxEnrollment) {
        prog.enrollments.push({
          employeeId: empId,
          enrolledAt: new Date(),
          status:     'enrolled',
          result:     'na',
        } as typeof prog.enrollments[0]);
        await prog.save();
        enrolled++;
      }
    }

    return NextResponse.json({ data: { enrolled, total: programs.length } });
  });
}
