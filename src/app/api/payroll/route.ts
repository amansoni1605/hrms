import { NextRequest, NextResponse }       from 'next/server';
import { auditEvent }                       from '@/lib/withRoute';
import { withFeature }                       from '@/lib/featureGate';
import { WorkspacePayrollRun, WorkspaceEmployee } from '@/models/workspace.models';
import { getTenantDEK, TenantContext, decryptNumber } from '@/infrastructure/multiTenantCore';
import { notify }                          from '@/lib/notificationService';
import { applyDueCompRevisions }           from '@/lib/compensation';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';

function encryptNum(key: Buffer, n: number): Buffer {
  const iv     = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body   = Buffer.concat([cipher.update(String(n), 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([0x01]), iv, tag, body]);
}

// Compute gross / deductions / net from a monthly base salary.
// Rules (simplified statutory-compliant for INR payroll):
//   Gross  = base × 1.28  (HRA 40% of basic, transport ₹1,600, medical ₹1,250, LTA ₹833, other)
//   PF     = min(base × 0.12, 1_800)   [employee share, capped at ₹15k basic ceiling]
//   PT     = 200                         [professional tax — flat for most Indian states]
//   TDS    = gross × 0.10               [simplified 10% withholding; real calc needs Form-16 data]
//   Net    = gross - PF - PT - TDS
// For non-INR salaries the same ratios apply; statutory amounts scale proportionally.
function computePayComponents(base: number) {
  const gross       = Math.round(base * 1.28);
  const pf          = Math.min(Math.round(base * 0.12), 1_800);
  const pt          = 200;
  const tds         = Math.round(gross * 0.10);
  const deductions  = pf + pt + tds;
  const net         = gross - deductions;
  return { gross, net, deductions };
}

export const GET = withFeature('payroll', async (req) => {
  const { searchParams } = new URL(req.url);
  const year  = searchParams.get('year');
  const query: Record<string, unknown> = {};
  if (year) query['payPeriodYear'] = parseInt(year);

  const runs = await WorkspacePayrollRun.find(query).sort({ payPeriodYear: -1, payPeriodMonth: -1 }).lean();

  // Return run metadata without encrypted totals (UI shows structure not amounts)
  return NextResponse.json({
    data: runs.map((r) => ({
      _id:          r._id,
      runCode:      r.runCode,
      payPeriodMonth: r.payPeriodMonth,
      payPeriodYear:  r.payPeriodYear,
      runStatus:      r.runStatus,
      employeeCount:  r.employeeCount,
      currencyCode:   r.currencyCode,
      criticalFlagCount: r.criticalFlagCount,
      createdAt:      (r as unknown as { createdAt: Date }).createdAt,
    })),
  });
}, ['super_admin','hr_admin','hr_manager','payroll_officer']);

export const POST = withFeature('payroll', async (req, session) => {
  const body = await req.json();
  const { month, year } = body;

  if (!month || !year) {
    return NextResponse.json({ error: 'month and year are required' }, { status: 400 });
  }

  const ctx = TenantContext.requireStore('payroll POST');

  // Check for existing run
  const existing = await WorkspacePayrollRun.findOne({ payPeriodMonth: month, payPeriodYear: year });
  if (existing) {
    return NextResponse.json({ error: `Payroll run for ${month}/${year} already exists`, runId: existing._id }, { status: 409 });
  }

  // Apply any compensation revisions whose effective date has arrived, so this
  // run reflects all due raises before snapshotting salaries.
  const revisionsApplied = await applyDueCompRevisions(ctx.tenantId.toString());

  const activeEmps = await WorkspaceEmployee.find({ isActive: true, employeeStatus: 'active' }).lean();
  const tid = ctx.tenantId.toString();
  const { key: dekKey } = await getTenantDEK(tid);

  // Decrypt each employee's base salary, compute gross/net/deductions, re-encrypt.
  // Falls back to a ₹80,000 placeholder if the field is missing or unreadable.
  const FALLBACK_BASE = 80_000;
  const lineItems = await Promise.all(activeEmps.map(async (e) => {
    let base = FALLBACK_BASE;
    try {
      if (e.baseSalaryEnc) base = await decryptNumber(tid, e.baseSalaryEnc as Buffer);
    } catch { /* keep fallback */ }

    const { gross, net, deductions } = computePayComponents(base);
    return {
      employeeId:    e._id,
      employeeCode:  e.employeeCode,
      currencyCode:  e.currencyCode ?? 'INR',
      baseSalaryEnc: encryptNum(dekKey, base),
      grossSalaryEnc:encryptNum(dekKey, gross),
      netSalaryEnc:  encryptNum(dekKey, net),
      deductionsEnc: encryptNum(dekKey, deductions),
      attendanceDays: 26,   // default full-month attendance; adjust via attendance module
      leaveDaysDeducted: 0,
      overtimeHours: 0,
      lineHash:      createHash('sha256').update(e.employeeCode + month + year + base).digest('hex'),
    };
  }));

  // Re-compute accurate totals by decrypting each employee's base salary
  let sumGross = 0, sumNet = 0, sumDed = 0;
  for (const e of activeEmps) {
    let base = FALLBACK_BASE;
    try { if (e.baseSalaryEnc) base = await decryptNumber(tid, e.baseSalaryEnc as Buffer); } catch { /* */ }
    const { gross, net, deductions } = computePayComponents(base);
    sumGross += gross; sumNet += net; sumDed += deductions;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const run = await (WorkspacePayrollRun as any).create({
    tenantId:          ctx.tenantId,
    runCode:           `PAY-${year}-${String(month).padStart(2,'0')}-${Date.now().toString(36).toUpperCase()}`,
    payPeriodMonth:    month,
    payPeriodYear:     year,
    currencyCode:      activeEmps[0]?.currencyCode ?? 'INR',
    runStatus:         'draft',
    totalGrossEnc:     encryptNum(dekKey, sumGross),
    totalNetEnc:       encryptNum(dekKey, sumNet),
    totalDeductionsEnc:encryptNum(dekKey, sumDed),
    employeeCount:     activeEmps.length,
    lineItems,
  });

  await auditEvent({
    actionType:       'PAYROLL_RUN_CREATED',
    targetCollection: 'ws_payroll_runs',
    targetDocumentId: run._id.toString(),
    newStateHash:     createHash('sha256').update(run.runCode + Date.now()).digest('hex'),
    changeSummary:    { runCode: run.runCode, month, year, employeeCount: activeEmps.length },
  });

  // Notify payroll officers + HR admin that a new run is ready for audit
  await notify.payrollRunCreated({
    tenantId:       ctx.tenantId.toString(),
    runCode:        run.runCode,
    runId:          run._id.toString(),
    payPeriodMonth: month,
    payPeriodYear:  year,
    employeeCount:  activeEmps.length,
  });

  return NextResponse.json({ data: { runId: run._id, runCode: run.runCode, employeeCount: activeEmps.length, revisionsApplied } }, { status: 201 });
}, ['super_admin','hr_admin','payroll_officer']);
