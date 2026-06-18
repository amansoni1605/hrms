import { NextResponse }  from 'next/server';
import { withRoute }     from '@/lib/withRoute';
import { WorkspaceAttendance, WorkspaceEmployee } from '@/models/workspace.models';
import { TenantContext } from '@/infrastructure/multiTenantCore';
import mongoose          from 'mongoose';

// GET /api/attendance/monthly?month=6&year=2026
// Returns per-day attendance counts for the entire month (HR calendar view)
export const GET = withRoute(async (req) => {
  const { searchParams } = new URL(req.url);
  const ctx   = TenantContext.requireStore('GET /api/attendance/monthly');
  const month = parseInt(searchParams.get('month') ?? String(new Date().getMonth() + 1));
  const year  = parseInt(searchParams.get('year')  ?? String(new Date().getFullYear()));

  const start = new Date(year, month - 1, 1);
  const end   = new Date(year, month,     0, 23, 59, 59);

  // Count active employees for denominator
  const totalEmployees = await WorkspaceEmployee.countDocuments({ isActive: true, employeeStatus: 'active' });

  // Aggregate check_in events per day
  const agg = await WorkspaceAttendance.aggregate([
    {
      $match: {
        'meta.tenantId': ctx.tenantId,
        eventType: 'check_in',
        ts: { $gte: start, $lte: end },
      },
    },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$ts' } },
          employeeId: '$meta.employeeId',
        },
      },
    },
    {
      $group: {
        _id: '$_id.date',
        present: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const days = agg.map((d: { _id: string; present: number }) => ({
    date:    d._id,
    present: d.present,
    absent:  Math.max(0, totalEmployees - d.present),
    total:   totalEmployees,
  }));

  return NextResponse.json({ data: { days, totalEmployees, month, year } });
}, ['super_admin', 'hr_admin', 'hr_manager', 'payroll_officer']);
