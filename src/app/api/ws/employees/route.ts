import { NextRequest, NextResponse } from 'next/server';
import { withRoute, auditEvent }          from '@/lib/withRoute';
import {
  WorkspaceEmployee,
  WorkspaceDepartment,
  WorkspaceUser,
  Tenant,
}                                          from '@/models/workspace.models';
import {
  encryptEmployeeFields,
  TenantContext,
}                                          from '@/infrastructure/multiTenantCore';
import { notify }                          from '@/lib/notificationService';
import { sendWelcomeEmail }                from '@/lib/mailer';
import { createHash }                      from 'node:crypto';
import mongoose                            from 'mongoose';
import bcrypt                              from 'bcryptjs';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ws/employees
// Server-side paginated employee list used by the HR Command Center DataGrid.
// Returns plaintext operational fields only — no *Enc fields.
// ─────────────────────────────────────────────────────────────────────────────

export const GET = withRoute(async (req) => {
  const { searchParams } = new URL(req.url);
  const page   = parseInt(searchParams.get('page')   ?? '1');
  const limit  = parseInt(searchParams.get('limit')  ?? '50');
  const search = searchParams.get('search')  ?? '';
  const status = searchParams.get('status')  ?? '';
  const sort   = searchParams.get('sort')    ?? 'employeeCode';
  const dir    = searchParams.get('dir')     ?? 'asc';

  const query: Record<string, unknown> = { isActive: true };
  if (status) query['employeeStatus'] = status;
  if (search) {
    query['$or'] = [
      { employeeCode:   { $regex: search, $options: 'i' } },
      { jobTitle:       { $regex: search, $options: 'i' } },
      { departmentName: { $regex: search, $options: 'i' } },
      { countryCode:    { $regex: search, $options: 'i' } },
    ];
  }

  const sortObj: Record<string, 1 | -1> = { [sort]: dir === 'desc' ? -1 : 1 };

  const [data, total] = await Promise.all([
    WorkspaceEmployee.find(query)
      .sort(sortObj)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    WorkspaceEmployee.countDocuments(query),
  ]);

  return NextResponse.json({
    data,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}, ['super_admin', 'hr_admin', 'hr_manager', 'payroll_officer', 'finance_auditor', 'compliance_officer']);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ws/employees
//
// Creates a new WorkspaceEmployee with AES-256-GCM encrypted PII and
// a linked WorkspaceUser account so the employee can log in.
//
// Required body fields:
//   fullName, email, jobTitle, departmentId
//   countryCode, hireDate, employmentType
//   baseSalary (number, will be encrypted)
//
// Optional:
//   phone, dateOfBirth, personalEmail
//   variableComp, bankAccount, bankRouting, bankSwift
//   managerId, managerName, salaryBand, payFrequency
//   timezone, locale, currencyCode
//   initialPassword  (if omitted, defaults to "Welcome@123" + must change on first login)
//
// Returns the created employee + user account summary (no secrets).
// ─────────────────────────────────────────────────────────────────────────────

export const POST = withRoute(async (req, session) => {
  const ctx  = TenantContext.requireStore('POST /api/ws/employees');
  const body = await req.json() as Record<string, unknown>;

  // ── Validate required fields ──────────────────────────────────────────────
  const required = ['fullName', 'email', 'jobTitle', 'departmentId', 'countryCode', 'hireDate', 'employmentType', 'baseSalary'];
  const missing  = required.filter((k) => !body[k]);
  if (missing.length) {
    return NextResponse.json(
      { error: `Missing required fields: ${missing.join(', ')}` },
      { status: 400 },
    );
  }

  // ── Resolve department ────────────────────────────────────────────────────
  const dept = await WorkspaceDepartment.findById(body['departmentId']).lean();
  if (!dept) {
    return NextResponse.json({ error: 'Department not found' }, { status: 400 });
  }

  const tenantId = ctx.tenantId.toString();

  // ── Check for duplicate email (via HMAC lookup hash) ─────────────────────
  const { hashFieldForLookup } = await import('@/infrastructure/multiTenantCore');
  const emailHash = await hashFieldForLookup(tenantId, String(body['email']));
  const existing  = await WorkspaceEmployee.findOne({ emailHash }).lean();
  if (existing) {
    return NextResponse.json({ error: 'An employee with this email already exists' }, { status: 409 });
  }

  // ── Encrypt all PII + compensation fields ─────────────────────────────────
  const enc = await encryptEmployeeFields(tenantId, {
    fullName:      String(body['fullName']),
    email:         String(body['email']),
    phone:         body['phone']         ? String(body['phone'])         : undefined,
    personalEmail: body['personalEmail'] ? String(body['personalEmail']) : undefined,
    dateOfBirth:   body['dateOfBirth']   ? String(body['dateOfBirth'])   : undefined,
    baseSalary:    Number(body['baseSalary']),
    variableComp:  body['variableComp']  ? Number(body['variableComp'])  : undefined,
    bankAccount:   body['bankAccount']   ? String(body['bankAccount'])   : undefined,
    bankRouting:   body['bankRouting']   ? String(body['bankRouting'])   : undefined,
    bankSwift:     body['bankSwift']     ? String(body['bankSwift'])     : undefined,
  });

  // ── Generate sequential employee code ─────────────────────────────────────
  const count        = await WorkspaceEmployee.countDocuments({});
  const employeeCode = `EMP-${String(count + 1).padStart(4, '0')}`;

  // ── Build hireDate milestone fields ───────────────────────────────────────
  const hireDate      = new Date(String(body['hireDate']));
  const hireDateMonth = hireDate.getMonth() + 1;
  const hireDateDay   = hireDate.getDate();

  // ── Create employee document ──────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const employee = await (WorkspaceEmployee as any).create({
    tenantId:       ctx.tenantId,
    employeeCode,

    // Encrypted PII
    ...enc,

    // Operational fields (plaintext for hot reads)
    jobTitle:       String(body['jobTitle']),
    departmentId:   new mongoose.Types.ObjectId(String(body['departmentId'])),
    departmentName: dept.name,
    departmentCode: dept.code,
    costCenterCode: dept.costCenterCode,
    managerId:      body['managerId']   ? new mongoose.Types.ObjectId(String(body['managerId']))   : undefined,
    managerName:    body['managerName'] ? String(body['managerName']) : undefined,
    countryCode:    String(body['countryCode']).toUpperCase().slice(0, 2),
    currencyCode:   body['currencyCode']  ? String(body['currencyCode']).toUpperCase() : 'USD',
    salaryBand:     body['salaryBand']    ? String(body['salaryBand'])    : undefined,
    payFrequency:   body['payFrequency']  ? String(body['payFrequency'])  : 'monthly',
    timezone:       body['timezone']      ? String(body['timezone'])      : 'UTC',
    locale:         body['locale']        ? String(body['locale'])        : 'en-US',

    // Dates
    hireDate,
    hireDateMonth,
    hireDateDay,
    probationEndDate: body['probationEndDate']
      ? new Date(String(body['probationEndDate']))
      : new Date(hireDate.getTime() + 90 * 86_400_000),

    // Lifecycle
    employeeStatus:  'pre_hire',
    employmentType:  String(body['employmentType']),
    isActive:        true,

    // Risk signals start at 0 — ML worker fills them later
    burnoutRiskScore: 0,
    flightRiskScore:  0,
  });

  // ── Create linked WorkspaceUser ───────────────────────────────────────────
  const rawPassword  = body['initialPassword']
    ? String(body['initialPassword'])
    : 'Welcome@123';
  const passwordHash = await bcrypt.hash(rawPassword, 12);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const user = await (WorkspaceUser as any).create({
    tenantId:    ctx.tenantId,
    employeeId:  employee._id,
    name:        String(body['fullName']),
    email:       String(body['email']).toLowerCase().trim(),
    passwordHash,
    role:        'employee',
    isActive:    true,
  });

  // ── Bump department headcount ─────────────────────────────────────────────
  await WorkspaceDepartment.findByIdAndUpdate(
    body['departmentId'],
    { $inc: { headCount: 1 } },
  );

  // ── Write audit event ─────────────────────────────────────────────────────
  await auditEvent({
    actionType:       'EMPLOYEE_CREATED',
    targetCollection: 'ws_employees',
    targetDocumentId: employee._id.toString(),
    newStateHash:     createHash('sha256')
      .update(`${employeeCode}:${tenantId}:${Date.now()}`)
      .digest('hex'),
    changeSummary: {
      employeeCode,
      jobTitle:      body['jobTitle'],
      departmentName: dept.name,
      createdBy:     session.userId,
    },
  });

  // ── Welcome email ─────────────────────────────────────────────────────────
  // Fire-and-forget — mailer never throws
  void (async () => {
    const tenantDoc = await Tenant.findById(ctx.tenantId)
      .select('displayName legalName brandColor').lean() as
      { displayName?: string; legalName: string; brandColor?: string } | null;
    await sendWelcomeEmail({
      to:           String(body['email']),
      employeeName: String(body['fullName']),
      tempPassword: rawPassword,
      companyName:  tenantDoc?.displayName ?? tenantDoc?.legalName ?? 'Your Company',
      brandColor:   tenantDoc?.brandColor,
    });
  })();

  // ── Notifications ─────────────────────────────────────────────────────────
  await notify.employeeCreated({
    tenantId:        tenantId,
    employeeId:      employee._id.toString(),
    employeeCode:    employee.employeeCode,
    jobTitle:        employee.jobTitle,
    createdByUserId: session.userId,
  });

  return NextResponse.json({
    data: {
      employeeId:   employee._id,
      employeeCode: employee.employeeCode,
      userId:       user._id,
      email:        String(body['email']),
      jobTitle:     employee.jobTitle,
      departmentName: dept.name,
      employeeStatus: employee.employeeStatus,
      hireDate:     employee.hireDate,
      message:      `Employee ${employeeCode} created. Login: ${body['email']} / ${rawPassword}`,
    },
  }, { status: 201 });
}, ['super_admin', 'hr_admin', 'hr_manager']);
