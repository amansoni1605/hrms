/**
 * BullMQ queue + worker for agentic payroll audit.
 * Runs statutory checks on a newly-created payroll run and advances
 * runStatus → 'audit_passed' or 'audit_failed'.
 *
 * Call startPayrollAuditWorker() exactly once at server startup
 * (from src/instrumentation.ts).
 */

import { Queue, Worker, Job } from 'bullmq';
import { randomUUID }         from 'node:crypto';
import { WorkspacePayrollRun } from '@/models/workspace.models';
import { getTenantDEK, decryptNumber } from '@/infrastructure/multiTenantCore';
import { computePayComponents }        from '@/lib/payrollUtils';

const REDIS_CONNECTION = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379'),
};

const QUEUE_NAME = 'payrollAudit';

export interface PayrollAuditJobData {
  runId:    string;
  tenantId: string;
}

export const payrollAuditQueue = new Queue<PayrollAuditJobData>(QUEUE_NAME, {
  connection:        REDIS_CONNECTION,
  defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5_000 } },
});

// ─────────────────────────────────────────────────────────────────────────────
// Audit flag builder helpers
// ─────────────────────────────────────────────────────────────────────────────

type Severity = 'critical' | 'warning' | 'informational';

function mkFlag(
  severity:      Severity,
  checkCode:     string,
  description:   string,
  affectedCount: number,
  opts: { statutoryRef?: string; remediation?: string; isBlocking?: boolean } = {},
) {
  return {
    flagId:        randomUUID(),
    severity,
    checkCode,
    description,
    affectedCount,
    statutoryRef:  opts.statutoryRef,
    remediation:   opts.remediation,
    isBlocking:    opts.isBlocking ?? severity === 'critical',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker — singleton guard
// ─────────────────────────────────────────────────────────────────────────────

let _started = false;

export function startPayrollAuditWorker(): void {
  if (_started) return;
  _started = true;

  const worker = new Worker<PayrollAuditJobData>(
    QUEUE_NAME,
    async (job: Job<PayrollAuditJobData>) => {
      const { runId, tenantId } = job.data;

      const run = await WorkspacePayrollRun.findById(runId);
      if (!run) throw new Error(`Payroll run ${runId} not found`);

      // Transition → audit running
      await WorkspacePayrollRun.findByIdAndUpdate(runId, {
        $set: { runStatus: 'agentic_audit_queued' },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lineItems: Array<any> = (run as any).lineItems ?? [];
      const flags: ReturnType<typeof mkFlag>[] = [];

      // Decrypt each line item once
      const decrypted: Array<{
        employeeCode:   string;
        base:           number;
        gross:          number;
        net:            number;
        attendanceDays: number;
        lwpDays:        number;
      }> = [];

      for (const line of lineItems) {
        let base = 0, gross = 0, net = 0;
        try {
          if (line.baseSalaryEnc)  base  = await decryptNumber(tenantId, line.baseSalaryEnc);
          if (line.grossSalaryEnc) gross = await decryptNumber(tenantId, line.grossSalaryEnc);
          if (line.netSalaryEnc)   net   = await decryptNumber(tenantId, line.netSalaryEnc);
        } catch { continue; }
        decrypted.push({
          employeeCode:   line.employeeCode,
          base, gross, net,
          attendanceDays: line.attendanceDays ?? 0,
          lwpDays:        line.lwpDays        ?? 0,
        });
      }

      // ── Check 1: Negative net pay (critical) ─────────────────────────────
      const negativeNet = decrypted.filter((d) => d.net < 0);
      if (negativeNet.length > 0) {
        flags.push(mkFlag(
          'critical', 'NEGATIVE_NET_PAY',
          `${negativeNet.length} employee(s) have negative net pay after deductions.`,
          negativeNet.length,
          { statutoryRef: 'Payment of Wages Act §7', remediation: 'Review excess deductions or apply salary floor.' },
        ));
      }

      // ── Check 2: Zero attendance (warning) ───────────────────────────────
      const zeroAtt = decrypted.filter((d) => d.attendanceDays === 0);
      if (zeroAtt.length > 0) {
        flags.push(mkFlag(
          'warning', 'ZERO_ATTENDANCE',
          `${zeroAtt.length} employee(s) recorded 0 attendance days — verify LWP/LOP.`,
          zeroAtt.length,
          { statutoryRef: 'Internal attendance policy §3.1', remediation: 'Confirm leave approvals or correct attendance records.' },
        ));
      }

      // ── Check 3: TDS deviation >30% from §192 engine (warning) ──────────
      let tdsDeviations = 0;
      for (const d of decrypted) {
        const expectedPf  = Math.min(Math.round(d.base * 0.12), 1_800);
        // Strip out LWP before deriving implied TDS so LWP doesn't inflate the figure.
        const lwpAmount   = d.lwpDays > 0 ? Math.round(d.gross * d.lwpDays / 26) : 0;
        const impliedTds  = Math.max(0, (d.gross - d.net) - expectedPf - 200 - lwpAmount);
        const { tds: engineTds } = computePayComponents(d.base);
        if (engineTds > 0 && Math.abs(impliedTds - engineTds) / engineTds > 0.30) {
          tdsDeviations++;
        }
      }

      // ── Check 4a: High LWP days (warning) ───────────────────────────────
      const highLwp = decrypted.filter((d) => d.lwpDays >= 5);
      if (highLwp.length > 0) {
        flags.push(mkFlag(
          'warning', 'HIGH_LWP_DAYS',
          `${highLwp.length} employee(s) have ≥5 LWP days — verify attendance records or leave approvals.`,
          highLwp.length,
          { statutoryRef: 'Internal attendance policy §3.2', remediation: 'Cross-check biometric data and leave requests.' },
        ));
      }
      if (tdsDeviations > 0) {
        flags.push(mkFlag(
          'warning', 'TDS_DEVIATION',
          `${tdsDeviations} employee(s) have TDS deviating >30% from §192 computed amount.`,
          tdsDeviations,
          { statutoryRef: 'Income Tax Act §192', remediation: 'Review tax declarations or regime selection.' },
        ));
      }

      // ── Check 4: PF cap applied (informational) ──────────────────────────
      const highBasic = decrypted.filter((d) => d.base > 15_000);
      if (highBasic.length > 0) {
        flags.push(mkFlag(
          'informational', 'PF_CAP_APPLIED',
          `${highBasic.length} employee(s) have basic >₹15,000; PF capped at ₹1,800/mo.`,
          highBasic.length,
          { statutoryRef: 'EPF Act §6 — ₹15,000 basic ceiling', remediation: 'Employees may opt for voluntary PF on full salary.' },
        ));
      }

      const criticalCount = flags.filter((f) => f.severity === 'critical').length;
      const newStatus = criticalCount > 0 ? 'audit_failed' : 'audit_passed';

      await WorkspacePayrollRun.findByIdAndUpdate(runId, {
        $set: { auditFlags: flags, criticalFlagCount: criticalCount, runStatus: newStatus },
      });

      console.info(
        `[PayrollAudit] ${runId} → ${newStatus} | flags: ${flags.length} | critical: ${criticalCount}`,
      );
    },
    { connection: REDIS_CONNECTION },
  );

  worker.on('failed', (job, err) => {
    console.error(`[PayrollAudit] job ${job?.id} failed: ${err.message}`);
  });

  console.info('[PayrollAudit] Worker registered and listening.');
}
