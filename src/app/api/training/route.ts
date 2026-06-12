import { NextRequest, NextResponse }  from 'next/server';
import { withRoute }                  from '@/lib/withRoute';
import { WorkspaceTrainingProgram }   from '@/models/workspace.models';
import { TenantContext }              from '@/infrastructure/multiTenantCore';
import mongoose                       from 'mongoose';

// GET /api/training — list programs
export const GET = withRoute(async (req) => {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') ?? '';

  const query: Record<string, unknown> = {};
  if (status) query['status'] = status;

  const data = await WorkspaceTrainingProgram.find(query)
    .sort({ scheduledAt: -1 })
    .lean();

  return NextResponse.json({ data });
});

// POST /api/training — create program (HR only)
export const POST = withRoute(async (req) => {
  const ctx  = TenantContext.requireStore('POST /api/training');
  const body = await req.json() as Record<string, unknown>;

  const program = await WorkspaceTrainingProgram.create({
    tenantId:      ctx.tenantId,
    title:         String(body['title'] ?? '').trim(),
    description:   String(body['description'] ?? ''),
    trainer:       String(body['trainer'] ?? ''),
    category:      String(body['category'] ?? 'other'),
    scheduledAt:   body['scheduledAt'] ? new Date(String(body['scheduledAt'])) : undefined,
    durationHours: Number(body['durationHours'] ?? 1),
    maxEnrollment: Number(body['maxEnrollment'] ?? 50),
    isMandatory:   body['isMandatory'] === true,
    status:        'draft',
    createdById:   ctx.userId,
  });

  return NextResponse.json({ data: program }, { status: 201 });
}, ['super_admin','hr_admin','hr_manager']);
