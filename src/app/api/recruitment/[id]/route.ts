import { NextRequest, NextResponse }  from 'next/server';
import { runWithSession }             from '@/lib/withRoute';
import { WorkspaceJobOpening, WorkspaceJobApplicant } from '@/models/workspace.models';
import { TenantContext }              from '@/infrastructure/multiTenantCore';
import mongoose                       from 'mongoose';

// GET /api/recruitment/[id] — opening detail with all applicants
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runWithSession(async () => {
    const [opening, applicants] = await Promise.all([
      WorkspaceJobOpening.findById(id).populate('departmentId', 'name').lean(),
      WorkspaceJobApplicant.find({ jobOpeningId: new mongoose.Types.ObjectId(id) })
        .sort({ createdAt: -1 }).lean(),
    ]);
    if (!opening) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ data: { opening, applicants } });
  }, ['super_admin','hr_admin','hr_manager']);
}

// PATCH /api/recruitment/[id] — update opening status
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runWithSession(async () => {
    const body    = await req.json() as Record<string, unknown>;
    const opening = await WorkspaceJobOpening.findById(id);
    if (!opening) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (body['status'])      opening.status      = body['status'] as typeof opening.status;
    if (body['headcount'])   opening.headcount   = Number(body['headcount']);
    if (body['description']) opening.description = String(body['description']);
    await opening.save();
    return NextResponse.json({ data: opening });
  }, ['super_admin','hr_admin','hr_manager']);
}

// POST /api/recruitment/[id] — add applicant to opening
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runWithSession(async () => {
    const ctx  = TenantContext.requireStore('POST /api/recruitment/[id]');
    const body = await req.json() as Record<string, unknown>;

    const applicant = await WorkspaceJobApplicant.create({
      tenantId:     ctx.tenantId,
      jobOpeningId: new mongoose.Types.ObjectId(id),
      name:         String(body['name'] ?? '').trim(),
      email:        String(body['email'] ?? '').trim().toLowerCase(),
      phone:        String(body['phone'] ?? ''),
      source:       String(body['source'] ?? 'direct'),
      notes:        String(body['notes'] ?? ''),
      status:       'applied',
    });

    return NextResponse.json({ data: applicant }, { status: 201 });
  }, ['super_admin','hr_admin','hr_manager']);
}
