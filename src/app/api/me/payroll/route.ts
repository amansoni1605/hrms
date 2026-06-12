import { NextResponse }            from 'next/server';
import { withRoute }               from '@/lib/withRoute';
import { WorkspacePayrollRun }     from '@/models/workspace.models';
import { TenantContext }           from '@/infrastructure/multiTenantCore';
import mongoose                    from 'mongoose';

export const GET = withRoute(async (_req, session) => {
  if (!session.employeeId) return NextResponse.json({ error: 'No employee linked' }, { status: 404 });

  const empOid = new mongoose.Types.ObjectId(session.employeeId);

  // Find payroll runs that contain a line item for this employee
  const runs = await WorkspacePayrollRun.find({
    'lineItems.employeeId': empOid,
  })
    .sort({ payPeriodYear: -1, payPeriodMonth: -1 })
    .limit(12)
    .lean();

  // Extract the employee's specific line item from each run
  const slips = runs.map((run) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const line = (run as any).lineItems?.find(
      (l: { employeeId: mongoose.Types.ObjectId }) =>
        l.employeeId.toString() === session.employeeId
    );
    return {
      _id:            run._id,
      runCode:        run.runCode,
      month:          run.payPeriodMonth,
      year:           run.payPeriodYear,
      currencyCode:   line?.currencyCode ?? run.currencyCode,
      status:         run.runStatus,
      // Salary values are encrypted — return placeholder for UI
      grossSalary:    null,
      netSalary:      null,
      baseSalary:     null,
    };
  });

  return NextResponse.json({ data: slips });
});
