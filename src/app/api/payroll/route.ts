import { NextRequest, NextResponse }       from 'next/server';
import { auditEvent }                       from '@/lib/withRoute';
import { withFeature }                       from '@/lib/featureGate';
import { WorkspacePayrollRun, WorkspaceEmployee } from '@/models/workspace.models';
import { getTenantDEK, TenantContext, decryptNumber } from '@/infrastructure/multiTenantCore';
import { notify }                          from '@/lib/notificationService';
import { applyDueCompRevisions }           from '@/lib/compensation';
import { computePayComponents, getAttendanceForPeriod, workingDaysInMonth } from '@/lib/payrollUtils';
import { payrollAuditQueue }               from '@/lib/queues/payrollAudit';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';

function encryptNum(key: Buffer, n: number): Buffer {
  const iv     = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body   = Buffer.concat([cipher.update(String(n), 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([0x01]), iv, tag, body]);
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

  // Decrypt salary, compute pay components with real India TDS, fetch real attendance.
  // Falls back to ₹80,000 if base salary field is missing or unreadable.
  const FALLBACK_BASE  = 80_000;
  const wdInMonth      = workingDaysInMonth(year, month);
  const payData = await Promise.all(activeEmps.map(async (e) => {
    let base = FALLBACK_BASE;
    try {
      if (e.baseSalaryEnc) base = await decryptNumber(tid, e.baseSalaryEnc as Buffer);
    } catch { /* keep fallback */ }
    const cc  = e.currencyCode ?? 'INR';
    const att = await getAttendanceForPeriod(e._id.toString(), month, year, tid)
      .catch(() => ({ attendanceDays: wdInMonth, leaveDaysDeducted: 0, lwpDays: 0 }));
    const comps = computePayComponents(base, cc, att.lwpDays, wdInMonth);
    return { e, base, cc, ...comps, ...att };
  }));

  const lineItems = payData.map(({ e, base, gross, net, deductions, cc, attendanceDays, leaveDaysDeducted, lwpDays }) => ({
    employeeId:        e._id,
    employeeCode:      e.employeeCode,
    currencyCode:      cc,
    baseSalaryEnc:     encryptNum(dekKey, base),
    grossSalaryEnc:    encryptNum(dekKey, gross),
    netSalaryEnc:      encryptNum(dekKey, net),
    deductionsEnc:     encryptNum(dekKey, deductions),
    attendanceDays,
    leaveDaysDeducted,
    lwpDays,
    overtimeHours:     0,
    lineHash:          createHash('sha256').update(e.employeeCode + month + year + base).digest('hex'),
  }));

  const sumGross = payData.reduce((s, d) => s + d.gross,      0);
  const sumNet   = payData.reduce((s, d) => s + d.net,        0);
  const sumDed   = payData.reduce((s, d) => s + d.deductions, 0);

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

  // Enqueue agentic audit — worker updates runStatus asynchronously
  try {
    await payrollAuditQueue.add('audit', { runId: run._id.toString(), tenantId: ctx.tenantId.toString() });
  } catch (e) {
    console.warn('[payroll] Could not enqueue audit job (Redis unavailable):', e);
  }

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
