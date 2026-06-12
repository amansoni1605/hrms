import { NextRequest, NextResponse }  from 'next/server';
import { withRoute }                  from '@/lib/withRoute';
import { WorkspaceAttendance }        from '@/models/workspace.models';
import { TenantContext }              from '@/infrastructure/multiTenantCore';
import mongoose                       from 'mongoose';

// GET /api/me/attendance — employee's attendance history
export const GET = withRoute(async (req, session) => {
  if (!session.employeeId) return NextResponse.json({ error: 'No employee linked' }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const ctx    = TenantContext.requireStore('GET /api/me/attendance');
  const days   = Math.min(parseInt(searchParams.get('days') ?? '30'), 90);
  const since  = new Date(); since.setDate(since.getDate() - days); since.setHours(0, 0, 0, 0);

  const logs = await WorkspaceAttendance.find({
    'meta.employeeId': new mongoose.Types.ObjectId(session.employeeId),
    ts: { $gte: since },
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

  return NextResponse.json({ data: { summary, stats: { presentDays, halfDays, totalLogged, days } } });
});
