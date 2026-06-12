import { NextRequest, NextResponse }  from 'next/server';
import { withRoute }                  from '@/lib/withRoute';
import { WorkspaceOnboarding, WorkspaceHRSettings } from '@/models/workspace.models';
import { TenantContext }              from '@/infrastructure/multiTenantCore';
import mongoose                       from 'mongoose';

// GET /api/onboarding — HR: all onboarding records
export const GET = withRoute(async (req) => {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') ?? '';

  const query: Record<string, unknown> = {};
  if (status) query['status'] = status;

  const data = await WorkspaceOnboarding.find(query)
    .populate('employeeId', 'employeeCode firstName lastName jobTitle')
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json({ data });
}, ['super_admin','hr_admin','hr_manager']);

// POST /api/onboarding — create onboarding record for an employee
export const POST = withRoute(async (req) => {
  const ctx  = TenantContext.requireStore('POST /api/onboarding');
  const body = await req.json() as Record<string, unknown>;

  const employeeId = String(body['employeeId'] ?? '');
  if (!employeeId) return NextResponse.json({ error: 'employeeId required' }, { status: 400 });

  // Check if already exists
  const exists = await WorkspaceOnboarding.findOne({
    employeeId: new mongoose.Types.ObjectId(employeeId),
  });
  if (exists) return NextResponse.json({ data: exists });

  // Load default tasks from HR settings
  const settings = await WorkspaceHRSettings.findOne({ tenantId: ctx.tenantId }).lean();

  const defaultTasks = [
    { title: 'Submit personal documents (PAN, Aadhaar, Bank details)', category: 'documentation', assignedTo: 'employee', status: 'pending' },
    { title: 'Sign employment contract and policies',                   category: 'documentation', assignedTo: 'employee', status: 'pending' },
    { title: 'Set up company email and communication tools',            category: 'it_setup',      assignedTo: 'it',       status: 'pending' },
    { title: 'Configure laptop and required software',                  category: 'it_setup',      assignedTo: 'it',       status: 'pending' },
    { title: 'Complete POSH awareness training',                        category: 'training',      assignedTo: 'employee', status: 'pending' },
    { title: 'HR orientation session',                                  category: 'orientation',   assignedTo: 'hr',       status: 'pending' },
    { title: 'Team introduction meeting',                               category: 'orientation',   assignedTo: 'manager',  status: 'pending' },
    { title: 'Review company handbook and code of conduct',             category: 'documentation', assignedTo: 'employee', status: 'pending' },
  ];

  const startDate = body['startDate'] ? new Date(String(body['startDate'])) : new Date();
  const targetDate = new Date(startDate); targetDate.setDate(targetDate.getDate() + 30);

  const onboarding = await WorkspaceOnboarding.create({
    tenantId:             ctx.tenantId,
    employeeId:           new mongoose.Types.ObjectId(employeeId),
    status:               'not_started',
    tasks:                defaultTasks,
    startDate,
    targetCompletionDate: targetDate,
  });

  return NextResponse.json({ data: onboarding }, { status: 201 });
}, ['super_admin','hr_admin','hr_manager']);
