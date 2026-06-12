import { NextResponse }                from 'next/server';
import { withRoute }                    from '@/lib/withRoute';
import {
  WorkspaceEmployee, WorkspaceDepartment,
  WorkspacePerformanceReview, WorkspaceCompensationHistory,
  WorkspaceUser,
}                                       from '@/models/workspace.models';
import { TenantContext, decryptField, decryptNumber } from '@/infrastructure/multiTenantCore';
import mongoose                         from 'mongoose';

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/me/profile
//
// Updates the caller's WorkspaceUser account — name, phone, designation.
// Used by the onboarding wizard (Step 3) so the HR admin can personalise
// their account before the tenant goes live.
// ─────────────────────────────────────────────────────────────────────────────

export const PATCH = withRoute(async (req, session) => {
  const body = await req.json() as { name?: string; phone?: string; designation?: string };

  const update: Record<string, string> = {};
  if (body.name?.trim())        update['name']        = body.name.trim();
  if (body.phone?.trim())       update['phone']       = body.phone.trim();
  if (body.designation?.trim()) update['designation'] = body.designation.trim();

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true, message: 'Nothing to update' });
  }

  const upd = (WorkspaceUser as any).updateOne(
    { _id: new mongoose.Types.ObjectId(session.userId) },
    { $set: update },
  );
  upd._bypassTenantPlugin = true;
  await upd;

  return NextResponse.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/me/profile
//
// A single, curated view of EVERYTHING the authenticated employee can see about
// themselves.  Unlike /api/me (which returns the raw lean doc, *Enc buffers and
// all), this endpoint decrypts the employee's own PII + base salary and strips
// every encrypted Buffer before responding.
// ─────────────────────────────────────────────────────────────────────────────

export const GET = withRoute(async (_req, session) => {
  if (!session.employeeId) {
    return NextResponse.json({ error: 'No employee record linked to this account' }, { status: 404 });
  }

  const ctx      = TenantContext.requireStore('GET /api/me/profile');
  const tenantId = ctx.tenantId.toString();
  const empOid   = new mongoose.Types.ObjectId(session.employeeId);

  const emp = await WorkspaceEmployee.findById(empOid).lean();
  if (!emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

  // Decrypt the employee's own protected fields (best-effort; never leak buffers).
  const reveal: Record<string, string | number | null> = {};
  const tryDec = async (label: string, buf: unknown, isNum = false) => {
    try {
      if (!buf) { reveal[label] = null; return; }
      reveal[label] = isNum
        ? await decryptNumber(tenantId, buf as Buffer)
        : await decryptField(tenantId, buf as Buffer);
    } catch { reveal[label] = null; }
  };
  await Promise.all([
    tryDec('fullName',    emp.fullNameEnc),
    tryDec('email',       emp.emailEnc),
    tryDec('phone',       (emp as { phoneEnc?: Buffer }).phoneEnc),
    tryDec('baseSalary',  emp.baseSalaryEnc, true),
  ]);

  // Manager name (denormalised lookup, non-sensitive)
  let managerName: string | null = null;
  if (emp.managerId) {
    const mgr = await WorkspaceEmployee.findById(emp.managerId).select('employeeCode jobTitle').lean();
    managerName = mgr ? `${mgr.employeeCode}${mgr.jobTitle ? ` · ${mgr.jobTitle}` : ''}` : null;
  }

  const dept = emp.departmentId
    ? await WorkspaceDepartment.findById(emp.departmentId).select('name code costCenterCode').lean()
    : null;

  // Latest review + compensation history (own records)
  const [reviews, compHistRaw] = await Promise.all([
    WorkspacePerformanceReview.find({ employeeId: empOid, isActive: true })
      .select('cycleLabel status overallRating periodStart periodEnd compensation.decision')
      .sort({ createdAt: -1 }).limit(5).lean(),
    WorkspaceCompensationHistory.find({ employeeId: empOid })
      .sort({ effectiveDate: -1 }).limit(10).lean(),
  ]);

  // Decrypt own comp-history amounts; strip the encrypted buffers.
  const compHistory = await Promise.all(compHistRaw.map(async (h) => ({
    _id:           h._id,
    cycleLabel:    h.cycleLabel,
    changeType:    h.changeType,
    currencyCode:  h.currencyCode,
    incrementPct:  h.incrementPct,
    promotion:     h.promotion,
    oldTitle:      h.oldTitle,  newTitle: h.newTitle,
    oldBand:       h.oldBand,   newBand:  h.newBand,
    effectiveDate: h.effectiveDate,
    oldSalary:     await decryptNumber(tenantId, h.oldSalaryEnc).catch(() => null),
    newSalary:     await decryptNumber(tenantId, h.newSalaryEnc).catch(() => null),
  })));

  const hireDate = emp.hireDate ? new Date(emp.hireDate) : null;
  const tenureYears = hireDate ? +(((Date.now() - hireDate.getTime()) / (365.25 * 86_400_000))).toFixed(1) : null;

  // Build a clean payload — explicitly list non-encrypted fields (no *Enc leaks).
  return NextResponse.json({
    data: {
      identity: {
        fullName:     reveal['fullName'] ?? session.name,
        email:        reveal['email'] ?? session.email,
        phone:        reveal['phone'] ?? null,
        employeeCode: emp.employeeCode,
      },
      employment: {
        jobTitle:       emp.jobTitle,
        departmentName: emp.departmentName,
        departmentCode: emp.departmentCode,
        costCenterCode: dept?.costCenterCode ?? null,
        managerName,
        employeeStatus: emp.employeeStatus,
        employmentType: emp.employmentType,
        salaryBand:     emp.salaryBand ?? null,
        hireDate:       emp.hireDate ?? null,
        tenureYears,
        countryCode:    emp.countryCode,
        timezone:       emp.timezone,
        locale:         emp.locale,
      },
      compensation: {
        baseSalary:   reveal['baseSalary'],
        currencyCode: emp.currencyCode,
        payFrequency: emp.payFrequency,
      },
      skills:            emp.skills ?? [],
      provisionedAssets: (emp.provisionedAssets ?? []).map((a) => ({
        assetCategory: a.assetCategory, provider: a.provider, state: a.state,
      })),
      vestingSchedules: (emp.vestingSchedules ?? []).map((v) => ({
        grantId: v.grantId, grantType: v.grantType, totalUnits: v.totalUnits,
        vestedUnits: v.vestedUnits, unvestedUnits: v.unvestedUnits, status: v.status,
      })),
      immigrationRecords: (emp.immigrationRecords ?? []).map((im) => ({
        documentType: im.documentType, hostCountry: im.hostCountry,
        expiresAt: im.expiresAt, nexusRiskLevel: im.nexusRiskLevel, status: im.status,
      })),
      wellbeing: {
        burnoutRiskScore: emp.burnoutRiskScore,
        flightRiskScore:  emp.flightRiskScore,
        engagementPct:    emp.engagementPct ?? null,
      },
      device: {
        trustLevel:       (emp.deviceTrustState as { trustLevel?: string })?.trustLevel ?? null,
        complianceScore:  (emp.deviceTrustState as { complianceScore?: number })?.complianceScore ?? null,
      },
      identityVerification: {
        verificationStatus: (emp.identityVerification as { verificationStatus?: string })?.verificationStatus ?? null,
        livenessCheckPassed: (emp.identityVerification as { livenessCheckPassed?: boolean })?.livenessCheckPassed ?? null,
      },
      reviews,
      compHistory,
    },
  });
});
