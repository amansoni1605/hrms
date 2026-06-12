/**
 * Compensation revision engine.
 *
 * Salary raises from accepted PMS recommendations are EFFECTIVE-DATED.  A raise
 * is only written to the employee's `baseSalaryEnc` on or after its effective
 * date — never before.  This module owns both halves:
 *
 *   applyRevisionNow()      — swap salary immediately (effective date already due)
 *   stagePendingRevision()  — store a future-dated revision without touching salary
 *   applyDueCompRevisions() — sweep due pending revisions and apply them
 *
 * The sweep is invoked lazily at the start of every payroll run (so payroll
 * always reflects raises whose effective date has arrived) and can also be
 * triggered standalone via POST /api/performance/comp/apply-due.
 */

import {
  WorkspaceEmployee, WorkspaceCompensationHistory, WorkspacePerformanceReview,
}                              from '@/models/workspace.models';
import { encryptNumber, decryptNumber } from '@/infrastructure/multiTenantCore';
import mongoose                from 'mongoose';

export interface RevisionInput {
  incrementPct:  number;
  promotion:     boolean;
  proposedTitle?: string;
  proposedBand?:  string;
  reviewId:      mongoose.Types.ObjectId;
  cycleLabel?:   string;
  decidedById:   mongoose.Types.ObjectId;
  note?:         string;
}

/** True when the effective date is today or in the past (raise is due now). */
export function isDue(effectiveDate: Date): boolean {
  return effectiveDate.getTime() <= Date.now();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EmpDoc = any;

/**
 * Re-encrypt baseSalaryEnc with the raised amount, apply title/band on promotion,
 * append an immutable compensation-history record, and mark the review applied.
 * Uses the compGuard escape hatch (_compensationCtx) for the protected fields.
 */
async function applyRevisionNow(
  tenantId: string,
  emp: EmpDoc,
  rev: RevisionInput,
  effectiveDate: Date,
): Promise<number> {
  const oldSalary = await decryptNumber(tenantId, emp.baseSalaryEnc);
  const newSalary = Math.round(oldSalary * (1 + (rev.incrementPct ?? 0) / 100));
  const oldEnc    = emp.baseSalaryEnc;
  const newEnc    = await encryptNumber(tenantId, newSalary);
  const oldTitle  = emp.jobTitle;
  const oldBand   = emp.salaryBand;

  const $set: Record<string, unknown> = { baseSalaryEnc: newEnc };
  // Clear any staged revision now that it's applied.
  const $unset: Record<string, unknown> = { pendingCompRevision: '' };
  if (rev.promotion) {
    if (rev.proposedTitle) $set['jobTitle']  = rev.proposedTitle;
    if (rev.proposedBand)  $set['salaryBand'] = rev.proposedBand;
    $set['lastPromotionDate'] = new Date();
  }

  const q = WorkspaceEmployee.findOneAndUpdate({ _id: emp._id }, { $set, $unset }, { new: true });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (q as any)._compensationCtx = true;
  await q;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (WorkspaceCompensationHistory as any).create({
    tenantId:      new mongoose.Types.ObjectId(tenantId),
    employeeId:    emp._id,
    employeeCode:  emp.employeeCode,
    reviewId:      rev.reviewId,
    cycleLabel:    rev.cycleLabel,
    changeType:    rev.promotion ? 'promotion' : 'merit',
    currencyCode:  emp.currencyCode,
    oldSalaryEnc:  oldEnc,
    newSalaryEnc:  newEnc,
    incrementPct:  rev.incrementPct,
    promotion:     rev.promotion,
    oldTitle, newTitle: rev.proposedTitle ?? oldTitle,
    oldBand,  newBand:  rev.proposedBand  ?? oldBand,
    effectiveDate,
    decidedById:   rev.decidedById,
    note:          rev.note,
  });

  // Mark the originating review as applied + keep its denormalised title in sync.
  const reviewSet: Record<string, unknown> = { 'compensation.appliedAt': new Date() };
  if (rev.promotion && rev.proposedTitle) reviewSet['jobTitle'] = rev.proposedTitle;
  await WorkspacePerformanceReview.updateOne({ _id: rev.reviewId }, { $set: reviewSet });

  return newSalary;
}

/**
 * Decide whether to apply immediately or stage for later, based on effectiveDate.
 * Returns { applied: boolean } so callers can tailor their response/notification.
 */
export async function applyOrStageRevision(
  tenantId: string,
  emp: EmpDoc,
  rev: RevisionInput,
  effectiveDate: Date,
): Promise<{ applied: boolean }> {
  if (isDue(effectiveDate)) {
    await applyRevisionNow(tenantId, emp, rev, effectiveDate);
    return { applied: true };
  }

  // Stage it — encrypt the target amount now, swap baseSalaryEnc only when due.
  const oldSalary = await decryptNumber(tenantId, emp.baseSalaryEnc);
  const newSalary = Math.round(oldSalary * (1 + (rev.incrementPct ?? 0) / 100));
  const newEnc    = await encryptNumber(tenantId, newSalary);

  await WorkspaceEmployee.updateOne(
    { _id: emp._id },
    { $set: { pendingCompRevision: {
      newSalaryEnc:  newEnc,
      incrementPct:  rev.incrementPct,
      promotion:     rev.promotion,
      proposedTitle: rev.proposedTitle,
      proposedBand:  rev.proposedBand,
      currencyCode:  emp.currencyCode,
      effectiveDate,
      reviewId:      rev.reviewId,
      decidedById:   rev.decidedById,
    } } },
  );
  return { applied: false };
}

/**
 * Sweep all employees in the current tenant context whose staged revision is due
 * and apply them.  Returns the number applied.  Safe to call repeatedly.
 */
export async function applyDueCompRevisions(tenantId: string): Promise<number> {
  const due = await WorkspaceEmployee.find({
    'pendingCompRevision.effectiveDate': { $lte: new Date() },
    'pendingCompRevision.newSalaryEnc':  { $exists: true },
  }).select('baseSalaryEnc salaryBand jobTitle currencyCode employeeCode pendingCompRevision');

  let applied = 0;
  for (const emp of due) {
    const pr = emp.pendingCompRevision;
    if (!pr || !pr.effectiveDate) continue;

    await applyRevisionNow(tenantId, emp, {
      incrementPct:  pr.incrementPct ?? 0,
      promotion:     !!pr.promotion,
      proposedTitle: pr.proposedTitle,
      proposedBand:  pr.proposedBand,
      reviewId:      pr.reviewId as mongoose.Types.ObjectId,
      decidedById:   pr.decidedById as mongoose.Types.ObjectId,
    }, pr.effectiveDate);

    applied++;
  }
  return applied;
}
