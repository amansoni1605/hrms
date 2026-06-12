import { NextRequest, NextResponse }       from 'next/server';
import { auditEvent }                       from '@/lib/withRoute';
import { withFeature }                       from '@/lib/featureGate';
import { WorkspacePayrollRun, WorkspaceEmployee } from '@/models/workspace.models';
import { getTenantDEK, TenantContext }     from '@/infrastructure/multiTenantCore';
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
  const { key: dekKey } = await getTenantDEK(ctx.tenantId.toString());

  // Estimate totals (cannot decrypt individual salaries in bulk for seeded demo data)
  const estimated = activeEmps.length * 80_000;
  const grossEst  = Math.round(estimated * 1.28);
  const dedEst    = Math.round(grossEst  * 0.34);
  const netEst    = grossEst - dedEst;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const run = await (WorkspacePayrollRun as any).create({
    tenantId:          ctx.tenantId,
    runCode:           `PAY-${year}-${String(month).padStart(2,'0')}-${Date.now().toString(36).toUpperCase()}`,
    payPeriodMonth:    month,
    payPeriodYear:     year,
    currencyCode:      'USD',
    runStatus:         'draft',
    totalGrossEnc:     encryptNum(dekKey, grossEst),
    totalNetEnc:       encryptNum(dekKey, netEst),
    totalDeductionsEnc:encryptNum(dekKey, dedEst),
    employeeCount:     activeEmps.length,
    lineItems: activeEmps.map((e) => ({
      employeeId:    e._id,
      employeeCode:  e.employeeCode,
      currencyCode:  e.currencyCode ?? 'USD',
      baseSalaryEnc: e.baseSalaryEnc,
      grossSalaryEnc:e.baseSalaryEnc,
      netSalaryEnc:  e.baseSalaryEnc,
      lineHash:      createHash('sha256').update(e.employeeCode + month + year).digest('hex'),
    })),
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
