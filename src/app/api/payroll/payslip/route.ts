import { NextRequest, NextResponse }          from 'next/server';
import { runWithSession }                     from '@/lib/withRoute';
import { WorkspacePayrollRun, WorkspaceEmployee, Tenant } from '@/models/workspace.models';
import { TenantContext, decryptNumber, decryptField } from '@/infrastructure/multiTenantCore';
import mongoose                              from 'mongoose';

function workingDaysInMonth(year: number, month: number): number {
  const d = new Date(year, month - 1, 1);
  let count = 0;
  while (d.getMonth() === month - 1) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

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

    // ── Decrypt salary fields ────────────────────────────────────────────────
    let baseSalary = 0, grossSalary = 0, netSalary = 0;
    try {
      if (line.baseSalaryEnc)  baseSalary  = await decryptNumber(tid, line.baseSalaryEnc);
      if (line.grossSalaryEnc) grossSalary = await decryptNumber(tid, line.grossSalaryEnc);
      if (line.netSalaryEnc)   netSalary   = await decryptNumber(tid, line.netSalaryEnc);
    } catch { /* use zeros */ }

    const cc = line.currencyCode || run.currencyCode || 'INR';

    // ── Attendance data from lineItem (stored at run-creation time) ──────────
    const workingDays:      number = workingDaysInMonth(run.payPeriodYear, run.payPeriodMonth);
    const attendanceDays:   number = line.attendanceDays    ?? workingDays;
    const leaveDaysDeducted:number = line.leaveDaysDeducted ?? 0;
    const lwpDays:          number = line.lwpDays           ?? 0;

    // ── Recompute statutory deduction breakdown from base salary ────────────
    // PF and PT are deterministic from base salary; TDS is derived from remaining.
    const pf  = Math.min(Math.round(baseSalary * 0.12), 1_800);
    const pt  = cc === 'INR' ? 200 : 0;
    // LWP = per-working-day rate × lwp days (as stored at run time)
    const lwp = lwpDays > 0 && workingDays > 0
      ? Math.round(grossSalary * lwpDays / workingDays)
      : 0;
    // TDS = total deductions minus the deterministic items (avoids absorbing LWP into TDS)
    const totalDeductions = grossSalary - netSalary;
    const tds = Math.max(0, totalDeductions - pf - pt - lwp);

    // ── Earnings breakdown ────────────────────────────────────────────────────
    const hra       = Math.round(baseSalary * 0.40);
    const transport = 1_600;
    const medical   = 1_250;
    const other     = Math.max(0, grossSalary - baseSalary - hra - transport - medical);

    const earningRows: [string, number][] = [
      ['Basic Salary',        baseSalary],
      ['HRA',                 hra],
      ['Transport Allowance', transport],
      ['Medical Allowance',   medical],
      ...(other > 0 ? [['Other Allowances', other] as [string, number]] : []),
    ];
    const deductionRows: [string, number][] = [
      ['Provident Fund (Employee)',  pf],
      ['Professional Tax',           pt],
      ['Tax Deducted at Source',     tds],
      ...(lwp > 0 ? [['Loss of Pay (LWP)',     lwp] as [string, number]] : []),
    ];

    // ── Employee + tenant meta ────────────────────────────────────────────────
    const emp    = await WorkspaceEmployee.findById(targetEmpId)
      .select('employeeCode jobTitle departmentName hireDate countryCode bankAccountEnc bankRoutingEnc').lean();
    const tenant = await Tenant.findById(ctx.tenantId).select('name').lean();

    let maskedBank = '—';
    try {
      const bankBuf = (emp as unknown as { bankAccountEnc?: Buffer }).bankAccountEnc;
      if (bankBuf) {
        const acct = await decryptField(tid, bankBuf);
        maskedBank = '••••' + acct.slice(-4);
      }
    } catch { /* no bank on file */ }

    const MONTHS = ['','January','February','March','April','May','June',
                    'July','August','September','October','November','December'];
    const period  = `${MONTHS[run.payPeriodMonth]} ${run.payPeriodYear}`;
    const company = (tenant as unknown as { name?: string })?.name ?? 'Company';
    const empCode = emp?.employeeCode ?? targetEmpId;
    const jobTitle = (emp as unknown as { jobTitle?: string })?.jobTitle ?? '—';
    const dept     = (emp as unknown as { departmentName?: string })?.departmentName ?? '—';

    const fmt = (n: number) =>
      new Intl.NumberFormat('en-IN', { style: 'currency', currency: cc, maximumFractionDigits: 0 }).format(n);

    const attPct = workingDays > 0 ? Math.round(attendanceDays / workingDays * 100) : 100;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Payslip — ${empCode} — ${period}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1e293b; background: #fff; }

  .page { max-width: 800px; margin: 0 auto; padding: 32px; }

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

  .header { background: #1e40af; color: #fff; padding: 24px 28px; border-radius: 8px 8px 0 0; display: flex; justify-content: space-between; align-items: flex-end; }
  .header h1 { font-size: 20px; font-weight: 700; letter-spacing: -.3px; }
  .header .sub { font-size: 12px; opacity: .75; margin-top: 4px; }
  .header .run-code { font-size: 10px; opacity: .6; font-family: monospace; }

  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border: 1px solid #e2e8f0; border-top: none; }
  .info-cell { padding: 10px 16px; border-bottom: 1px solid #e2e8f0; }
  .info-cell:nth-child(odd) { border-right: 1px solid #e2e8f0; }
  .info-label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: .05em; }
  .info-value { font-size: 13px; font-weight: 600; color: #0f172a; margin-top: 2px; }

  /* Attendance summary bar */
  .att-bar { display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid #e2e8f0; border-top: none; background: #f8fafc; }
  .att-cell { padding: 10px 16px; border-right: 1px solid #e2e8f0; }
  .att-cell:last-child { border-right: none; }
  .att-label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: .05em; }
  .att-value { font-size: 15px; font-weight: 700; margin-top: 2px; }
  .att-ok   { color: #15803d; }
  .att-warn { color: #b45309; }
  .att-bad  { color: #dc2626; }

  .table-wrap { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border: 1px solid #e2e8f0; border-top: none; }
  .col { border-right: 1px solid #e2e8f0; }
  .col:last-child { border-right: none; }
  .col-head { background: #f8fafc; padding: 8px 16px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #475569; border-bottom: 1px solid #e2e8f0; }
  .row { display: flex; justify-content: space-between; padding: 7px 16px; border-bottom: 1px solid #f1f5f9; }
  .row-label { color: #475569; }
  .row-earn  { color: #0f172a; font-weight: 600; }
  .row-deduct { color: #dc2626; font-weight: 600; }
  .row-lwp   { color: #b45309; font-weight: 700; }

  .totals { display: grid; grid-template-columns: 1fr 1fr; background: #f1f5f9; border: 1px solid #e2e8f0; border-top: none; }
  .total-cell { padding: 10px 16px; }
  .total-cell:first-child { border-right: 1px solid #e2e8f0; }
  .total-label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: .05em; }
  .total-value { font-size: 15px; font-weight: 700; margin-top: 3px; }
  .total-earn   { color: #0f172a; }
  .total-deduct { color: #dc2626; }

  .net-pay { background: #1e40af; color: #fff; padding: 18px 24px; border-radius: 0 0 8px 8px; display: flex; justify-content: space-between; align-items: center; }
  .net-label { font-size: 11px; opacity: .75; letter-spacing: .06em; text-transform: uppercase; }
  .net-amount { font-size: 26px; font-weight: 800; letter-spacing: -.5px; }

  .lwp-badge { background: #fef3c7; border: 1px solid #fde68a; padding: 7px 16px; font-size: 11px; color: #92400e; border-left: none; border-right: none; }

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

  <!-- Employee info grid -->
  <div class="info-grid">
    <div class="info-cell"><div class="info-label">Designation</div><div class="info-value">${jobTitle}</div></div>
    <div class="info-cell"><div class="info-label">Department</div><div class="info-value">${dept}</div></div>
    <div class="info-cell"><div class="info-label">Employee Code</div><div class="info-value">${empCode}</div></div>
    <div class="info-cell"><div class="info-label">Pay Period</div><div class="info-value">${period}</div></div>
    <div class="info-cell"><div class="info-label">Bank Account</div><div class="info-value">${maskedBank}</div></div>
    <div class="info-cell"><div class="info-label">Payment Mode</div><div class="info-value">NEFT / Direct Deposit</div></div>
  </div>

  <!-- Attendance summary -->
  <div class="att-bar">
    <div class="att-cell">
      <div class="att-label">Working Days</div>
      <div class="att-value att-ok">${workingDays}</div>
    </div>
    <div class="att-cell">
      <div class="att-label">Days Present</div>
      <div class="att-value ${attPct >= 80 ? 'att-ok' : attPct >= 60 ? 'att-warn' : 'att-bad'}">${attendanceDays}</div>
    </div>
    <div class="att-cell">
      <div class="att-label">Paid Leave</div>
      <div class="att-value att-ok">${leaveDaysDeducted}</div>
    </div>
    <div class="att-cell">
      <div class="att-label">LWP Days</div>
      <div class="att-value ${lwpDays === 0 ? 'att-ok' : 'att-bad'}">${lwpDays}</div>
    </div>
  </div>

  ${lwpDays > 0 ? `<div class="lwp-badge">⚠ Loss of Pay applied for <strong>${lwpDays} day${lwpDays > 1 ? 's' : ''}</strong> absent without approved leave — deducted at ₹${Math.round(grossSalary / workingDays).toLocaleString('en-IN')}/day</div>` : ''}

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
      <div class="row"><span class="row-label">${l}</span><span class="${l.includes('LWP') ? 'row-lwp' : 'row-deduct'}">${fmt(a)}</span></div>`).join('')}
    </div>
  </div>

  <!-- Totals -->
  <div class="totals">
    <div class="total-cell"><div class="total-label">Gross Earnings</div><div class="total-value total-earn">${fmt(grossSalary)}</div></div>
    <div class="total-cell"><div class="total-label">Total Deductions</div><div class="total-value total-deduct">${fmt(totalDeductions)}</div></div>
  </div>

  <!-- Net Pay -->
  <div class="net-pay">
    <div class="net-label">Net Pay</div>
    <div class="net-amount">${fmt(netSalary)}</div>
  </div>

  <div class="footer">
    This is a computer-generated payslip and does not require a signature.<br/>
    Attendance: ${attendanceDays} present + ${leaveDaysDeducted} paid leave${lwpDays > 0 ? ` + ${lwpDays} LWP` : ''} of ${workingDays} working days<br/>
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
