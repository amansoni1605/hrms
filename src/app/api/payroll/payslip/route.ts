import { NextRequest, NextResponse }          from 'next/server';
import { runWithSession }                     from '@/lib/withRoute';
import { WorkspacePayrollRun, WorkspaceEmployee, Tenant } from '@/models/workspace.models';
import { TenantContext, decryptNumber }       from '@/infrastructure/multiTenantCore';
import mongoose                              from 'mongoose';

// GET /api/payroll/payslip?runId=<id>[&employeeId=<id>]
// Returns a print-ready HTML payslip page.
// HR roles can pass employeeId for any employee; employees get only their own.
export async function GET(req: NextRequest) {
  return runWithSession(async (session) => {
    const { searchParams } = new URL(req.url);
    const runId       = searchParams.get('runId');
    const targetEmpId = searchParams.get('employeeId') ?? session.employeeId;

    if (!runId || !mongoose.isValidObjectId(runId)) {
      return NextResponse.json({ error: 'Invalid runId' }, { status: 400 });
    }
    if (!targetEmpId) {
      return NextResponse.json({ error: 'No employee linked to session' }, { status: 400 });
    }

    const HR_ROLES = ['super_admin', 'hr_admin', 'payroll_officer', 'finance_auditor'];
    if (!HR_ROLES.includes(session.role) && targetEmpId !== session.employeeId) {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
    }

    const ctx = TenantContext.requireStore('GET /api/payroll/payslip');
    const tid = ctx.tenantId.toString();

    const run = await WorkspacePayrollRun.findById(runId).lean();
    if (!run) return NextResponse.json({ error: 'Payroll run not found' }, { status: 404 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const line = (run as any).lineItems?.find(
      (l: { employeeId: mongoose.Types.ObjectId }) => l.employeeId.toString() === targetEmpId,
    );
    if (!line) return NextResponse.json({ error: 'Employee not in this payroll run' }, { status: 404 });

    let baseSalary = 0, grossSalary = 0, netSalary = 0;
    try {
      if (line.baseSalaryEnc)  baseSalary  = await decryptNumber(tid, line.baseSalaryEnc);
      if (line.grossSalaryEnc) grossSalary = await decryptNumber(tid, line.grossSalaryEnc);
      if (line.netSalaryEnc)   netSalary   = await decryptNumber(tid, line.netSalaryEnc);
    } catch { /* use zeros */ }

    const deductions = grossSalary - netSalary;
    const cc         = line.currencyCode || run.currencyCode || 'INR';

    const emp    = await WorkspaceEmployee.findById(targetEmpId)
      .select('employeeCode jobTitle departmentName hireDate countryCode').lean();
    const tenant = await Tenant.findById(ctx.tenantId).select('name').lean();

    const MONTHS = ['','January','February','March','April','May','June',
                    'July','August','September','October','November','December'];
    const period  = `${MONTHS[run.payPeriodMonth]} ${run.payPeriodYear}`;
    const company = (tenant as unknown as { name?: string })?.name ?? 'Company';
    const empCode = emp?.employeeCode ?? targetEmpId;
    const jobTitle = (emp as unknown as { jobTitle?: string })?.jobTitle ?? '—';

    const fmt = (n: number) =>
      new Intl.NumberFormat('en-IN', { style: 'currency', currency: cc, maximumFractionDigits: 0 }).format(n);

    const hra       = Math.round(baseSalary * 0.40);
    const transport = 1_600;
    const medical   = 1_250;
    const other     = Math.max(0, grossSalary - baseSalary - hra - transport - medical);
    const pf        = Math.min(Math.round(baseSalary * 0.12), 1_800);
    const pt        = 200;
    const tds       = Math.max(0, deductions - pf - pt);

    const earningRows: [string, number][] = [
      ['Basic Salary', baseSalary],
      ['HRA',          hra],
      ['Transport Allowance', transport],
      ['Medical Allowance',   medical],
      ...(other > 0 ? [['Other Allowances', other] as [string, number]] : []),
    ];
    const deductionRows: [string, number][] = [
      ['Provident Fund (Employee)',  pf],
      ['Professional Tax',           pt],
      ['Tax Deducted at Source',     tds],
    ];

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Payslip — ${empCode} — ${period}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1e293b; background: #fff; }

  .page { max-width: 800px; margin: 0 auto; padding: 32px; }

  /* Print controls — hidden when printing */
  .print-bar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 32px; background: #1e40af; color: #fff; position: sticky; top: 0;
  }
  .print-bar span { font-size: 13px; opacity: .85; }
  .print-btn {
    background: #fff; color: #1e40af; border: none; cursor: pointer;
    font-size: 13px; font-weight: 700; padding: 7px 18px; border-radius: 6px;
  }
  @media print { .print-bar { display: none; } body { font-size: 11px; } .page { padding: 20px; } }

  /* Header */
  .header { background: #1e40af; color: #fff; padding: 24px 28px; border-radius: 8px 8px 0 0; display: flex; justify-content: space-between; align-items: flex-end; }
  .header h1 { font-size: 20px; font-weight: 700; letter-spacing: -.3px; }
  .header .sub { font-size: 12px; opacity: .75; margin-top: 4px; }
  .header .run-code { font-size: 10px; opacity: .6; font-family: monospace; }

  /* Info grid */
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border: 1px solid #e2e8f0; border-top: none; }
  .info-cell { padding: 10px 16px; border-bottom: 1px solid #e2e8f0; }
  .info-cell:nth-child(odd) { border-right: 1px solid #e2e8f0; }
  .info-label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: .05em; }
  .info-value { font-size: 13px; font-weight: 600; color: #0f172a; margin-top: 2px; }

  /* Earnings / Deductions table */
  .table-wrap { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border: 1px solid #e2e8f0; border-top: none; }
  .col { border-right: 1px solid #e2e8f0; }
  .col:last-child { border-right: none; }
  .col-head { background: #f8fafc; padding: 8px 16px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #475569; border-bottom: 1px solid #e2e8f0; }
  .row { display: flex; justify-content: space-between; padding: 7px 16px; border-bottom: 1px solid #f1f5f9; }
  .row-label { color: #475569; }
  .row-earn  { color: #0f172a; font-weight: 600; }
  .row-deduct { color: #dc2626; font-weight: 600; }

  /* Totals bar */
  .totals { display: grid; grid-template-columns: 1fr 1fr; background: #f1f5f9; border: 1px solid #e2e8f0; border-top: none; }
  .total-cell { padding: 10px 16px; }
  .total-cell:first-child { border-right: 1px solid #e2e8f0; }
  .total-label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: .05em; }
  .total-value { font-size: 15px; font-weight: 700; margin-top: 3px; }
  .total-earn   { color: #0f172a; }
  .total-deduct { color: #dc2626; }

  /* Net pay */
  .net-pay { background: #1e40af; color: #fff; padding: 18px 24px; border-radius: 0 0 8px 8px; display: flex; justify-content: space-between; align-items: center; }
  .net-label { font-size: 11px; opacity: .75; letter-spacing: .06em; text-transform: uppercase; }
  .net-amount { font-size: 26px; font-weight: 800; letter-spacing: -.5px; }

  .footer { margin-top: 20px; font-size: 10px; color: #94a3b8; text-align: center; line-height: 1.6; }
</style>
</head>
<body>
<div class="print-bar">
  <span>Payslip — ${empCode} — ${period}</span>
  <button class="print-btn" onclick="window.print()">⬇ Download / Print PDF</button>
</div>
<div class="page">

  <!-- Header -->
  <div class="header">
    <div>
      <h1>${company}</h1>
      <div class="sub">Pay Slip · ${period}</div>
    </div>
    <div style="text-align:right">
      <div class="sub" style="font-size:13px;font-weight:700;opacity:1">${empCode}</div>
      <div class="run-code">${run.runCode}</div>
    </div>
  </div>

  <!-- Employee info -->
  <div class="info-grid">
    <div class="info-cell"><div class="info-label">Designation</div><div class="info-value">${jobTitle}</div></div>
    <div class="info-cell"><div class="info-label">Pay Period</div><div class="info-value">${period}</div></div>
    <div class="info-cell"><div class="info-label">Employee Code</div><div class="info-value">${empCode}</div></div>
    <div class="info-cell"><div class="info-label">Currency</div><div class="info-value">${cc}</div></div>
  </div>

  <!-- Earnings + Deductions -->
  <div class="table-wrap">
    <div class="col">
      <div class="col-head">Earnings</div>
      ${earningRows.map(([l, a]) => `
      <div class="row"><span class="row-label">${l}</span><span class="row-earn">${fmt(a)}</span></div>`).join('')}
    </div>
    <div class="col">
      <div class="col-head">Deductions</div>
      ${deductionRows.map(([l, a]) => `
      <div class="row"><span class="row-label">${l}</span><span class="row-deduct">${fmt(a)}</span></div>`).join('')}
    </div>
  </div>

  <!-- Totals -->
  <div class="totals">
    <div class="total-cell"><div class="total-label">Gross Earnings</div><div class="total-value total-earn">${fmt(grossSalary)}</div></div>
    <div class="total-cell"><div class="total-label">Total Deductions</div><div class="total-value total-deduct">${fmt(deductions)}</div></div>
  </div>

  <!-- Net Pay -->
  <div class="net-pay">
    <div class="net-label">Net Pay</div>
    <div class="net-amount">${fmt(netSalary)}</div>
  </div>

  <div class="footer">
    This is a computer-generated payslip and does not require a signature.<br/>
    Generated on ${new Date().toLocaleDateString('en-IN')} &nbsp;·&nbsp; Run: ${run.runCode}
  </div>

</div>
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type':  'text/html; charset=utf-8',
        'Cache-Control': 'private, no-store',
      },
    });
  });
}
