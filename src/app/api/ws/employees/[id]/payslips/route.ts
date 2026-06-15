import { NextRequest, NextResponse }          from 'next/server';
import { runWithSession }                     from '@/lib/withRoute';
import { WorkspacePayrollRun }                from '@/models/workspace.models';
import { TenantContext, decryptNumber }       from '@/infrastructure/multiTenantCore';
import mongoose                              from 'mongoose';

// GET /api/ws/employees/[id]/payslips
// Returns last 24 months of payslips for a specific employee, with decrypted salary figures.
// HR / payroll roles only — employees use /api/me/payroll for their own self-service view.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return runWithSession(async () => {
    const ctx   = TenantContext.requireStore('GET /api/ws/employees/[id]/payslips');
    const tid   = ctx.tenantId.toString();
    const empId = new mongoose.Types.ObjectId(id);

    const runs = await WorkspacePayrollRun.find({ 'lineItems.employeeId': empId })
      .sort({ payPeriodYear: -1, payPeriodMonth: -1 })
      .limit(24)
      .lean();

    const slips = await Promise.all(
      runs.map(async (run) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const line = (run as any).lineItems?.find(
          (l: { employeeId: mongoose.Types.ObjectId }) => l.employeeId.toString() === id,
        );

        let baseSalary:  number | null = null;
        let grossSalary: number | null = null;
        let netSalary:   number | null = null;

        try {
          if (line?.baseSalaryEnc)  baseSalary  = await decryptNumber(tid, line.baseSalaryEnc);
          if (line?.grossSalaryEnc) grossSalary = await decryptNumber(tid, line.grossSalaryEnc);
          if (line?.netSalaryEnc)   netSalary   = await decryptNumber(tid, line.netSalaryEnc);
        } catch {
          // DEK version mismatch or corrupted field — return nulls rather than 500
        }

        return {
          _id:               run._id,
          runCode:           run.runCode,
          month:             run.payPeriodMonth,
          year:              run.payPeriodYear,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          payDate:           (run as any).payDate ?? null,
          currencyCode:      line?.currencyCode ?? run.currencyCode,
          status:            run.runStatus,
          baseSalary,
          grossSalary,
          netSalary,
          attendanceDays:    line?.attendanceDays    ?? null,
          overtimeHours:     line?.overtimeHours     ?? 0,
          leaveDaysDeducted: line?.leaveDaysDeducted ?? 0,
          varianceFlag:      line?.varianceFlag      ?? false,
        };
      }),
    );

    return NextResponse.json({ data: slips });
  }, ['super_admin', 'hr_admin', 'payroll_officer', 'finance_auditor']);
}
