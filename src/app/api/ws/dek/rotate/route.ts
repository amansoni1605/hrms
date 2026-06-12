import { NextRequest, NextResponse }     from 'next/server';
import { withRoute, auditEvent }         from '@/lib/withRoute';
import {
  rotateTenantDEK,
  invalidateTenantDEK,
  getTenantDEK,
  TenantContext,
}                                         from '@/infrastructure/multiTenantCore';
import { createHash }                     from 'node:crypto';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ws/dek/rotate
//
// Triggers a DEK rotation for the caller's tenant.
//
// Workflow:
//   1. Capture the OLD DEK + rotationCycle (for the re-encryption pipeline)
//   2. Generate fresh 32-byte plaintext DEK
//   3. Wrap with the tenant's master key (via KMS provider)
//   4. Persist wrappedDek + bump rotationCycle on the Tenant document
//   5. Invalidate the LRU cache for this tenant
//   6. Write an audit event
//
// Re-encryption of existing encrypted fields is queued separately to
// workers/dekRotator.ts which streams through ws_employees and re-encrypts
// every *Enc field using the OLD key → NEW key sequence.  This endpoint
// only initiates the rotation; the worker handles the bulk re-encryption.
//
// SUPER_ADMIN only.
// ─────────────────────────────────────────────────────────────────────────────

export const POST = withRoute(async (req) => {
  const ctx       = TenantContext.requireStore('POST /api/ws/dek/rotate');
  const tenantId  = ctx.tenantId.toString();
  const body      = await req.json().catch(() => ({})) as { confirm?: string };

  // Safety guard — require explicit confirmation
  if (body.confirm !== 'ROTATE') {
    return NextResponse.json({
      error: 'Confirmation required. Pass { "confirm": "ROTATE" } in the body.',
      hint:  'This operation rotates the tenant DEK. Existing encrypted fields will need re-encryption by the background worker.',
    }, { status: 400 });
  }

  // Snapshot the current state (for audit & worker hand-off)
  const oldState = await getTenantDEK(tenantId);

  // Rotate
  const { oldEntry, newEntry } = await rotateTenantDEK(tenantId);

  // Ensure cache is clean
  invalidateTenantDEK(tenantId);

  // Audit
  await auditEvent({
    actionType:       'DEK_ROTATION',
    targetCollection: 'tenants',
    targetDocumentId: tenantId,
    newStateHash:     createHash('sha256')
      .update(`${tenantId}:dek-rotation:${newEntry.rotationCycle}:${Date.now()}`)
      .digest('hex'),
    changeSummary: {
      tenantId,
      previousCycle:  oldEntry.rotationCycle,
      newCycle:       newEntry.rotationCycle,
      rotatedAt:      newEntry.generatedAt,
    },
  });

  return NextResponse.json({
    data: {
      tenantId,
      previousCycle:    oldEntry.rotationCycle,
      newCycle:         newEntry.rotationCycle,
      rotatedAt:        newEntry.generatedAt,
      reencryptionStatus: 'queued',
      message:
        'DEK rotation complete. Background re-encryption of *Enc fields ' +
        'across ws_employees, ws_payroll_runs, and ws_notification_logs ' +
        'will run asynchronously. Existing in-flight requests continue ' +
        'using the cached old key until cache TTL expires.',
    },
  });
}, ['super_admin']);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ws/dek/rotate  — returns current rotation cycle + history
// ─────────────────────────────────────────────────────────────────────────────

export const GET = withRoute(async () => {
  const ctx      = TenantContext.requireStore('GET /api/ws/dek/rotate');
  const tenantId = ctx.tenantId.toString();
  const dek      = await getTenantDEK(tenantId);

  return NextResponse.json({
    data: {
      tenantId,
      currentCycle:    dek.rotationCycle,
      lastGeneratedAt: dek.generatedAt,
      masterKeyId:     dek.masterKeyId,
      // Plaintext DEK is NEVER returned to the client
      wrappedDekLength: dek.wrappedDEK.byteLength,
    },
  });
}, ['super_admin']);
