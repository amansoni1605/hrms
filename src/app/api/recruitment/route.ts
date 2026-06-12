import { NextRequest, NextResponse }  from 'next/server';
import { withRoute }                  from '@/lib/withRoute';
import { WorkspaceJobOpening, WorkspaceJobApplicant } from '@/models/workspace.models';
import { TenantContext }              from '@/infrastructure/multiTenantCore';

// GET /api/recruitment — list job openings with applicant counts
export const GET = withRoute(async (req) => {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') ?? '';

  const query: Record<string, unknown> = {};
  if (status) query['status'] = status;

  const openings = await WorkspaceJobOpening.find(query)
    .populate('departmentId', 'name')
    .sort({ createdAt: -1 })
    .lean();

  const openingIds = openings.map((o) => o._id);
  const counts = await WorkspaceJobApplicant.aggregate([
    { $match: { jobOpeningId: { $in: openingIds } } },
    { $group: { _id: '$jobOpeningId', total: { $sum: 1 }, byStatus: { $push: '$status' } } },
  ]);

  const countMap = new Map(counts.map((c) => [c._id.toString(), c]));

  const data = openings.map((o) => ({
    ...o,
    applicantCount: countMap.get(o._id.toString())?.total ?? 0,
  }));

  return NextResponse.json({ data });
}, ['super_admin','hr_admin','hr_manager']);

// POST /api/recruitment — create job opening
export const POST = withRoute(async (req) => {
  const ctx  = TenantContext.requireStore('POST /api/recruitment');
  const body = await req.json() as Record<string, unknown>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const opening = await (WorkspaceJobOpening as any).create({
    tenantId:     ctx.tenantId,
    title:        String(body['title'] ?? '').trim(),
    departmentId: body['departmentId'] || undefined,
    designation:  String(body['designation'] ?? '').trim(),
    headcount:    Number(body['headcount'] ?? 1),
    description:  String(body['description'] ?? ''),
    requirements: Array.isArray(body['requirements']) ? body['requirements'] : [],
    createdById:  ctx.userId,
  });

  return NextResponse.json({ data: opening }, { status: 201 });
}, ['super_admin','hr_admin','hr_manager']);
