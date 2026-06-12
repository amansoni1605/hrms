import { NextRequest, NextResponse }   from 'next/server';
import { withRoute }                   from '@/lib/withRoute';
import { WorkspaceDepartment }         from '@/models/workspace.models';
import { TenantContext }               from '@/infrastructure/multiTenantCore';

export const GET = withRoute(async () => {
  const departments = await WorkspaceDepartment.find({ isActive: true }).sort({ name: 1 }).lean();
  return NextResponse.json({ data: departments });
});

export const POST = withRoute(async (req) => {
  const ctx  = TenantContext.requireStore('POST /api/departments');
  const body = await req.json() as Record<string, unknown>;

  // Whitelist — only accept known schema fields; drop arbitrary keys to prevent
  // injection into the WorkspaceDepartment document.
  const dept = await WorkspaceDepartment.create({
    tenantId:       ctx.tenantId,
    name:           String(body['name'] ?? '').trim(),
    code:           String(body['code'] ?? '').trim().toUpperCase(),
    costCenterCode: body['costCenterCode'] ? String(body['costCenterCode']).trim() : undefined,
    parentId:       body['parentId']       ? String(body['parentId'])               : undefined,
    isActive:       body['isActive']       !== false,
    headCount:      0,
  });
  return NextResponse.json({ data: dept }, { status: 201 });
}, ['super_admin','hr_admin']);
