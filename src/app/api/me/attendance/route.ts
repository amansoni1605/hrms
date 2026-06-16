import { NextRequest, NextResponse }  from 'next/server';
import { withRoute }                  from '@/lib/withRoute';
import { WorkspaceAttendance }        from '@/models/workspace.models';
import { TenantContext }              from '@/infrastructure/multiTenantCore';
import mongoose                       from 'mongoose';

// GET /api/me/attendance — employee's attendance history
// Supports ?days=30 (default) OR ?month=M&year=Y for calendar mode
export const GET = withRoute(async (req, session) => {
  if (!session.employeeId) return NextResponse.json({ error: 'No employee linked' }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const ctx    = TenantContext.requireStore('GET /api/me/attendance');

  let since: Date, until: Date;
  const monthParam = searchParams.get('month');
  const yearParam  = searchParams.get('year');

  if (monthParam && yearParam) {
    const m = parseInt(monthParam); const y = parseInt(yearParam);
    since = new Date(y, m - 1, 1);
    until = new Date(y, m, 0, 23, 59, 59);
  } else {
    const days = Math.min(parseInt(searchParams.get('days') ?? '30'), 90);
    since = new Date(); since.setDate(since.getDate() - days); since.setHours(0, 0, 0, 0);
    until = new Date();
  }

  // Explicit meta.tenantId uses the compound index { meta.tenantId, meta.employeeId, ts }.
  // Root-level tenantId (injected by plugin) shares data but isn't indexed for this query shape.
  const logs = await WorkspaceAttendance.find({
    'meta.tenantId':   ctx.tenantId,
    'meta.employeeId': new mongoose.Types.ObjectId(session.employeeId),
    ts: { $gte: since, $lte: until },
  }).sort({ ts: 1 }).lean();

  // Group by date → daily summary
  const byDate = new Map<string, { checkIn?: Date; checkOut?: Date; hours: number; status: string }>();
  for (const log of logs) {
    const key = log.ts.toISOString().slice(0, 10);
    const day = byDate.get(key) ?? { hours: 0, status: 'absent' };
    if (log.eventType === 'check_in')  day.checkIn  = log.ts;
    if (log.eventType === 'check_out') day.checkOut = log.ts;
    if (day.checkIn && day.checkOut) {
      day.hours  = (day.checkOut.getTime() - day.checkIn.getTime()) / 3_600_000;
      day.status = day.hours < 2 ? 'absent' : day.hours < 4 ? 'half_day' : 'present';
    }
    byDate.set(key, day);
  }

  const summary = Array.from(byDate.entries()).map(([date, d]) => ({ date, ...d }));

  const presentDays  = summary.filter((d) => d.status === 'present').length;
  const halfDays     = summary.filter((d) => d.status === 'half_day').length;
  const totalLogged  = summary.length;
  const days         = Math.round((until.getTime() - since.getTime()) / 86_400_000) + 1;

  return NextResponse.json({ data: { summary, stats: { presentDays, halfDays, totalLogged, days } } });
});
