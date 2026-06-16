import { NextResponse }            from 'next/server';
import { withRoute }               from '@/lib/withRoute';
import { WorkspacePayrollRun }     from '@/models/workspace.models';
import { TenantContext, decryptNumber } from '@/infrastructure/multiTenantCore';
import mongoose                    from 'mongoose';

export const GET = withRoute(async (_req, session) => {
  if (!session.employeeId) return NextResponse.json({ error: 'No employee linked' }, { status: 404 });

  const empOid = new mongoose.Types.ObjectId(session.employeeId);
  const ctx    = TenantContext.requireStore('GET /api/me/payroll');
  const tid    = ctx.tenantId.toString();

  const runs = await WorkspacePayrollRun.find({
    'lineItems.employeeId': empOid,
  })
    .sort({ payPeriodYear: -1, payPeriodMonth: -1 })
    .limit(24)
    .lean();

  const slips = await Promise.all(
    runs.map(async (run) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const line = (run as any).lineItems?.find(
        (l: { employeeId: mongoose.Types.ObjectId }) =>
          l.employeeId.toString() === session.employeeId,
      );

      let netSalary: number | null = null;
      let grossSalary: number | null = null;
      try {
        if (line?.netSalaryEnc)   netSalary   = await decryptNumber(tid, line.netSalaryEnc);
        if (line?.grossSalaryEnc) grossSalary = await decryptNumber(tid, line.grossSalaryEnc);
      } catch { /* leave null */ }

      return {
        _id:              run._id,
        runCode:          run.runCode,
        month:            run.payPeriodMonth,
        year:             run.payPeriodYear,
        currencyCode:     line?.currencyCode ?? run.currencyCode,
        status:           run.runStatus,
        attendanceDays:   line?.attendanceDays   ?? null,
        leaveDaysDeducted:line?.leaveDaysDeducted ?? null,
        lwpDays:          line?.lwpDays           ?? null,
        grossSalary,
        netSalary,
      };
    }),
  );

  return NextResponse.json({ data: slips });
});
