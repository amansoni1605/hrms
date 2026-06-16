import { NextResponse }                  from 'next/server';
import { withFeature }                   from '@/lib/featureGate';
import { HR_EXTENDED_ROLES }             from '@/lib/roles';
import { WorkspaceEmployee, WorkspaceDepartment, WorkspaceLeaveRequest, WorkspacePayrollRun } from '@/models/workspace.models';

export const GET = withFeature('analytics', async () => {
  const [
    totalEmployees,
    activeEmployees,
    onLeave,
    departments,
    pendingLeaves,
    latestPayroll,
    riskDistribution,
    deptHeadcount,
    leaveTrend,
  ] = await Promise.all([
    WorkspaceEmployee.countDocuments({ isActive: true }),
    WorkspaceEmployee.countDocuments({ isActive: true, employeeStatus: 'active' }),
    WorkspaceEmployee.countDocuments({ isActive: true, employeeStatus: 'on_leave' }),
    WorkspaceDepartment.countDocuments({ isActive: true }),
    WorkspaceLeaveRequest.countDocuments({ status: 'pending' }),
    WorkspacePayrollRun.findOne({ status: 'completed' })
      .sort({ payPeriodYear: -1, payPeriodMonth: -1 })
      .select('totalGross employeeCount payPeriodYear payPeriodMonth')
      .lean(),

    // Risk distribution buckets
    WorkspaceEmployee.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: {
            $switch: {
              branches: [
                { case: { $gte: ['$burnoutRiskScore', 0.7] }, then: 'high' },
                { case: { $gte: ['$burnoutRiskScore', 0.4] }, then: 'medium' },
              ],
              default: 'low',
            },
          },
          count: { $sum: 1 },
        },
      },
    ]),

    // Department headcount with risk averages
    WorkspaceEmployee.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id:            '$departmentId',
          department:     { $first: '$departmentName' },
          headcount:      { $sum: 1 },
          avgBurnoutRisk: { $avg: '$burnoutRiskScore' },
          avgFlightRisk:  { $avg: '$flightRiskScore' },
        },
      },
      {
        $project: {
          department:     1,
          headcount:      1,
          avgBurnoutRisk: { $ifNull: [{ $round: ['$avgBurnoutRisk', 3] }, 0] },
          avgFlightRisk:  { $ifNull: [{ $round: ['$avgFlightRisk',  3] }, 0] },
        },
      },
      { $sort: { avgBurnoutRisk: -1 } },
    ]),

    // Leave trend — last 6 months
    WorkspaceLeaveRequest.aggregate([
      { $match: { createdAt: { $gte: new Date(Date.now() - 180 * 86_400_000) } } },
      {
        $group: {
          _id:      { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
          total:    { $sum: 1 },
          approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]),
  ]);

  // Format risk distribution
  const riskMap: Record<string, number> = { high: 0, medium: 0, low: 0 };
  for (const r of riskDistribution as Array<{ _id: string; count: number }>) {
    riskMap[r._id] = r.count;
  }

  // Use real payroll total if available; fall back to 0 (never fabricate salary data)
  const payrollRun = latestPayroll as { totalGross?: number; employeeCount?: number } | null;
  const latestPayrollTotal = payrollRun?.totalGross ?? 0;
  const payrollIsEstimated = !payrollRun?.totalGross;

  return NextResponse.json({
    summary: {
      totalEmployees,
      activeEmployees,
      onLeave,
      departments,
      pendingLeaves,
      latestPayrollTotal,
      payrollIsEstimated,
    },
    riskDistribution: [
      { label: 'High Risk',   value: riskMap['high']   ?? 0, color: '#ef4444' },
      { label: 'Medium Risk', value: riskMap['medium'] ?? 0, color: '#f59e0b' },
      { label: 'Low Risk',    value: riskMap['low']    ?? 0, color: '#22c55e' },
    ],
    departmentMetrics: deptHeadcount,
    leaveTrend: (leaveTrend as Array<{ _id: { year: number; month: number }; total: number; approved: number; rejected: number }>)
      .map((l) => ({
        month:    `${l._id.year}-${String(l._id.month).padStart(2, '0')}`,
        total:    l.total,
        approved: l.approved,
        rejected: l.rejected,
      })),
  });
}, HR_EXTENDED_ROLES);  // restrict: employees cannot see aggregate org data
