import { NextRequest, NextResponse }          from 'next/server';
import { runWithSession }                     from '@/lib/withRoute';
import { WorkspacePayrollRun, WorkspaceEmployee, Tenant } from '@/models/workspace.models';
import { TenantContext, decryptNumber }       from '@/infrastructure/multiTenantCore';
import mongoose                              from 'mongoose';

// GET /api/payroll/payslip?runId=<id>
// Generates a PDF payslip for the currently logged-in employee for a given payroll run.
// HR roles can pass an optional &employeeId= to generate payslips for any employee.
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
    const isHR = HR_ROLES.includes(session.role);

    // Non-HR users can only download their own payslip
    if (!isHR && targetEmpId !== session.employeeId) {
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
    if (!line) return NextResponse.json({ error: 'Employee not found in this payroll run' }, { status: 404 });

    // Decrypt salary figures
    let baseSalary = 0, grossSalary = 0, netSalary = 0;
    try {
      if (line.baseSalaryEnc)  baseSalary  = await decryptNumber(tid, line.baseSalaryEnc);
      if (line.grossSalaryEnc) grossSalary = await decryptNumber(tid, line.grossSalaryEnc);
      if (line.netSalaryEnc)   netSalary   = await decryptNumber(tid, line.netSalaryEnc);
    } catch { /* use zeros */ }

    const deductions = grossSalary - netSalary;
    const cc         = line.currencyCode || run.currencyCode || 'INR';

    const emp = await WorkspaceEmployee.findById(targetEmpId)
      .select('employeeCode jobTitle departmentName hireDate countryCode').lean();

    const tenant = await Tenant.findById(ctx.tenantId).select('name').lean();

    const MONTHS = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
    const period = `${MONTHS[run.payPeriodMonth]} ${run.payPeriodYear}`;

    // ── Try pdfkit — gracefully degrade to JSON if not installed ─────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let PDFDocument: (new (opts: Record<string, unknown>) => any) | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      PDFDocument = require('pdfkit');
    } catch {
      // pdfkit not installed — return JSON payslip data instead
      return NextResponse.json({
        data: {
          company:   (tenant as unknown as { name?: string })?.name ?? 'Company',
          employee:  emp?.employeeCode ?? targetEmpId,
          jobTitle:  (emp as unknown as { jobTitle?: string })?.jobTitle ?? '—',
          period,
          runCode:   run.runCode,
          currency:  cc,
          baseSalary,
          grossSalary,
          deductions,
          netSalary,
        },
        _note: 'Install pdfkit to get PDF download: npm install pdfkit @types/pdfkit',
      });
    }

    // ── Generate PDF ──────────────────────────────────────────────────────────
    // PDFDocument is non-null here: early return above handles the null case
    const doc = new PDFDocument!({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));

    await new Promise<void>((resolve) => {
      doc.on('end', resolve);

      const companyName = (tenant as unknown as { name?: string })?.name ?? 'Company';
      const empCode     = emp?.employeeCode ?? targetEmpId;
      const jobTitle    = (emp as unknown as { jobTitle?: string })?.jobTitle ?? '—';

      const fmt = (n: number) =>
        new Intl.NumberFormat('en-IN', { style: 'currency', currency: cc, maximumFractionDigits: 0 }).format(n);

      // Header band
      doc.rect(0, 0, 595, 90).fill('#1C509D');
      doc.fillColor('#ffffff')
        .font('Helvetica-Bold').fontSize(18)
        .text(companyName, 50, 28);
      doc.font('Helvetica').fontSize(11)
        .text('Pay Slip', 50, 52);
      doc.text(`Period: ${period}`, 50, 68);

      // Run code (top-right)
      doc.font('Helvetica').fontSize(9).fillColor('#CBD5E1')
        .text(run.runCode, 370, 70, { align: 'right', width: 175 });

      doc.fillColor('#000000');

      // Employee details section
      const y0 = 115;
      doc.font('Helvetica-Bold').fontSize(10).text('Employee Details', 50, y0);
      doc.moveTo(50, y0 + 14).lineTo(545, y0 + 14).strokeColor('#E2E8F0').stroke();

      const rows1 = [
        ['Employee Code', empCode],
        ['Designation',   jobTitle],
        ['Pay Period',    period],
        ['Currency',      cc],
      ];
      rows1.forEach(([label, value], i) => {
        const ry = y0 + 24 + i * 20;
        doc.font('Helvetica').fontSize(9).fillColor('#64748B').text(label, 50, ry);
        doc.font('Helvetica').fontSize(9).fillColor('#0F172A').text(value, 220, ry);
      });

      // Earnings / Deductions
      const y1 = y0 + 120;
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000').text('Earnings', 50, y1);
      doc.font('Helvetica-Bold').fontSize(10).text('Deductions', 300, y1);
      doc.moveTo(50, y1 + 14).lineTo(545, y1 + 14).strokeColor('#E2E8F0').stroke();

      const hra      = Math.round(baseSalary * 0.40);
      const transport= 1_600;
      const medical  = 1_250;
      const other    = grossSalary - baseSalary - hra - transport - medical;
      const pf       = Math.min(Math.round(baseSalary * 0.12), 1_800);
      const pt       = 200;
      const tds      = deductions - pf - pt;

      const earnings: [string, number][] = [
        ['Basic Salary', baseSalary],
        ['HRA',          hra],
        ['Transport',    transport],
        ['Medical',      medical],
        ['Other',        Math.max(0, other)],
      ];
      const deductionRows: [string, number][] = [
        ['Provident Fund',  pf],
        ['Professional Tax',pt],
        ['TDS',             Math.max(0, tds)],
      ];

      earnings.forEach(([label, amount], i) => {
        const ry = y1 + 24 + i * 18;
        doc.font('Helvetica').fontSize(9).fillColor('#334155').text(label, 50, ry);
        doc.font('Helvetica').fontSize(9).fillColor('#0F172A').text(fmt(amount), 160, ry, { align: 'right', width: 80 });
      });
      deductionRows.forEach(([label, amount], i) => {
        const ry = y1 + 24 + i * 18;
        doc.font('Helvetica').fontSize(9).fillColor('#334155').text(label, 300, ry);
        doc.font('Helvetica').fontSize(9).fillColor('#DC2626').text(fmt(amount), 410, ry, { align: 'right', width: 80 });
      });

      // Totals band
      const y2 = y1 + 24 + Math.max(earnings.length, deductionRows.length) * 18 + 16;
      doc.rect(50, y2, 495, 30).fill('#F1F5F9');
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#334155')
        .text('Gross Earnings', 60, y2 + 9);
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#0F172A')
        .text(fmt(grossSalary), 160, y2 + 9, { align: 'right', width: 80 });
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#334155')
        .text('Total Deductions', 310, y2 + 9);
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#DC2626')
        .text(fmt(deductions), 410, y2 + 9, { align: 'right', width: 80 });

      // Net pay highlight
      const y3 = y2 + 46;
      doc.rect(50, y3, 495, 44).fill('#1C509D');
      doc.font('Helvetica').fontSize(10).fillColor('#BFDBFE')
        .text('NET PAY', 60, y3 + 14);
      doc.font('Helvetica-Bold').fontSize(16).fillColor('#ffffff')
        .text(fmt(netSalary), 300, y3 + 10, { align: 'right', width: 235 });

      // Footer
      doc.font('Helvetica').fontSize(8).fillColor('#94A3B8')
        .text(
          `This is a computer-generated payslip. Generated on ${new Date().toLocaleDateString('en-IN')}. Run: ${run.runCode}`,
          50, y3 + 65, { align: 'center', width: 495 },
        );

      doc.end();
    });

    const pdfBuffer = Buffer.concat(chunks);
    const filename  = `payslip-${emp?.employeeCode ?? targetEmpId}-${MONTHS[run.payPeriodMonth]}-${run.payPeriodYear}.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length':      String(pdfBuffer.byteLength),
        'Cache-Control':       'private, no-store',
      },
    });
  });
}
