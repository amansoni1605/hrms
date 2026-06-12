import { NextRequest, NextResponse }  from 'next/server';
import { withRoute }                  from '@/lib/withRoute';
import { WorkspaceSeparation, WorkspaceEmployee } from '@/models/workspace.models';
import { TenantContext }              from '@/infrastructure/multiTenantCore';
import mongoose                       from 'mongoose';

// GET /api/separation — HR: all separations
export const GET = withRoute(async (req) => {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') ?? '';

  const query: Record<string, unknown> = {};
  if (status) query['status'] = status;

  const data = await WorkspaceSeparation.find(query)
    .populate('employeeId', 'employeeCode firstName lastName jobTitle departmentId')
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json({ data });
}, ['super_admin','hr_admin','hr_manager']);

// POST /api/separation — initiate separation
export const POST = withRoute(async (req, session) => {
  const ctx  = TenantContext.requireStore('POST /api/separation');
  const body = await req.json() as Record<string, unknown>;

  const employeeId = String(body['employeeId'] ?? '');
  if (!employeeId) return NextResponse.json({ error: 'employeeId required' }, { status: 400 });

  const employee = await WorkspaceEmployee.findById(employeeId).lean();
  if (!employee)  return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

  // Calculate gratuity: payable if > 5 years
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emp          = employee as any;
  const doj          = emp.dateOfJoining ? new Date(emp.dateOfJoining) : null;
  const lastDay      = body['lastWorkingDay'] ? new Date(String(body['lastWorkingDay'])) : new Date();
  const yearsService = doj ? (lastDay.getTime() - doj.getTime()) / (365.25 * 86_400_000) : 0;
  const gratuity     = yearsService >= 5 ? Math.round((emp.currentCtc ?? 0) / 12 * 15 / 26 * Math.floor(yearsService)) : 0;

  const defaultTasks = [
    { task: 'Return company laptop and accessories',         assignedTo: 'it',       status: 'pending' },
    { task: 'Revoke all system access and accounts',         assignedTo: 'it',       status: 'pending' },
    { task: 'Complete knowledge transfer document',          assignedTo: 'employee', status: 'pending' },
    { task: 'Return ID card and access badges',              assignedTo: 'employee', status: 'pending' },
    { task: 'Clear pending leave balances',                  assignedTo: 'hr',       status: 'pending' },
    { task: 'Process final salary and leave encashment',     assignedTo: 'finance',  status: 'pending' },
    { task: 'Conduct exit interview',                        assignedTo: 'hr',       status: 'pending' },
    { task: 'Issue relieving letter and experience letter',  assignedTo: 'hr',       status: 'pending' },
  ];

  const separation = await WorkspaceSeparation.create({
    tenantId:         ctx.tenantId,
    employeeId:       new mongoose.Types.ObjectId(employeeId),
    type:             (String(body['type'] ?? 'resignation') as 'resignation'|'termination'|'retirement'|'contract_end'),
    initiatedById:    ctx.userId,
    noticeDate:       body['noticeDate'] ? new Date(String(body['noticeDate'])) : new Date(),
    lastWorkingDay:   lastDay,
    offboardingTasks: defaultTasks,
    fnf: {
      pendingSalary:     0,
      leaveEncashment:   0,
      gratuity,
      advanceDeductions: 0,
      totalPayable:      gratuity,
      status:            'pending',
    },
    notes: String(body['notes'] ?? ''),
  });

  return NextResponse.json({ data: separation }, { status: 201 });
}, ['super_admin','hr_admin','hr_manager']);
