import { NextRequest, NextResponse }  from 'next/server';
import { withRoute }                  from '@/lib/withRoute';
import { WorkspaceExpenseClaim }      from '@/models/workspace.models';
import { TenantContext }              from '@/infrastructure/multiTenantCore';
import mongoose                       from 'mongoose';

// GET /api/me/expenses — employee's own claims
export const GET = withRoute(async (_req, session) => {
  if (!session.employeeId) return NextResponse.json({ error: 'No employee linked' }, { status: 404 });

  const claims = await WorkspaceExpenseClaim.find({
    employeeId: new mongoose.Types.ObjectId(session.employeeId),
  }).sort({ createdAt: -1 }).lean();

  return NextResponse.json({ data: claims });
});

// POST /api/me/expenses — submit a new claim
export const POST = withRoute(async (req, session) => {
  if (!session.employeeId) return NextResponse.json({ error: 'No employee linked' }, { status: 404 });

  const ctx   = TenantContext.requireStore('POST /api/me/expenses');
  const body  = await req.json() as Record<string, unknown>;
  const items = (body['items'] as Array<Record<string, unknown>>) ?? [];

  const totalClaimed = items.reduce((s, i) => s + Number(i['amount'] ?? 0), 0);

  const today = new Date();
  const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  const claim = await WorkspaceExpenseClaim.create({
    tenantId:    ctx.tenantId,
    employeeId:  new mongoose.Types.ObjectId(session.employeeId),
    status:      body['submit'] === true ? 'submitted' : 'draft',
    items:       items.map((i) => ({
      date:         new Date(String(i['date'] ?? today)),
      expenseType:  String(i['expenseType'] ?? ''),
      amount:       Number(i['amount'] ?? 0),
      description:  String(i['description'] ?? ''),
      receiptUrl:   String(i['receiptUrl'] ?? ''),
    })),
    totalClaimed,
    notes: String(body['notes'] ?? ''),
    month,
  });

  return NextResponse.json({ data: claim }, { status: 201 });
});
