import { NextRequest, NextResponse } from 'next/server';
import { withRoute, auditEvent }    from '@/lib/withRoute';
import { WorkspaceEmployee, WorkspaceDepartment, WorkspaceOnboarding } from '@/models/workspace.models';
import { TenantContext }            from '@/infrastructure/multiTenantCore';
import { createHash } from 'node:crypto';

export const GET = withRoute(async (req) => {
  const { searchParams } = new URL(req.url);
  const page   = parseInt(searchParams.get('page')   ?? '1');
  const limit  = parseInt(searchParams.get('limit')  ?? '10');
  const search = searchParams.get('search')  ?? '';
  const status = searchParams.get('status')  ?? '';
  const dept   = searchParams.get('department') ?? '';

  const query: Record<string, unknown> = { isActive: true };
  if (status) query['employeeStatus'] = status;
  if (dept)   query['departmentId']   = dept;
  if (search) {
    query['$or'] = [
      { employeeCode:  { $regex: search, $options: 'i' } },
      { jobTitle:      { $regex: search, $options: 'i' } },
      { departmentName:{ $regex: search, $options: 'i' } },
    ];
  }

  const skip = (page - 1) * limit;
  const [employees, total] = await Promise.all([
    WorkspaceEmployee.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    WorkspaceEmployee.countDocuments(query),
  ]);

  return NextResponse.json({
    data: employees,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}, ['super_admin','hr_admin','hr_manager']);   // directory is HR-only — employees use /api/me*

export const POST = withRoute(async (req, session) => {
  const ctx  = TenantContext.requireStore('POST /api/employees');
  const body = await req.json() as Record<string, unknown>;

  // Required-field guard
  const required = ['jobTitle', 'departmentId', 'countryCode', 'hireDate', 'employmentType'];
  const missing  = required.filter((k) => !body[k]);
  if (missing.length) {
    return NextResponse.json({ error: `Missing required fields: ${missing.join(', ')}` }, { status: 400 });
  }

  const VALID_EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contractor', 'intern', 'advisor', 'digital_worker'];
  if (!VALID_EMPLOYMENT_TYPES.includes(String(body['employmentType']))) {
    return NextResponse.json({ error: `Invalid employmentType. Must be one of: ${VALID_EMPLOYMENT_TYPES.join(', ')}` }, { status: 400 });
  }

  const hireDate = new Date(String(body['hireDate']));
  if (isNaN(hireDate.getTime())) {
    return NextResponse.json({ error: 'hireDate is not a valid date' }, { status: 400 });
  }

  const count = await WorkspaceEmployee.countDocuments({});
  const employeeCode = `EMP-${String(count + 1).padStart(4, '0')}`;

  // Whitelist fields — never spread unknown body keys directly into the DB document
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const employee = await (WorkspaceEmployee as any).create({
    tenantId:       ctx.tenantId,
    employeeCode,
    jobTitle:       String(body['jobTitle']),
    departmentId:   body['departmentId'],
    departmentName: body['departmentName'] ? String(body['departmentName']) : undefined,
    departmentCode: body['departmentCode'] ? String(body['departmentCode']) : undefined,
    managerId:      body['managerId']   ?? undefined,
    managerName:    body['managerName'] ? String(body['managerName']) : undefined,
    countryCode:    String(body['countryCode']).toUpperCase().slice(0, 2),
    timezone:       body['timezone']      ? String(body['timezone'])      : 'UTC',
    locale:         body['locale']        ? String(body['locale'])        : 'en-US',
    currencyCode:   body['currencyCode']  ? String(body['currencyCode']).toUpperCase() : 'USD',
    salaryBand:     body['salaryBand']    ? String(body['salaryBand'])    : undefined,
    payFrequency:   body['payFrequency']  ? String(body['payFrequency'])  : 'monthly',
    hireDate,
    probationEndDate: body['probationEndDate'] ? new Date(String(body['probationEndDate'])) : undefined,
    employeeStatus:  'pre_hire',
    employmentType:  String(body['employmentType']),
    isActive:        true,
  });

  await WorkspaceDepartment.findByIdAndUpdate(body.departmentId, { $inc: { headCount: 1 } });

  // Auto-create onboarding checklist for the new employee
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (WorkspaceOnboarding as any).create({
      tenantId:            ctx.tenantId,
      employeeId:          employee._id,
      status:              'not_started',
      startDate:           new Date(),
      targetCompletionDate: new Date(Date.now() + 30 * 86_400_000),
      tasks: [
        { title: 'Complete personal information form',          category: 'personal',   status: 'pending' },
        { title: 'Set up corporate email and Slack',            category: 'it',         status: 'pending' },
        { title: 'Laptop and equipment setup',                  category: 'it',         status: 'pending' },
        { title: 'Review and sign employment contract',         category: 'hr',         status: 'pending' },
        { title: 'Benefits enrollment and NDA signing',         category: 'hr',         status: 'pending' },
        { title: 'Attend new-hire orientation',                 category: 'training',   status: 'pending' },
        { title: 'Meet the team and department walkthrough',    category: 'culture',    status: 'pending' },
        { title: 'Complete mandatory security awareness training', category: 'training', status: 'pending' },
      ],
    });
  } catch { /* non-fatal — onboarding can be created manually */ }

  await auditEvent({
    actionType:       'INSERT',
    targetCollection: 'ws_employees',
    targetDocumentId: employee._id.toString(),
    newStateHash:     createHash('sha256').update(employeeCode + Date.now()).digest('hex'),
    changeSummary:    { employeeCode, action: 'employee_created' },
  });

  return NextResponse.json({ data: employee }, { status: 201 });
}, ['super_admin','hr_admin','hr_manager']);
