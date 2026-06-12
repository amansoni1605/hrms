import { NextResponse }                          from 'next/server';
import { withRoute }                              from '@/lib/withRoute';
import { WorkspaceAttendance, WorkspaceEmployee } from '@/models/workspace.models';
import { TenantContext }                          from '@/infrastructure/multiTenantCore';
import mongoose                                   from 'mongoose';

// GET /api/me/checkin — today's check-in status for the calling employee
export const GET = withRoute(async (_req, session) => {
  if (!session.employeeId) return NextResponse.json({ error: 'No employee linked' }, { status: 404 });

  const ctx   = TenantContext.requireStore('GET /api/me/checkin');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const empOid = new mongoose.Types.ObjectId(session.employeeId);

  const logs = await WorkspaceAttendance.find({
    'meta.tenantId':    ctx.tenantId,
    'meta.employeeId':  empOid,
    ts: { $gte: today },
  }).sort({ ts: 1 }).lean();

  return NextResponse.json({
    data: {
      checkedIn:  logs.some((l) => l.eventType === 'check_in'),
      checkedOut: logs.some((l) => l.eventType === 'check_out'),
      checkInAt:  logs.find((l)  => l.eventType === 'check_in')?.ts ?? null,
      logs,
    },
  });
});

// POST /api/me/checkin — record a check_in or check_out event
export const POST = withRoute(async (req, session) => {
  if (!session.employeeId) return NextResponse.json({ error: 'No employee linked' }, { status: 404 });

  const ctx    = TenantContext.requireStore('POST /api/me/checkin');
  const body   = await req.json().catch(() => ({})) as { eventType?: string; location?: string };
  const empOid = new mongoose.Types.ObjectId(session.employeeId);
  const today  = new Date(); today.setHours(0, 0, 0, 0);

  const eventType = body.eventType === 'check_out' ? 'check_out' as const : 'check_in' as const;

  // Duplicate guard — one check_in and one check_out per employee per day.
  const existing = await WorkspaceAttendance.findOne({
    'meta.tenantId':   ctx.tenantId,
    'meta.employeeId': empOid,
    eventType,
    ts: { $gte: today },
  }).lean();

  if (existing) {
    return NextResponse.json(
      { error: `Already recorded a ${eventType.replace('_', ' ')} for today` },
      { status: 409 },
    );
  }

  // Resolve employeeCode — required by the timeseries meta field.
  const emp = await WorkspaceEmployee.findById(empOid).select('employeeCode').lean();
  if (!emp) return NextResponse.json({ error: 'Employee record not found' }, { status: 404 });

  const now = new Date();

  const log = await WorkspaceAttendance.create({
    tenantId: ctx.tenantId,
    meta: {
      tenantId:     ctx.tenantId,
      employeeId:   empOid,
      employeeCode: emp.employeeCode,
      siteCode:     body.location ? String(body.location).toUpperCase().slice(0, 10) : undefined,
    },
    ts:             now,
    eventType,
    sourceProvider: 'web_portal',
    verifiedInZone: false,
    biometricPassed: false,
    anomalyCode:    'none',
    receivedAt:     now,
  });

  return NextResponse.json({ data: log }, { status: 201 });
});
