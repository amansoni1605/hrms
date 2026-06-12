import { NextRequest, NextResponse }  from 'next/server';
import { withRoute }                  from '@/lib/withRoute';
import { WorkspaceShiftType }         from '@/models/workspace.models';
import { TenantContext }              from '@/infrastructure/multiTenantCore';

// GET /api/attendance/shifts — list all shift types
export const GET = withRoute(async () => {
  const data = await WorkspaceShiftType.find({ isActive: true }).sort({ name: 1 }).lean();
  return NextResponse.json({ data });
});

// POST /api/attendance/shifts — create shift type (HR admin only)
export const POST = withRoute(async (req) => {
  const ctx  = TenantContext.requireStore('POST /api/attendance/shifts');
  const body = await req.json() as Record<string, unknown>;

  const shift = await WorkspaceShiftType.create({
    tenantId:           ctx.tenantId,
    name:               String(body['name'] ?? '').trim(),
    code:               String(body['code'] ?? '').trim().toUpperCase(),
    startTime:          String(body['startTime'] ?? '09:00'),
    endTime:            String(body['endTime']   ?? '18:00'),
    gracePeriodMinutes: Number(body['gracePeriodMinutes'] ?? 15),
    earlyExitGrace:     Number(body['earlyExitGrace']     ?? 15),
    autoAttendance:     body['autoAttendance'] !== false,
    isWfh:              body['isWfh'] === true,
  });

  return NextResponse.json({ data: shift }, { status: 201 });
}, ['super_admin','hr_admin','hr_manager']);
