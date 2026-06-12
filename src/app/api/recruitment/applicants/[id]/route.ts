import { NextRequest, NextResponse }  from 'next/server';
import { runWithSession }             from '@/lib/withRoute';
import { WorkspaceJobApplicant }      from '@/models/workspace.models';
import mongoose                       from 'mongoose';

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  applied:      ['shortlisted', 'rejected'],
  shortlisted:  ['interviewing', 'rejected'],
  interviewing: ['offered', 'rejected'],
  offered:      ['accepted', 'rejected', 'withdrawn'],
  accepted:     [],
  rejected:     [],
  withdrawn:    [],
};

// PATCH /api/recruitment/applicants/[id] — advance or reject applicant
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runWithSession(async () => {
    if (!mongoose.isValidObjectId(id))
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    const body = await req.json() as Record<string, unknown>;
    const newStatus = String(body['status'] ?? '');

    const applicant = await WorkspaceJobApplicant.findById(id);
    if (!applicant) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const allowed = ALLOWED_TRANSITIONS[applicant.status] ?? [];
    if (!allowed.includes(newStatus))
      return NextResponse.json({ error: `Cannot move ${applicant.status} → ${newStatus}` }, { status: 422 });

    applicant.status = newStatus as typeof applicant.status;

    // Sync candidateStatus on key transitions
    if (newStatus === 'shortlisted')   applicant.candidateStatus = 'SHORTLISTED';
    if (newStatus === 'offered')       applicant.candidateStatus = 'OFFER_EXTENDED';
    if (newStatus === 'accepted')      applicant.candidateStatus = 'OFFER_ACCEPTED';

    if (body['notes'] !== undefined) applicant.notes = String(body['notes']);

    await applicant.save();
    return NextResponse.json({ data: applicant });
  }, ['super_admin', 'hr_admin', 'hr_manager']);
}
