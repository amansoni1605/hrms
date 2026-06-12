import { NextResponse }             from 'next/server';
import { withRoute }                from '@/lib/withRoute';
import { WorkspaceDepartment, WorkspaceEmployee } from '@/models/workspace.models';

export const GET = withRoute(async () => {
  const [depts, headcounts] = await Promise.all([
    WorkspaceDepartment.find({ isActive: true }).sort({ name: 1 }).lean(),
    WorkspaceEmployee.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$departmentId', count: { $sum: 1 }, avgBurnout: { $avg: '$burnoutRiskScore' } } },
    ]),
  ]);

  const hcMap = new Map(
    (headcounts as Array<{ _id: string; count: number; avgBurnout: number }>)
      .map((h) => [h._id.toString(), { count: h.count, avgBurnout: parseFloat((h.avgBurnout ?? 0).toFixed(3)) }])
  );

  return NextResponse.json({
    data: depts.map((d) => ({
      ...d,
      liveHeadcount: hcMap.get(d._id.toString())?.count ?? d.headCount,
      avgBurnoutRisk: hcMap.get(d._id.toString())?.avgBurnout ?? 0,
    })),
  });
}, ['super_admin','hr_admin','hr_manager','payroll_officer','finance_auditor','compliance_officer']);
