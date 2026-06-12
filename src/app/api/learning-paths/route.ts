import { NextRequest, NextResponse }   from 'next/server';
import { withRoute }                  from '@/lib/withRoute';
import { WorkspaceLearningPath }      from '@/models/workspace.models';
import { TenantContext }              from '@/infrastructure/multiTenantCore';

// GET /api/learning-paths — list all learning paths for the tenant
export const GET = withRoute(async () => {
  const data = await WorkspaceLearningPath.find({})
    .populate('tracks.programId', 'title category isMandatory scheduledAt durationHours')
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json({ data });
});

// POST /api/learning-paths — create a new learning path (HR only)
export const POST = withRoute(async (req) => {
  const ctx  = TenantContext.requireStore('POST /api/learning-paths');
  const body = await req.json() as Record<string, unknown>;

  const name = String(body['name'] ?? '').trim();
  if (!name)
    return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const tracks = Array.isArray(body['tracks'])
    ? (body['tracks'] as Array<Record<string, unknown>>).map((t, i) => ({
        programId:   t['programId'],
        order:       Number(t['order'] ?? i + 1),
        isMandatory: t['isMandatory'] !== false,
        delayDays:   Number(t['delayDays'] ?? 0),
      }))
    : [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const path = await (WorkspaceLearningPath as any).create({
    tenantId:    ctx.tenantId,
    name,
    description: body['description'] ? String(body['description']) : undefined,
    targetRole:  body['targetRole']  ? String(body['targetRole'])  : undefined,
    isActive:    body['isActive'] !== false,
    tracks,
    createdById: ctx.userId,
  });

  return NextResponse.json({ data: path }, { status: 201 });
}, ['super_admin', 'hr_admin', 'hr_manager']);
