import { NextResponse }                  from 'next/server';
import { withRoute }                     from '@/lib/withRoute';
import { WorkspaceEmployee, WorkspaceLeaveRequest } from '@/models/workspace.models';
import { decryptField, TenantContext }   from '@/infrastructure/multiTenantCore';
import mongoose                          from 'mongoose';

export const GET = withRoute(async (_req, session) => {
  if (!session.employeeId) {
    return NextResponse.json({ error: 'No employee record linked to this account' }, { status: 404 });
  }

  const ctx = TenantContext.requireStore('GET /api/me');
  const tenantId = ctx.tenantId.toString();

  const [employee, leaveTrend] = await Promise.all([
    WorkspaceEmployee.findById(session.employeeId).lean(),
    WorkspaceLeaveRequest.aggregate([
      { $match: {
          employeeId: new mongoose.Types.ObjectId(session.employeeId),
          status:     'approved',
          startDate:  { $gte: new Date(new Date().getFullYear(), 0, 1) },
      } },
      { $group: { _id: '$leaveType', totalDays: { $sum: '$totalDays' }, count: { $sum: 1 } } },
    ]),
  ]);

  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

  // Decrypt display fields (fullName, email) for the authenticated employee only
  let displayName  = `${session.name}`;
  let displayEmail = session.email;
  try {
    if (employee.fullNameEnc) displayName  = await decryptField(tenantId, employee.fullNameEnc);
    if (employee.emailEnc)    displayEmail = await decryptField(tenantId, employee.emailEnc);
  } catch { /* silently fall back to session values */ }

  // Build leave balance
  const leaveBalance = { annual: 21, sick: 12, earned: 5, usedAnnual: 0, usedSick: 0, remaining: 21 };
  for (const l of leaveTrend as Array<{ _id: string; totalDays: number }>) {
    if (l._id === 'annual') { leaveBalance.usedAnnual = Math.round(l.totalDays); leaveBalance.remaining = Math.max(0, 21 - leaveBalance.usedAnnual); }
    if (l._id === 'sick')   { leaveBalance.usedSick   = Math.round(l.totalDays); }
  }

  return NextResponse.json({
    data: {
      ...employee,        // toJSON strips all *Enc fields automatically
      displayName,
      displayEmail,
      leaveBalance,
      hiddenTabs: employee.hiddenTabs ?? [],
    },
  });
});
