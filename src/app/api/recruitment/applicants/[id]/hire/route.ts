import { NextRequest, NextResponse }     from 'next/server';
import { runWithSession, auditEvent }    from '@/lib/withRoute';
import {
  WorkspaceJobApplicant,
  WorkspaceEmployee,
  WorkspaceUser,
  WorkspaceOnboarding,
  WorkspaceDepartment,
  Tenant,
} from '@/models/workspace.models';
import { TenantContext, encryptEmployeeFields } from '@/infrastructure/multiTenantCore';
import { sendWelcomeEmail }             from '@/lib/mailer';
import { createHash }                   from 'node:crypto';
import crypto                           from 'node:crypto';
import mongoose                         from 'mongoose';
import bcrypt                           from 'bcryptjs';

const DEFAULT_TASKS = [
  { title: 'Submit personal documents (PAN, Aadhaar, Bank details)', category: 'documentation', assignedTo: 'employee' },
  { title: 'Sign employment contract and offer letter',               category: 'documentation', assignedTo: 'employee' },
  { title: 'Sign NDA and confidentiality agreement',                  category: 'compliance',    assignedTo: 'employee' },
  { title: 'Complete POSH awareness training',                        category: 'compliance',    assignedTo: 'employee' },
  { title: 'Set up company email and communication tools',            category: 'it_setup',      assignedTo: 'it' },
  { title: 'Configure laptop and required software',                  category: 'it_setup',      assignedTo: 'it' },
  { title: 'HR orientation session',                                  category: 'orientation',   assignedTo: 'hr' },
  { title: 'Meet the team — department walkthrough',                  category: 'cultural',      assignedTo: 'manager' },
  { title: 'Schedule 30-day check-in with manager',                   category: 'orientation',   assignedTo: 'manager' },
  { title: 'Review company handbook and code of conduct',             category: 'cultural',      assignedTo: 'employee' },
];

