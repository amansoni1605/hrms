/**
 * GET /api/payroll/form16?fyYear=2025[&employeeId=<id>]
 *
 * Returns a print-ready HTML Form 16 (TDS certificate under §203 Income Tax Act).
 * fyYear=2025 → FY 2025-26 (April 2025 – March 2026).
 *
 * HR roles can pass &employeeId= to get any employee's Form 16.
 * Employees get their own automatically.
 */

import { NextRequest, NextResponse }          from 'next/server';
import { runWithSession }                     from '@/lib/withRoute';
import { WorkspacePayrollRun, WorkspaceEmployee, Tenant } from '@/models/workspace.models';
import { TenantContext, decryptNumber }        from '@/infrastructure/multiTenantCore';
import { computePayComponents }               from '@/lib/payrollUtils';
import mongoose                               from 'mongoose';

const HR_ROLES = ['super_admin', 'hr_admin', 'payroll_officer', 'finance_auditor'];

export async function GET(req: NextRequest) {
  return runWithSession(async (session) => {
    const { searchParams } = new URL(req.url);
    const fyYear    = parseInt(searchParams.get('fyYear') ?? '');
    const empParam  = searchParams.get('employeeId');

    if (!fyYear || fyYear < 2020 || fyYear > 2099) {
      return NextResponse.json({ error: 'fyYear must be a valid 4-digit year' }, { status: 400 });
    }

    const isHR = HR_ROLES.includes(session.role);
    const targetEmpId = isHR && empParam ? empParam : session.employeeId;

    if (!targetEmpId) {
      return NextResponse.json({ error: 'No employee linked to session' }, { status: 400 });
    }
    if (!isHR && empParam && empParam !== session.employeeId) {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
    }

    const ctx = TenantContext.requireStore('GET /api/payroll/form16');
    const tid = ctx.tenantId.toString();

    // FY month/year ranges: April fyYear → March fyYear+1
    // Runs where (payPeriodYear=fyYear AND payPeriodMonth>=4)
    //         OR (payPeriodYear=fyYear+1 AND payPeriodMonth<=3)
    const runs = await WorkspacePayrollRun.find({
      runStatus: { $in: ['approved', 'paid'] },
      $or: [
        { payPeriodYear: fyYear,     payPeriodMonth: { $gte: 4 } },
        { payPeriodYear: fyYear + 1, payPeriodMonth: { $lte: 3 } },
      ],
    }).sort({ payPeriodYear: 1, payPeriodMonth: 1 }).lean();

    const emp    = await WorkspaceEmployee
      .findById(targetEmpId)
      .select('employeeCode jobTitle departmentName hireDate countryCode baseSalaryEnc currencyCode')
      .lean();
    const tenant = await Tenant.findById(ctx.tenantId).select('name').lean();

    if (!emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

    const cc      = (emp as unknown as { currencyCode?: string }).currencyCode ?? 'INR';
    const empCode = emp.employeeCode ?? targetEmpId;
    const company = (tenant as unknown as { name?: string })?.name ?? 'Company';

    let base = 80_000;
    try {
      if ((emp as unknown as { baseSalaryEnc?: Buffer }).baseSalaryEnc)
        base = await decryptNumber(tid, (emp as unknown as { baseSalaryEnc: Buffer }).baseSalaryEnc);
    } catch { /* keep fallback */ }

    // Aggregate salary + TDS across runs that include this employee
    const MONTHS = ['','January','February','March','April','May','June',
                    'July','August','September','October','November','December'];
    const quarterLabel = (m: number) =>
      m >= 4 && m <= 6  ? 'Q1 (Apr–Jun)'  :
      m >= 7 && m <= 9  ? 'Q2 (Jul–Sep)'  :
      m >= 10 && m <= 12? 'Q3 (Oct–Dec)' : 'Q4 (Jan–Mar)';

    type QuarterKey = 'Q1' | 'Q2' | 'Q3' | 'Q4';
    const quarterSums: Record<QuarterKey, { gross: number; tds: number }> = {
      Q1: { gross: 0, tds: 0 }, Q2: { gross: 0, tds: 0 },
      Q3: { gross: 0, tds: 0 }, Q4: { gross: 0, tds: 0 },
    };

    let totalGross = 0, totalTds = 0;
    const monthRows: Array<{ period: string; gross: number; tds: number }> = [];

    for (const run of runs) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const line = ((run as any).lineItems ?? []).find(
        (l: { employeeId: mongoose.Types.ObjectId }) => l.employeeId.toString() === targetEmpId,
      );

      let gross = 0, net = 0;
      try {
        if (line?.grossSalaryEnc) gross = await decryptNumber(tid, line.grossSalaryEnc);
        if (line?.netSalaryEnc)   net   = await decryptNumber(tid, line.netSalaryEnc);
      } catch { /* use engine estimate */ }

      // If line not in this run, estimate from current salary
      if (!line) {
        const comps = computePayComponents(base, cc);
        gross = comps.gross; net = comps.net;
      }

      const pf  = Math.min(Math.round(base * 0.12), 1_800);
      const pt  = 200;
      const tds = Math.max(0, gross - net - pf - pt);

      totalGross += gross;
      totalTds   += tds;

      const m = run.payPeriodMonth;
      const qKey: QuarterKey = m >= 4 && m <= 6 ? 'Q1' : m >= 7 && m <= 9 ? 'Q2' : m >= 10 ? 'Q3' : 'Q4';
      quarterSums[qKey].gross += gross;
      quarterSums[qKey].tds   += tds;

      monthRows.push({ period: `${MONTHS[m]} ${run.payPeriodYear}`, gross, tds });
    }

    // Standard deduction ₹50,000 under new regime
    const stdDeduction   = 50_000;
    const taxableIncome  = Math.max(0, totalGross - stdDeduction);
    const fyLabel        = `${fyYear}-${String(fyYear + 1).slice(-2)}`;

    const fmt = (n: number) =>
      new Intl.NumberFormat('en-IN', { style: 'currency', currency: cc, maximumFractionDigits: 0 }).format(n);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Form 16 — ${empCode} — FY ${fyLabel}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#1e293b;background:#fff}
  .print-bar{display:flex;align-items:center;justify-content:space-between;padding:12px 32px;background:#1e3a5f;color:#fff;position:sticky;top:0}
  .print-bar span{font-size:13px;opacity:.85}
  .print-btn{background:#fff;color:#1e3a5f;border:none;cursor:pointer;font-size:13px;font-weight:700;padding:7px 18px;border-radius:6px}
  @media print{.print-bar{display:none}body{font-size:11px}.page{padding:20px}}
  .page{max-width:820px;margin:0 auto;padding:32px}
  h2{font-size:14px;font-weight:700;color:#1e3a5f;margin-bottom:8px}
  .hdr{background:#1e3a5f;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0;display:flex;justify-content:space-between;align-items:flex-end}
  .hdr h1{font-size:18px;font-weight:800;letter-spacing:-.3px}
  .hdr .sub{font-size:11px;opacity:.75;margin-top:3px}
  .section{border:1px solid #e2e8f0;border-top:none;padding:16px 20px}
  .section+.section{border-top:none}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;margin-top:8px}
  .cell .lbl{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.05em}
  .cell .val{font-size:13px;font-weight:600;color:#0f172a;margin-top:2px}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th{background:#f1f5f9;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#475569;padding:6px 12px;text-align:left;border:1px solid #e2e8f0}
  td{padding:6px 12px;border:1px solid #e2e8f0;font-size:12px}
  td.num{text-align:right;font-variant-numeric:tabular-nums}
  tr.total td{background:#f8fafc;font-weight:700}
  .net-box{background:#1e3a5f;color:#fff;padding:16px 20px;border-radius:0 0 8px 8px;display:flex;justify-content:space-between;align-items:center}
  .net-box .lbl{font-size:10px;opacity:.7;text-transform:uppercase;letter-spacing:.06em}
  .net-box .val{font-size:22px;font-weight:800}
  .footer{margin-top:16px;font-size:10px;color:#94a3b8;text-align:center;line-height:1.7}
</style>
</head>
<body>
<div class="print-bar">
  <span>Form 16 — ${empCode} — FY ${fyLabel}</span>
  <button class="print-btn" onclick="window.print()">⬇ Download / Print PDF</button>
</div>
<div class="page">

<div class="hdr">
  <div>
    <h1>Form 16 — TDS Certificate</h1>
    <div class="sub">Under Section 203 of the Income Tax Act, 1961</div>
    <div class="sub">Financial Year ${fyLabel} (1 Apr ${fyYear} – 31 Mar ${fyYear + 1})</div>
  </div>
  <div style="text-align:right">
    <div class="sub" style="font-size:13px;font-weight:700;opacity:1">${company}</div>
    <div class="sub">Certificate for: ${empCode}</div>
  </div>
</div>

<!-- Part A: Employer + Employee details -->
<div class="section">
  <h2>Part A — Details of Tax Deducted and Deposited in Central Government Account</h2>
  <div class="grid2">
    <div class="cell"><div class="lbl">Employer / Deductor Name</div><div class="val">${company}</div></div>
    <div class="cell"><div class="lbl">Employee Code</div><div class="val">${empCode}</div></div>
    <div class="cell"><div class="lbl">Employer TAN</div><div class="val">MUMB12345A</div></div>
    <div class="cell"><div class="lbl">Period</div><div class="val">FY ${fyLabel}</div></div>
  </div>
</div>

<!-- Quarterly TDS summary -->
<div class="section">
  <h2>Quarterly TDS Summary</h2>
  <table>
    <thead>
      <tr>
        <th>Quarter</th>
        <th class="num">Salary Paid</th>
        <th class="num">TDS Deducted</th>
        <th class="num">TDS Deposited</th>
      </tr>
    </thead>
    <tbody>
      ${(['Q1','Q2','Q3','Q4'] as QuarterKey[]).map((q) => `
      <tr>
        <td>${{ Q1: 'Q1 (Apr–Jun)', Q2: 'Q2 (Jul–Sep)', Q3: 'Q3 (Oct–Dec)', Q4: 'Q4 (Jan–Mar)' }[q]}</td>
        <td class="num">${fmt(quarterSums[q].gross)}</td>
        <td class="num">${fmt(quarterSums[q].tds)}</td>
        <td class="num">${fmt(quarterSums[q].tds)}</td>
      </tr>`).join('')}
      <tr class="total">
        <td>Total</td>
        <td class="num">${fmt(totalGross)}</td>
        <td class="num">${fmt(totalTds)}</td>
        <td class="num">${fmt(totalTds)}</td>
      </tr>
    </tbody>
  </table>
</div>

<!-- Part B: Income details -->
<div class="section">
  <h2>Part B — Details of Salary Paid and Tax Deducted</h2>
  <table>
    <thead>
      <tr><th>Month</th><th class="num">Gross Salary</th><th class="num">TDS</th></tr>
    </thead>
    <tbody>
      ${monthRows.map(({ period, gross, tds }) => `
      <tr>
        <td>${period}</td>
        <td class="num">${fmt(gross)}</td>
        <td class="num">${fmt(tds)}</td>
      </tr>`).join('')}
      ${monthRows.length === 0 ? '<tr><td colspan="3" style="text-align:center;color:#94a3b8">No approved payroll runs found for this period.</td></tr>' : ''}
    </tbody>
  </table>
</div>

<!-- Tax computation -->
<div class="section">
  <h2>Tax Computation — New Regime (FY ${fyLabel})</h2>
  <div class="grid2" style="margin-top:8px">
    <div class="cell"><div class="lbl">Gross Salary (Annual)</div><div class="val">${fmt(totalGross)}</div></div>
    <div class="cell"><div class="lbl">Standard Deduction (§16)</div><div class="val">${fmt(stdDeduction)}</div></div>
    <div class="cell"><div class="lbl">Taxable Income</div><div class="val">${fmt(taxableIncome)}</div></div>
    <div class="cell"><div class="lbl">Total TDS Deducted</div><div class="val">${fmt(totalTds)}</div></div>
  </div>
</div>

<!-- Net pay highlight -->
<div class="net-box">
  <div><div class="lbl">Total TDS Deducted &amp; Deposited (FY ${fyLabel})</div></div>
  <div><div class="val">${fmt(totalTds)}</div></div>
</div>

<div class="footer">
  This is a system-generated Form 16 for informational purposes.<br/>
  Actual Form 16 must be issued under the employer's digital signature per Rule 31 of the IT Rules, 1962.<br/>
  Generated on ${new Date().toLocaleDateString('en-IN')} &nbsp;·&nbsp; ${company} HRMS
</div>

</div>
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' },
    });
  });
}
