import { NextRequest, NextResponse }  from 'next/server';
import { withRoute }                  from '@/lib/withRoute';
import { WorkspaceHRSettings }        from '@/models/workspace.models';
import { TenantContext }              from '@/infrastructure/multiTenantCore';

const DEFAULT_LEAVE_POLICY = [
  { leaveType: 'Casual Leave',      annualDays: 8,   carryForward: false, maxCarryDays: 0,  encashable: false, isActive: true },
  { leaveType: 'Privilege Leave',   annualDays: 15,  carryForward: true,  maxCarryDays: 30, encashable: true,  isActive: true },
  { leaveType: 'Sick Leave',        annualDays: 7,   carryForward: false, maxCarryDays: 0,  encashable: false, isActive: true },
  { leaveType: 'Maternity Leave',   annualDays: 182, carryForward: false, maxCarryDays: 0,  encashable: false, isActive: true },
  { leaveType: 'Paternity Leave',   annualDays: 5,   carryForward: false, maxCarryDays: 0,  encashable: false, isActive: true },
  { leaveType: 'Bereavement Leave', annualDays: 5,   carryForward: false, maxCarryDays: 0,  encashable: false, isActive: true },
  { leaveType: 'Work From Home',    annualDays: 24,  carryForward: false, maxCarryDays: 0,  encashable: false, isActive: true },
];

const DEFAULT_SALARY_BANDS = [
  { band: 'L1', minBase: 45000,  maxBase: 80000,  travelAllowance: 1600 },
  { band: 'L2', minBase: 80000,  maxBase: 130000, travelAllowance: 2400 },
  { band: 'L3', minBase: 130000, maxBase: 300000, travelAllowance: 3200 },
];

const DEFAULT_EXPENSE_TYPES = [
  { name: 'Travel - Local',              isActive: true },
  { name: 'Travel - Outstation',         isActive: true },
  { name: 'Meals & Entertainment',       isActive: true },
  { name: 'Training & Certification',    isActive: true },
  { name: 'Internet & Communication',    isActive: true },
  { name: 'Office Supplies',             isActive: true },
  { name: 'Accommodation',               isActive: true },
  { name: 'Medical',                     isActive: true },
];

const DEFAULT_OFFBOARDING = [
  'Return company laptop and accessories',
  'Revoke all system access and accounts',
  'Complete knowledge transfer document',
  'Return ID card and access badges',
  'Clear pending leave balances',
  'Process final salary and leave encashment',
  'Conduct exit interview',
  'Issue relieving letter and experience letter',
];

// GET /api/hr-settings — load tenant HR settings (creates defaults if first visit)
export const GET = withRoute(async () => {
  const ctx = TenantContext.requireStore('GET /api/hr-settings');

  let settings = await WorkspaceHRSettings.findOne({ tenantId: ctx.tenantId }).lean();
  if (!settings) {
    // Bootstrap defaults on first access
    const created = await WorkspaceHRSettings.create({
      tenantId:            ctx.tenantId,
      leavePolicy:         DEFAULT_LEAVE_POLICY,
      salaryBands:         DEFAULT_SALARY_BANDS,
      salaryFormula:       { basicPercent: 40, hraPercent: 20, medicalAllowance: 1250, profTax: 200, pfPercent: 12 },
      workingDaysPerWeek:  5,
      probationPeriodDays: 90,
      noticePeriodDays:    30,
      holidays:            [],
      expenseTypes:        DEFAULT_EXPENSE_TYPES,
      offboardingTemplate: DEFAULT_OFFBOARDING,
    });
    settings = created.toObject();
  }

  return NextResponse.json({ data: settings });
}, ['super_admin','hr_admin','hr_manager']);

// PUT /api/hr-settings — replace entire settings document
export const PUT = withRoute(async (req) => {
  const ctx  = TenantContext.requireStore('PUT /api/hr-settings');
  const body = await req.json() as Record<string, unknown>;

  const updated = await WorkspaceHRSettings.findOneAndUpdate(
    { tenantId: ctx.tenantId },
    { $set: body },
    { new: true, upsert: true },
  ).lean();

  return NextResponse.json({ data: updated });
}, ['super_admin','hr_admin']);

// PATCH /api/hr-settings — partial update (specific section)
export const PATCH = withRoute(async (req) => {
  const ctx  = TenantContext.requireStore('PATCH /api/hr-settings');
  const body = await req.json() as Record<string, unknown>;

  // Only allow patching known top-level sections
  const allowed = ['leavePolicy','salaryBands','salaryFormula','holidays','expenseTypes',
                   'offboardingTemplate','workingDaysPerWeek','leaveYearStart','probationPeriodDays','noticePeriodDays'];
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }

  const updated = await WorkspaceHRSettings.findOneAndUpdate(
    { tenantId: ctx.tenantId },
    { $set: patch },
    { new: true, upsert: true },
  ).lean();

  return NextResponse.json({ data: updated });
}, ['super_admin','hr_admin']);