// POST /api/recruitment/applicants/[id]/hire
// Atomically converts an accepted applicant into:
//   1. WorkspaceEmployee record
//   2. WorkspaceUser login account
//   3. WorkspaceOnboarding checklist
// Updates the applicant's candidateStatus to ONBOARDING_ACTIVE.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runWithSession(async (session) => {
    if (!mongoose.isValidObjectId(id))
      return NextResponse.json({ error: 'Invalid applicant id' }, { status: 400 });

    const ctx = TenantContext.requireStore('POST /api/recruitment/applicants/[id]/hire');

    const applicant = await WorkspaceJobApplicant.findById(id);
    if (!applicant)
      return NextResponse.json({ error: 'Applicant not found' }, { status: 404 });

    if (applicant.status !== 'accepted')
      return NextResponse.json({ error: 'Applicant must be in accepted status to hire' }, { status: 422 });

    if (applicant.employeeId)
      return NextResponse.json({ error: 'Applicant has already been hired' }, { status: 409 });

    const body = await req.json() as Record<string, unknown>;

    const jobTitle      = String(body['jobTitle']      ?? '').trim();
    const departmentId  = body['departmentId']  ? String(body['departmentId']) : undefined;
    const startDate     = body['startDate']
      ? new Date(String(body['startDate']))
      : (applicant.offerJoiningDate ?? new Date());
    const managerIdRaw = body['managerId']   ? String(body['managerId'])   : undefined;
    const managerName  = body['managerName'] ? String(body['managerName']) : undefined;
    const countryCode  = body['countryCode'] ? String(body['countryCode']).toUpperCase().slice(0, 2) : 'IN';
    const baseSalary   = body['baseSalary']  ? Number(body['baseSalary'])  : 0;

    if (!jobTitle)
      return NextResponse.json({ error: 'jobTitle is required' }, { status: 400 });
    if (!departmentId)
      return NextResponse.json({ error: 'departmentId is required' }, { status: 400 });
    if (managerIdRaw && !mongoose.isValidObjectId(managerIdRaw))
      return NextResponse.json({ error: 'managerId is not a valid id' }, { status: 400 });

    const managerId = managerIdRaw ? new mongoose.Types.ObjectId(managerIdRaw) : undefined;

    // ── Fetch department for code ────────────────────────────────────────────
    const dept = await WorkspaceDepartment.findById(departmentId).select('code name').lean() as
      { code: string; name?: string } | null;
    if (!dept)
      return NextResponse.json({ error: 'Department not found' }, { status: 404 });

    // ── Validate manager exists (if provided) ────────────────────────────────
    if (managerId) {
      const managerExists = await WorkspaceEmployee.exists({ _id: managerId, isActive: true });
      if (!managerExists)
        return NextResponse.json({ error: 'Selected manager not found or inactive' }, { status: 404 });
    }

    // ── Encrypt PII + financial fields ───────────────────────────────────────
    const encFields = await encryptEmployeeFields(ctx.tenantId.toString(), {
      fullName:   applicant.name,
      email:      applicant.email,
      baseSalary: baseSalary || 0,
      phone:      applicant.phone || undefined,
    });

    // ── Guard: reject if this email is already an employee ───────────────────
    if (encFields.emailHash) {
      const duplicate = await WorkspaceEmployee.exists({ emailHash: encFields.emailHash });
      if (duplicate) {
        return NextResponse.json(
          { error: `An employee with the email ${applicant.email} already exists in this organisation.` },
          { status: 409 },
        );
      }
    }

    // ── Fetch tenant name for welcome email ─────────────────────────────────
    const tenant = await Tenant.findById(ctx.tenantId).select('displayName legalName').lean() as
      { displayName?: string; legalName: string } | null;
    const companyName = tenant?.displayName ?? tenant?.legalName ?? 'Your Company';

    // ── 1. Create WorkspaceEmployee ──────────────────────────────────────────
    const count = await WorkspaceEmployee.countDocuments({});
    const employeeCode = `EMP-${String(count + 1).padStart(4, '0')}`;
    const probationEndDate = new Date(startDate.getTime() + 90 * 86_400_000);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const employee = await (WorkspaceEmployee as any).create({
      tenantId:        ctx.tenantId,
      employeeCode,
      jobTitle,
      departmentId:    new mongoose.Types.ObjectId(departmentId),
      departmentName:  dept.name,
      departmentCode:  dept.code,
      managerId,
      managerName,
      countryCode,
      timezone:        body['timezone']     ? String(body['timezone'])                   : 'Asia/Kolkata',
      locale:          body['locale']       ? String(body['locale'])                     : 'en-IN',
      currencyCode:    body['currencyCode'] ? String(body['currencyCode']).toUpperCase() : 'INR',
      hireDate:        startDate,
      probationEndDate,
      employeeStatus:  'pre_hire',
      employmentType:  body['employmentType'] ? String(body['employmentType']) : 'full_time',
      isActive:        true,
      ...encFields,
    }) as { _id: mongoose.Types.ObjectId };

    // ── 2. Create WorkspaceUser login account ────────────────────────────────
    const tempPassword = `Welcome@${Math.floor(1000 + Math.random() * 9000)}`;
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const newTenantStore = {
      tenantId:    ctx.tenantId,
      userId:      new mongoose.Types.ObjectId(session.userId),
      userRole:    'hr_admin' as const,
      employeeId:  employee._id,
      deviceTrust: 'trusted' as const,
      requestId:   crypto.randomUUID(),
      createdAt:   new Date(),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userDoc = await TenantContext.run(newTenantStore, () =>
      (WorkspaceUser as any).create({
        tenantId:     ctx.tenantId,
        name:         applicant.name,
        email:        applicant.email,
        passwordHash,
        role:         'employee',
        employeeId:   employee._id,
        isActive:     true,
      })
    ) as { _id: mongoose.Types.ObjectId };

    // ── 3. Create WorkspaceOnboarding checklist ───────────────────────────────
    const day90 = new Date(startDate);
    day90.setDate(day90.getDate() + 90);
    const target30 = new Date(startDate);
    target30.setDate(target30.getDate() + 30);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onboarding = await (WorkspaceOnboarding as any).create({
      tenantId:               ctx.tenantId,
      employeeId:             employee._id,
      applicantId:            applicant._id,
      managerId,
      status:                 'not_started',
      startDate,
      targetCompletionDate:   target30,
      day90TargetDate:        day90,
      completionTriggerFired: false,
      tasks: DEFAULT_TASKS.map((t) => ({ ...t, status: 'pending' })),
    }) as { _id: mongoose.Types.ObjectId };

    // ── 4. Update applicant + increment department headcount ──────────────────
    applicant.candidateStatus = 'ONBOARDING_ACTIVE';
    applicant.employeeId      = employee._id;
    applicant.onboardingId    = onboarding._id;
    applicant.hiredAt         = new Date();
    await applicant.save();

    await WorkspaceDepartment.findByIdAndUpdate(departmentId, { $inc: { headCount: 1 } });

    // ── 5. Welcome email (fire-and-forget) ────────────────────────────────────
    void sendWelcomeEmail({
      to:           applicant.email,
      employeeName: applicant.name,
      tempPassword,
      companyName,
    });

    await auditEvent({
      actionType:       'INSERT',
      targetCollection: 'ws_employees',
      targetDocumentId: employee._id.toString(),
      newStateHash:     createHash('sha256').update(employeeCode + applicant.email).digest('hex'),
      changeSummary:    { employeeCode, applicantId: id, departmentName: dept.name, action: 'hired_from_ats' },
    });

    return NextResponse.json({
      data: {
        employeeId:   employee._id,
        employeeCode,
        userId:       userDoc._id,
        onboardingId: onboarding._id,
        tempPassword,
      },
    }, { status: 201 });
  }, ['super_admin', 'hr_admin', 'hr_manager']);
}
