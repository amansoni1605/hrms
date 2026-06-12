import { NextRequest, NextResponse } from 'next/server';
import { runWithSession, auditEvent } from '@/lib/withRoute';
import { Tenant, WorkspaceModels }    from '@/models/workspace.models';
import { createHash }                 from 'node:crypto';
import mongoose                       from 'mongoose';

const ALLOWED_PROFILE_FIELDS = new Set([
  'displayName', 'industry', 'companySize', 'websiteUrl', 'billingEmail',
  'phone', 'foundedYear', 'loginTagline', 'brandColor',
  'registeredAddress', 'setupComplete', 'setupStep',
]);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ws/tenants/[id]
//   Returns full tenant detail.  Super-admin, OR hr_admin for their own tenant.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return runWithSession(async (session) => {
    const isSuperAdmin = session.role === 'super_admin';
    if (!isSuperAdmin && session.tenantId !== id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const tenant = await Tenant.findById(id).lean();
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    // Never return raw logoData in list views — only in this detail route
    return NextResponse.json({ data: tenant });
  }, ['super_admin', 'hr_admin', 'hr_manager']);
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/ws/tenants/[id]
//   Updates branding/profile/setup-wizard fields.
//   Super-admin can patch any tenant.  hr_admin can only patch their own.
// ─────────────────────────────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return runWithSession(async (session) => {
    const isSuperAdmin = session.role === 'super_admin';
    if (!isSuperAdmin && session.tenantId !== id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json() as Record<string, unknown>;

    // Super admin may also toggle isActive and edit subscription/ztPolicy/kmsConfig
    const SUPER_ADMIN_EXTRA = new Set(['isActive', 'subscription', 'ztPolicy', 'kmsConfig']);
    const allowedFields = isSuperAdmin
      ? new Set([...ALLOWED_PROFILE_FIELDS, ...SUPER_ADMIN_EXTRA])
      : ALLOWED_PROFILE_FIELDS;

    // Whitelist — only allow declared fields
    const $set: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      if (allowedFields.has(k)) $set[k] = v;
    }

    if (Object.keys($set).length === 0) {
      return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 });
    }

    const updated = await Tenant.findByIdAndUpdate(id, { $set }, { new: true, runValidators: true }).lean();
    if (!updated) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    await auditEvent({
      actionType:       'TENANT_UPDATED',
      targetCollection: 'tenants',
      targetDocumentId: id,
      newStateHash:     createHash('sha256').update(id + JSON.stringify(Object.keys($set))).digest('hex'),
      changeSummary:    { updatedFields: Object.keys($set), updatedBy: session.userId },
    });

    return NextResponse.json({ data: updated });
  }, ['super_admin', 'hr_admin']);
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/ws/tenants/[id]
//   Hard-deletes the tenant and every workspace document that belongs to it.
//   AuditTrail records are retained for compliance.
//   Caller must send { confirmSlug: "<slug>" } in the body — must match the
//   tenant's actual slug to prevent accidental deletion.
//   SUPER_ADMIN only.
// ─────────────────────────────────────────────────────────────────────────────

// These collections are scoped to tenantId and should be wiped on tenant deletion.
const TENANT_SCOPED_MODELS = [
  'User', 'Department', 'Employee', 'LeaveRequest', 'LeaveBalance',
  'PayrollRun', 'CommsTemplate', 'NotifLog', 'PulseTelemetry', 'Attendance',
  'InAppNotification', 'UserSettings', 'PerformanceReview', 'CompensationHistory',
  'Goal', 'ShiftType', 'ExpenseClaim', 'JobOpening', 'JobApplicant',
  'TrainingProgram', 'Separation', 'HRSettings', 'Onboarding',
] as const;

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return runWithSession(async (session) => {
    const body = await req.json().catch(() => ({})) as { confirmSlug?: string };

    const tenant = await Tenant.findById(id).select('slug legalName').lean();
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    if (!body.confirmSlug || body.confirmSlug !== tenant.slug) {
      return NextResponse.json(
        { error: `Confirm deletion by sending confirmSlug: "${tenant.slug}"` },
        { status: 400 },
      );
    }

    const tenantOid = new mongoose.Types.ObjectId(id);

    // Delete every tenant-scoped collection (bypass isolation plugin — we are
    // explicitly scoping by tenantId; plugin would require a session tenantId).
    for (const key of TENANT_SCOPED_MODELS) {
      const model = WorkspaceModels[key] as any;
      if (!model?.deleteMany) continue;
      const q = model.deleteMany({ tenantId: tenantOid });
      q._bypassTenantPlugin = true;
      await q;
    }

    // Remove the tenant document itself
    await Tenant.findByIdAndDelete(id);

    // Audit — kept in the global audit trail even after tenant deletion
    await auditEvent({
      actionType:       'TENANT_DELETED',
      targetCollection: 'tenants',
      targetDocumentId: id,
      newStateHash:     createHash('sha256').update(id + tenant.slug).digest('hex'),
      changeSummary:    {
        slug:        tenant.slug,
        legalName:   (tenant as any).legalName,
        deletedBy:   session.userId,
      },
    });

    return NextResponse.json({ data: { deleted: true, slug: tenant.slug } });
  }, ['super_admin']);
}
