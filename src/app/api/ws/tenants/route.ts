import { NextResponse }     from 'next/server';
import { withRoute, auditEvent } from '@/lib/withRoute';
import { Tenant, WorkspaceEmployee, WorkspaceUser } from '@/models/workspace.models';
import { TenantContext }    from '@/infrastructure/multiTenantCore';
import { sendWelcomeEmail } from '@/lib/mailer';
import { createHash }       from 'node:crypto';
import crypto               from 'node:crypto';
import mongoose             from 'mongoose';
import bcrypt               from 'bcryptjs';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ws/tenants
//
// Returns every Tenant document for the platform.  Used by the Super Admin
// Tenants directory.  Augments each tenant with the live ws_employees count
// (since subscription.usedSeats can drift if employees are added outside
// the seat-management API).
//
// Tenants are a GLOBAL collection so the isolation plugin skips them.
// SUPER_ADMIN only — explicit role gate, no tenant-scoped filtering.
// ─────────────────────────────────────────────────────────────────────────────

export const GET = withRoute(async () => {
  const tenants = await Tenant.find({}).lean();

  // Compute live headcount per tenant
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aggQuery = (WorkspaceEmployee as any).aggregate([
    { $match: { isActive: true } },
    { $group: { _id: '$tenantId', headcount: { $sum: 1 } } },
  ]);
  aggQuery._bypassTenantPlugin = true;
  const counts = await aggQuery as Array<{ _id: mongoose.Types.ObjectId; headcount: number }>;

  const headcountByTenant = new Map(counts.map((c) => [c._id.toString(), c.headcount]));

  const enriched = tenants.map((t) => ({
    _id:              t._id,
    slug:             t.slug,
    legalName:        t.legalName,
    displayName:      t.displayName,
    primaryCountry:   t.primaryCountry,
    primaryCurrency:  t.primaryCurrency,
    subscription:     t.subscription,
    kmsProvider:      t.kmsConfig?.provider,
    kmsRotationCycle: t.kmsConfig?.rotationCycle ?? 0,
    ztPolicy:         t.ztPolicy,
    isActive:         t.isActive,
    setupComplete:    t.setupComplete ?? false,
    setupStep:        t.setupStep ?? 1,
    logoData:         t.logoData,
    brandColor:       t.brandColor,
    liveHeadcount:    headcountByTenant.get((t._id as mongoose.Types.ObjectId).toString()) ?? 0,
    createdAt:        (t as unknown as { createdAt: Date }).createdAt,
  }));

  return NextResponse.json({ data: enriched });
}, ['super_admin']);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ws/tenants
//
// Provisions a new tenant.  SUPER_ADMIN only.
// DEK is generated lazily on first employee encryption call — no action needed here.
// ─────────────────────────────────────────────────────────────────────────────

export const POST = withRoute(async (req, session) => {
  const body = await req.json() as {
    slug?:            string;
    legalName?:       string;
    primaryCountry?:  string;
    primaryCurrency?: string;
    kmsProvider?:     string;
    tier?:            string;
    maxSeats?:        number;
    deviceComplianceRequired?:  boolean;
    autoRevokeOnNonCompliance?: boolean;
    hrAdminEmail?:    string;
    hrAdminName?:     string;
  };

  const { slug, legalName, primaryCountry } = body;
  if (!slug || !legalName || !primaryCountry) {
    return NextResponse.json({ error: 'slug, legalName, and primaryCountry are required' }, { status: 400 });
  }
  if (!body.hrAdminEmail) {
    return NextResponse.json({ error: 'hrAdminEmail is required to create the first HR admin account' }, { status: 400 });
  }

  const existing = await Tenant.findOne({ slug });
  if (existing) {
    return NextResponse.json({ error: `Slug "${slug}" is already taken` }, { status: 409 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenant = await (Tenant as any).create({
    slug,
    legalName,
    primaryCountry:  body.primaryCountry,
    primaryCurrency: body.primaryCurrency ?? 'USD',
    kmsConfig: {
      provider:    body.kmsProvider ?? 'local',
      masterKeyId: body.kmsProvider === 'local' ? 'local-dev-key' : '',
      keyAltName:  `${slug}-dek-v1`,
    },
    subscription: {
      tier:     body.tier ?? 'starter',
      maxSeats: body.maxSeats ?? 100,
      usedSeats: 0,
    },
    ztPolicy: {
      deviceComplianceRequired:  body.deviceComplianceRequired  ?? true,
      heartbeatIntervalSeconds:  300,
      autoRevokeOnNonCompliance: body.autoRevokeOnNonCompliance ?? true,
    },
    isActive:      true,
    setupComplete: false,
    setupStep:     1,
  });

  const tenantId = (tenant._id as mongoose.Types.ObjectId);

  // ── Create the first HR admin user account ────────────────────────────────
  // The ALS store currently holds the super_admin's tenantId.  The isolation
  // plugin's pre('save') hook validates that the document's tenantId matches
  // the ALS context, so we must switch context to the newly-created tenant
  // before calling create() on WorkspaceUser.
  const tempPassword = `Welcome@${Math.floor(1000 + Math.random() * 9000)}`;
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  const newTenantStore = {
    tenantId,
    userId:      new mongoose.Types.ObjectId(session.userId),
    userRole:    'super_admin' as const,
    employeeId:  null,
    deviceTrust: 'trusted' as const,
    requestId:   crypto.randomUUID(),
    createdAt:   new Date(),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminUser = await TenantContext.run(newTenantStore, () =>
    (WorkspaceUser as any).create({
      tenantId,
      name:         body.hrAdminName ?? 'HR Admin',
      email:        String(body.hrAdminEmail).toLowerCase().trim(),
      passwordHash,
      role:         'hr_admin',
      isActive:     true,
    })
  ) as { _id: mongoose.Types.ObjectId };

  // Fire-and-forget — never blocks the response. Fails silently in dev (no SMTP).
  void sendWelcomeEmail({
    to:           String(body.hrAdminEmail).toLowerCase().trim(),
    employeeName: body.hrAdminName ?? 'HR Admin',
    tempPassword,
    companyName:  legalName,
  });

  await auditEvent({
    actionType:       'INSERT',
    targetCollection: 'tenants',
    targetDocumentId: tenantId.toString(),
    newStateHash:     createHash('sha256').update(slug + legalName).digest('hex'),
    changeSummary:    { slug, legalName, hrAdminEmail: body.hrAdminEmail, action: 'tenant_created' },
  });

  return NextResponse.json({
    data: {
      tenant,
      hrAdmin: {
        userId:        adminUser._id,
        email:         body.hrAdminEmail,
        tempPassword,  // shown once — super admin shares this with the client
        setupUrl:      `/onboard`,
        message:       `HR admin account created. Share credentials: ${body.hrAdminEmail} / ${tempPassword}`,
      },
    },
  }, { status: 201 });
}, ['super_admin']);
