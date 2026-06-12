import { NextResponse }           from 'next/server';
import { withRoute, auditEvent }   from '@/lib/withRoute';
import {
  WorkspaceEmployee,
  WorkspaceDepartment,
  WorkspaceUser,
  Tenant,
}                                  from '@/models/workspace.models';
import { TenantContext }           from '@/infrastructure/multiTenantCore';
import { sendWelcomeEmail }        from '@/lib/mailer';
import { createHash }              from 'node:crypto';
import mongoose                    from 'mongoose';
import bcrypt                      from 'bcryptjs';

interface BulkRow {
  fullName:        string;
  email:           string;
  jobTitle:        string;
  departmentName:  string;
  employmentType:  string;
  countryCode:     string;
  hireDate:        string;
  baseSalary:      string | number;
  role?:           string;
  salaryBand?:     string;
  managerEmail?:   string;
  phone?:          string;
  timezone?:       string;
  currencyCode?:   string;
  initialPassword?: string;
}

interface RowResult {
  row:          number;
  email:        string;
  employeeCode?: string;
  status:       'created' | 'skipped' | 'error';
  reason?:      string;
}

export const POST = withRoute(async (req, session) => {
  const ctx  = TenantContext.requireStore('POST /api/ws/employees/bulk');
  const body = await req.json() as { rows?: BulkRow[] };

  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: 'No rows provided' }, { status: 400 });
  }
  if (body.rows.length > 500) {
    return NextResponse.json({ error: 'Maximum 500 rows per import' }, { status: 400 });
  }

  const tenantId = ctx.tenantId.toString();
  const { hashFieldForLookup } = await import('@/infrastructure/multiTenantCore');

  // Cache dept lookup (case-insensitive by name)
  const deptCache = new Map<string, { _id: mongoose.Types.ObjectId; name: string; code: string }>();
  const getDept = async (name: string) => {
    const key = name.trim().toLowerCase();
    if (deptCache.has(key)) return deptCache.get(key)!;
    const d = await WorkspaceDepartment.findOne({
      name: { $regex: `^${name.trim()}$`, $options: 'i' },
    }).lean() as { _id: mongoose.Types.ObjectId; name: string; code: string } | null;
    if (d) deptCache.set(key, d);
    return d;
  };

  // Cache manager lookup by email (bypass tenant plugin — email is plaintext on ws_users)
  const mgrCache = new Map<string, { empId: mongoose.Types.ObjectId; name: string } | null>();
  const getMgr = async (email: string) => {
    const key = email.trim().toLowerCase();
    if (mgrCache.has(key)) return mgrCache.get(key) ?? null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = (WorkspaceUser as any).findOne({ email: key }).select('employeeId name').lean();
    q._bypassTenantPlugin = true;
    const u = await q as { employeeId?: mongoose.Types.ObjectId; name: string } | null;
    const val = u?.employeeId ? { empId: u.employeeId, name: u.name } : null;
    mgrCache.set(key, val);
    return val;
  };

  const results: RowResult[] = [];
  let empCount = await WorkspaceEmployee.countDocuments({});

  // Get tenant branding once for welcome emails
  const tenantDoc = await Tenant.findById(ctx.tenantId)
    .select('displayName legalName brandColor').lean() as
    { displayName?: string; legalName: string; brandColor?: string } | null;
  const companyName = tenantDoc?.displayName ?? tenantDoc?.legalName ?? 'Your Company';

  for (let i = 0; i < body.rows.length; i++) {
    const row = body.rows[i];
    const rowNum = i + 1;

    // Basic validation
    const requiredFields = ['fullName','email','jobTitle','departmentName','employmentType','countryCode','hireDate'];
    const missing = requiredFields.filter((k) => !row[k as keyof BulkRow]?.toString().trim());
    if (missing.length) {
      results.push({ row: rowNum, email: row.email ?? '', status: 'error', reason: `Missing: ${missing.join(', ')}` });
      continue;
    }

    const email = row.email.trim().toLowerCase();

    // Duplicate check via emailHash
    const emailHash = await hashFieldForLookup(tenantId, email);
    const exists    = await WorkspaceEmployee.findOne({ emailHash }).lean();
    if (exists) {
      results.push({ row: rowNum, email, status: 'skipped', reason: 'Email already exists' });
      continue;
    }

    // Resolve department
    const dept = await getDept(row.departmentName);
    if (!dept) {
      results.push({ row: rowNum, email, status: 'error', reason: `Department "${row.departmentName}" not found` });
      continue;
    }

    // Resolve manager (optional)
    let managerId:   mongoose.Types.ObjectId | undefined;
    let managerName: string | undefined;
    if (row.managerEmail?.trim()) {
      const mgr = await getMgr(row.managerEmail.trim());
      if (mgr) { managerId = mgr.empId; managerName = mgr.name; }
    }

    try {
      const hireDate   = new Date(row.hireDate);
      const baseSalary = Number(row.baseSalary) || 0;
      const rawPwd     = row.initialPassword?.trim() || 'Welcome@123';
      const passwordHash = await bcrypt.hash(rawPwd, 12);
      empCount++;
      const employeeCode = `EMP-${String(empCount).padStart(4, '0')}`;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const emp = await (WorkspaceEmployee as any).createWithEncryption(
        { fullName: row.fullName.trim(), email, baseSalary, phone: row.phone?.trim() },
        {
          tenantId:       ctx.tenantId,
          employeeCode,
          jobTitle:       row.jobTitle.trim(),
          departmentId:   dept._id,
          departmentName: dept.name,
          departmentCode: dept.code,
          managerId,
          managerName,
          countryCode:    row.countryCode.trim().toUpperCase().slice(0, 2),
          currencyCode:   row.currencyCode?.trim().toUpperCase() || 'INR',
          salaryBand:     row.salaryBand?.trim() || undefined,
          timezone:       row.timezone?.trim() || 'UTC',
          locale:         'en-IN',
          payFrequency:   'monthly',
          hireDate,
          hireDateMonth:  hireDate.getMonth() + 1,
          hireDateDay:    hireDate.getDate(),
          probationEndDate: new Date(hireDate.getTime() + 90 * 86_400_000),
          employeeStatus: 'active',
          employmentType: row.employmentType.trim(),
          isActive:       true,
          burnoutRiskScore: 0,
          flightRiskScore:  0,
        },
      ) as { _id: mongoose.Types.ObjectId; employeeCode: string };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (WorkspaceUser as any).create({
        tenantId:    ctx.tenantId,
        employeeId:  emp._id,
        name:        row.fullName.trim(),
        email,
        passwordHash,
        role:        row.role?.trim() || 'employee',
        isActive:    true,
      });

      await WorkspaceDepartment.findByIdAndUpdate(dept._id, { $inc: { headCount: 1 } });

      await auditEvent({
        actionType:       'EMPLOYEE_CREATED',
        targetCollection: 'ws_employees',
        targetDocumentId: emp._id.toString(),
        newStateHash:     createHash('sha256').update(`${employeeCode}:${tenantId}:bulk`).digest('hex'),
        changeSummary:    { employeeCode, jobTitle: row.jobTitle, createdBy: session.userId, source: 'bulk_import' },
      });

      // Welcome email fire-and-forget
      void sendWelcomeEmail({ to: email, employeeName: row.fullName.trim(), tempPassword: rawPwd, companyName }).catch(() => null);

      results.push({ row: rowNum, email, employeeCode: emp.employeeCode, status: 'created' });
    } catch (err) {
      // Rollback empCount so gaps don't accumulate
      empCount--;
      results.push({ row: rowNum, email, status: 'error', reason: err instanceof Error ? err.message : String(err) });
    }
  }

  const created = results.filter((r) => r.status === 'created').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  const errors  = results.filter((r) => r.status === 'error').length;

  return NextResponse.json({ created, skipped, errors, results }, { status: 201 });
}, ['super_admin', 'hr_admin', 'hr_manager']);
