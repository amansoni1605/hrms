import { NextRequest, NextResponse }     from 'next/server';
import { runWithSession, auditEvent }    from '@/lib/withRoute';
import { WorkspaceEmployee, WorkspaceLeaveRequest } from '@/models/workspace.models';
import { decryptField, TenantContext }   from '@/infrastructure/multiTenantCore';
import { createHash }                    from 'node:crypto';
import mongoose                          from 'mongoose';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ws/employees/[id]
//
// Returns full employee record with role-aware PII decryption:
//   • super_admin / hr_admin / hr_manager  → decrypts fullName + email + phone
//   • payroll_officer                      → decrypts fullName + email + bank fields
//   • compliance_officer / finance_auditor → decrypts fullName + email (read-only)
//   • employee (self only)                 → decrypts all own fields
//   • other roles                          → encrypted-aware (returns *Hash, hides *Enc)
//
// Includes recent leaves, vesting summary, and immigration alerts.
// ─────────────────────────────────────────────────────────────────────────────

const HR_ROLES = new Set([
  'super_admin', 'hr_admin', 'hr_manager', 'payroll_officer',
  'finance_auditor', 'compliance_officer',
]);

const FULL_DECRYPT_ROLES = new Set([
  'super_admin', 'hr_admin', 'hr_manager', 'payroll_officer',
]);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return runWithSession(async (session) => {
    const ctx = TenantContext.requireStore('GET /api/ws/employees/[id]');

    // Self-read shortcut: employees may read their own document only
    const isSelf = session.employeeId === id;
    if (!isSelf && !HR_ROLES.has(session.role)) {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
    }

    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: 'Invalid employee id' }, { status: 400 });
    }

    const emp = await WorkspaceEmployee.findById(id).lean();
    if (!emp) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }

    // Recent leaves (last 12)
    const leaves = await WorkspaceLeaveRequest.find({ employeeId: emp._id })
      .sort({ createdAt: -1 })
      .limit(12)
      .lean();

    // Decrypt PII based on role
    const tenantId = ctx.tenantId.toString();
    const reveal: Record<string, string | null> = {
      fullName:    null,
      email:       null,
      phone:       null,
      bankAccount: null,
      baseSalary:  null,
    };

    if (isSelf || FULL_DECRYPT_ROLES.has(session.role)) {
      try {
        if (emp.fullNameEnc) reveal['fullName'] = await decryptField(tenantId, emp.fullNameEnc);
        if (emp.emailEnc)    reveal['email']    = await decryptField(tenantId, emp.emailEnc);
        if (emp.phoneEnc)    reveal['phone']    = await decryptField(tenantId, emp.phoneEnc);
      } catch (decryptErr) {
        console.error('[GET /api/ws/employees/[id]] decrypt failed:', decryptErr);
        // silently fall through — encryption failures must not leak details to client
      }
    }
    if ((isSelf || session.role === 'payroll_officer') && emp.bankAccountEnc) {
      try {
        const acct = await decryptField(tenantId, emp.bankAccountEnc);
        reveal['bankAccount'] = `•••• ${acct.slice(-4)}`;
      } catch { /* no-op */ }
    }

    const PAYROLL_ROLES = new Set(['super_admin', 'hr_admin', 'payroll_officer', 'finance_auditor']);
    if (PAYROLL_ROLES.has(session.role) && (emp as unknown as Record<string, unknown>)['baseSalaryEnc']) {
      try {
        const { decryptNumber } = await import('@/infrastructure/multiTenantCore');
        const salary = await decryptNumber(tenantId, (emp as unknown as Record<string, unknown>)['baseSalaryEnc'] as Buffer);
        reveal['baseSalary'] = String(Math.round(salary));
      } catch { /* no-op */ }
    }

    // toJSON-style strip of *Enc fields before returning
    const sanitized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(emp)) {
      if (!k.endsWith('Enc')) sanitized[k] = v;
    }

    // Immigration alerts (≤90 days to expiry)
    const immigrationAlerts = (emp.immigrationRecords ?? [])
      .filter((r) => r.status === 'active' &&
                     new Date(r.expiresAt).getTime() <= Date.now() + 90 * 86_400_000)
      .map((r) => ({
        documentType: r.documentType,
        hostCountry:  r.hostCountry,
        expiresAt:    r.expiresAt,
        daysUntilExpiry: Math.ceil((new Date(r.expiresAt).getTime() - Date.now()) / 86_400_000),
        nexusRiskLevel: r.nexusRiskLevel,
      }));

    return NextResponse.json({
      data: {
        ...sanitized,
        reveal,
        immigrationAlerts,
      },
      leaves,
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/ws/employees/[id]
//
// HR roles only.  Allows updating non-encrypted operational fields:
//   jobTitle, departmentId/Name/Code, managerId/Name, employeeStatus,
//   employmentType, timezone, locale, salaryBand, payFrequency,
//   probationEndDate, nextReviewDate
//
// Compensation fields (baseSalaryEnc / bankAccountEnc / vestingSchedules)
// are blocked by the `compGuard` schema hook — must route through
// /api/v3/payroll/compensation-change.
// ─────────────────────────────────────────────────────────────────────────────

const MUTABLE_FIELDS = new Set([
  'jobTitle', 'departmentId', 'departmentName', 'departmentCode',
  'managerId', 'managerName',
  'employeeStatus', 'employmentType',
  'timezone', 'locale', 'salaryBand', 'payFrequency',
  'probationEndDate', 'nextReviewDate', 'lastPromotionDate',
  'countryCode',
  // Embedded arrays (skills, assets) — HR can update directly
  'skills', 'provisionedAssets',
  // Emergency contact (not encrypted by policy — it's next-of-kin, not PII)
  'emergencyContact',
  // Per-employee sidebar visibility overrides managed by HR
  'hiddenTabs',
]);

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return runWithSession(async (session) => {
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: 'Invalid employee id' }, { status: 400 });
    }

    const isSelf = session.employeeId === id;
    const isHR   = HR_ROLES.has(session.role);
    if (!isSelf && !isHR) {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
    }

    const body  = await req.json().catch(() => ({}));
    const $set: Record<string, unknown> = {};
    // Employees can only update their own emergency contact
    const allowedKeys = isSelf && !isHR ? new Set(['emergencyContact']) : MUTABLE_FIELDS;
    for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
      if (allowedKeys.has(k)) $set[k] = v;
    }

    if (Object.keys($set).length === 0) {
      return NextResponse.json({ error: 'No mutable fields supplied' }, { status: 400 });
    }

    const emp = await WorkspaceEmployee.findByIdAndUpdate(id, { $set }, { new: true });
    if (!emp) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }

    await auditEvent({
      actionType:       Object.prototype.hasOwnProperty.call($set, 'employeeStatus')
                          ? 'STATUS_CHANGE' : 'UPDATE',
      targetCollection: 'ws_employees',
      targetDocumentId: id,
      modifiedPaths:    Object.keys($set),
      newStateHash:     createHash('sha256')
                          .update(`${id}:${JSON.stringify($set)}:${Date.now()}`)
                          .digest('hex'),
      changeSummary:    { fields: Object.keys($set), updatedBy: session.userId },
    });

    return NextResponse.json({
      data: {
        _id:           emp._id,
        employeeCode:  emp.employeeCode,
        jobTitle:      emp.jobTitle,
        employeeStatus: emp.employeeStatus,
        updatedAt:     (emp as unknown as { updatedAt: Date }).updatedAt,
      },
    });
  });  // No role restriction at withRoute level — internal check handles self vs HR
}
