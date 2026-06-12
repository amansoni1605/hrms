import { NextResponse }            from 'next/server';
import { withRoute, auditEvent }    from '@/lib/withRoute';
import { TenantContext }            from '@/infrastructure/multiTenantCore';
import { applyDueCompRevisions }    from '@/lib/compensation';
import { createHash }               from 'node:crypto';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/performance/comp/apply-due
//
// Applies every staged compensation revision whose effective date has arrived.
// Invoked automatically at the start of each payroll run; can also be triggered
// manually (or by a cron) so raises go live on their effective date.
// ─────────────────────────────────────────────────────────────────────────────

export const POST = withRoute(async (_req, session) => {
  const ctx     = TenantContext.requireStore('POST /api/performance/comp/apply-due');
  const applied = await applyDueCompRevisions(ctx.tenantId.toString());

  if (applied > 0) {
    await auditEvent({
      actionType:       'COMP_REVISIONS_APPLIED',
      targetCollection: 'ws_employees',
      newStateHash:     createHash('sha256').update(`apply-due:${ctx.tenantId}:${Date.now()}`).digest('hex'),
      changeSummary:    { applied, triggeredBy: session.userId },
    });
  }

  return NextResponse.json({ data: { applied } });
}, ['super_admin', 'hr_admin', 'payroll_officer']);
