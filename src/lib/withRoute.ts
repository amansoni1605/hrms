/**
 * withRoute / runWithSession
 *
 * Central security gateway for every Next.js App Router API handler.
 * Every route that touches MongoDB MUST go through one of these wrappers so that:
 *  1. JWT session is validated
 *  2. tenantId is confirmed present
 *  3. TenantContext.run() binds the ALS store BEFORE any Mongoose operation
 *  4. The Mongoose global plugin can inject { tenantId } into every query
 *
 * Usage — static routes (no URL params):
 *   export const GET = withRoute(async (req, session) => { ... });
 *
 * Usage — dynamic routes (URL params):
 *   export async function GET(req, { params }) {
 *     const { id } = await params;
 *     return runWithSession(async (session) => {
 *       const emp = await WorkspaceEmployee.findById(id);
 *       return NextResponse.json({ data: emp });
 *     });
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHmac }                from 'node:crypto';
import { getSession, type SessionPayload } from './auth';
import { connectDB }                 from './mongodb';
import {
  withTenantContext,
  getTenantDEK,
  TenantContext,
  type UserRole,
}                                    from '@/infrastructure/multiTenantCore';
import {
  WorkspaceAuditTrail,
  type IWAuditModel,
  type IWAudit,
}                                    from '@/models/workspace.models';
import mongoose                      from 'mongoose';

// ─────────────────────────────────────────────────────────────────────────────
// Internal context builder
// ─────────────────────────────────────────────────────────────────────────────

function buildStore(session: SessionPayload) {
  if (!session.tenantId) throw new Error('SESSION_NO_TENANT: tenantId missing from session');
  if (!session.userId)   throw new Error('SESSION_NO_USER: userId missing from session');

  return {
    tenantId:    new mongoose.Types.ObjectId(session.tenantId),
    userId:      new mongoose.Types.ObjectId(session.userId),
    userRole:    session.role as UserRole,
    employeeId:  session.employeeId ? new mongoose.Types.ObjectId(session.employeeId) : null,
    deviceTrust: 'trusted' as const,
    requestId:   crypto.randomUUID(),
    createdAt:   new Date(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// runWithSession — use inside dynamic routes that need URL params
// ─────────────────────────────────────────────────────────────────────────────

export async function runWithSession(
  handler:       (session: SessionPayload) => Promise<NextResponse>,
  requiredRoles?: UserRole[],
): Promise<NextResponse> {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

    if (requiredRoles && !requiredRoles.includes(session.role as UserRole)) {
      return NextResponse.json({ error: 'FORBIDDEN', requiredRoles }, { status: 403 });
    }

    const store = buildStore(session);
    await connectDB();

    return await TenantContext.run(store, () => handler(session));
  } catch (err) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err) ?? 'Internal error';
    if (msg.startsWith('SESSION_NO_TENANT')) {
      return NextResponse.json({ error: 'No tenant context. Re-seed database and log in again.' }, { status: 403 });
    }
    console.error('[withRoute]', err instanceof Error ? err.stack : err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// withRoute — HOF wrapper for static routes (no URL params)
// ─────────────────────────────────────────────────────────────────────────────

type StaticHandler = (req: NextRequest, session: SessionPayload) => Promise<NextResponse>;

export function withRoute(handler: StaticHandler, requiredRoles?: UserRole[]) {
  return (req: NextRequest) =>
    runWithSession((session) => handler(req, session), requiredRoles);
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit helper — appends to WorkspaceAuditTrail within active TenantContext
// ─────────────────────────────────────────────────────────────────────────────

export async function auditEvent(event: {
  actionType:        string;
  targetCollection:  string;
  targetDocumentId?: string;
  modifiedPaths?:    string[];
  oldStateHash?:     string;
  newStateHash:      string;
  changeSummary?:    Record<string, unknown>;
}): Promise<void> {
  try {
    const ctx = TenantContext.getStore();
    if (!ctx) return; // Silently skip if no context (e.g., during bootstrap)

    const { key } = await getTenantDEK(ctx.tenantId.toString());
    const auditKey = createHmac('sha256', key).update('audit-chain-key-v1').digest('hex');

    await (WorkspaceAuditTrail as IWAuditModel).appendEvent({
      tenantId:         ctx.tenantId,
      actorId:          ctx.employeeId ?? undefined,
      actorRole:        ctx.userRole,
      actorTrustLevel:  ctx.deviceTrust,
      actionType:       event.actionType,
      targetCollection: event.targetCollection,
      targetDocumentId: event.targetDocumentId ? new mongoose.Types.ObjectId(event.targetDocumentId) : undefined,
      modifiedPaths:    event.modifiedPaths,
      oldStateHash:     event.oldStateHash,
      newStateHash:     event.newStateHash,
      changeSummary:    event.changeSummary,
      auditKey,
    });
  } catch {
    // Never let audit failures break the primary operation
  }
}
