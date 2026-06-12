import { NextRequest, NextResponse }  from 'next/server';
import { withRoute }                  from '@/lib/withRoute';
import { WorkspaceExpenseClaim }      from '@/models/workspace.models';
import { TenantContext }              from '@/infrastructure/multiTenantCore';
import { notify }                     from '@/lib/notificationService';
import mongoose                       from 'mongoose';

// GET /api/expenses — HR/Finance: all claims with filters
export const GET = withRoute(async (req) => {
  const { searchParams } = new URL(req.url);
  const page       = parseInt(searchParams.get('page')   ?? '1');
  const limit      = parseInt(searchParams.get('limit')  ?? '40');
  const status     = searchParams.get('status')     ?? '';
  const employeeId = searchParams.get('employeeId') ?? '';

  const query: Record<string, unknown> = {};
  if (status)     query['status']     = status;
  if (employeeId) query['employeeId'] = new mongoose.Types.ObjectId(employeeId);

  const [data, total] = await Promise.all([
    WorkspaceExpenseClaim.find(query)
      .populate('employeeId', 'employeeCode firstName lastName jobTitle')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    WorkspaceExpenseClaim.countDocuments(query),
  ]);

  return NextResponse.json({ data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}, ['super_admin','hr_admin','hr_manager','payroll_officer','finance_auditor']);

// POST /api/expenses/:id/approve or reject is handled in [id]/route.ts
// This route is HR-only list/overview
