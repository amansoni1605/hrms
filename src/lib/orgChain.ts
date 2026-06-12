/**
 * Reporting-chain utilities.
 *
 * The people hierarchy is a singly-linked list of `employee.managerId` pointers.
 * These helpers walk it upward (with a depth cap + cycle guard) so PMS can tell
 * a DIRECT manager from a SKIP-LEVEL (2nd-line) manager and route two-step
 * compensation approvals to the right people.
 */

import { WorkspaceEmployee } from '@/models/workspace.models';
import mongoose              from 'mongoose';

export type RecommenderRelationship = 'direct' | 'skip_level' | 'higher' | 'not_in_chain';

/** Increment % above which a raise needs two-step approval (promotions always do). */
export const TWO_STEP_INCREMENT_THRESHOLD = 10;

/**
 * Ordered list of an employee's managers, nearest first:
 *   [0] = direct manager, [1] = skip-level manager, [2] = their manager, …
 * Stops at the top of the chain, a missing manager, the depth cap, or a cycle.
 */
export async function getManagementChain(
  employeeId: mongoose.Types.ObjectId | string,
  maxDepth = 10,
): Promise<mongoose.Types.ObjectId[]> {
  const chain: mongoose.Types.ObjectId[] = [];
  const seen  = new Set<string>([employeeId.toString()]);
  let current: mongoose.Types.ObjectId | string = employeeId;

  for (let i = 0; i < maxDepth; i++) {
    const emp = await WorkspaceEmployee.findById(current).select('managerId').lean();
    const mgr = emp?.managerId as mongoose.Types.ObjectId | undefined;
    if (!mgr) break;
    const key = mgr.toString();
    if (seen.has(key)) break;          // cycle guard — never loop
    seen.add(key);
    chain.push(mgr);
    current = mgr;
  }
  return chain;
}

/** Where a recommender sits in an employee's chain. */
export function relationshipOf(
  chain: mongoose.Types.ObjectId[],
  recommenderEmpId?: mongoose.Types.ObjectId | null,
): RecommenderRelationship {
  if (!recommenderEmpId) return 'not_in_chain';
  const idx = chain.findIndex((id) => id.toString() === recommenderEmpId.toString());
  if (idx === 0) return 'direct';
  if (idx === 1) return 'skip_level';
  if (idx > 1)   return 'higher';
  return 'not_in_chain';
}

/** Whether a recommendation needs two-step (skip-level + HR) approval. */
export function needsTwoStep(promotion: boolean, incrementPct: number): boolean {
  return promotion || incrementPct > TWO_STEP_INCREMENT_THRESHOLD;
}
