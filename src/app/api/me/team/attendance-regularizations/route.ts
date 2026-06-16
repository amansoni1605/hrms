/**
 * GET /api/me/team/attendance-regularizations
 *
 * Returns pending attendance regularization requests where the current
 * user is the designated line manager (managerId === session.employeeId).
 *
 * Available to any authenticated user — access is restricted by managerId
 * matching, not by role, so line managers with 'employee' role can use this.
 */

import { NextResponse }             from 'next/server';
import { withRoute }               from '@/lib/withRoute';
import { WorkspaceAttendanceReg, WorkspaceEmployee } from '@/models/workspace.models';
import { decryptField, TenantContext } from '@/infrastructure/multiTenantCore';
import mongoose                    from 'mongoose';

export const GET = withRoute(async (_req, session) => {
  if (!session.employeeId) {
    return NextResponse.json({ data: [] });
  }

  const reqs = await WorkspaceAttendanceReg.find({
    managerId: new mongoose.Types.ObjectId(session.employeeId),
    status:    'pending',
  }).sort({ createdAt: 1 }).lean();

  const ctx = TenantContext.requireStore('GET /api/me/team/attendance-regularizations');
  const tid = ctx.tenantId.toString();

  // Enrich with employee name
  const empIds = [...new Set(reqs.map((r) => r.employeeId.toString()))];
  const emps   = await WorkspaceEmployee.find({
    _id: { $in: empIds.map((id) => new mongoose.Types.ObjectId(id)) },
  }).select('_id employeeCode fullNameEnc jobTitle').lean();

  const empMap: Record<string, { code: string; name: string; title: string }> = {};
  await Promise.all(
    emps.map(async (e) => {
      let name = e.employeeCode;
      try {
        const buf = (e as unknown as { fullNameEnc?: Buffer }).fullNameEnc;
        if (buf) name = await decryptField(tid, buf);
      } catch { /* keep code */ }
      empMap[e._id.toString()] = {
        code:  e.employeeCode,
        name,
        title: (e as unknown as { jobTitle?: string }).jobTitle ?? '',
      };
    }),
  );

  const data = reqs.map((r) => ({
    _id:               r._id,
    employee:          empMap[r.employeeId.toString()] ?? { code: '—', name: '—', title: '' },
    date:              r.date,
    requestedCheckIn:  r.requestedCheckIn,
    requestedCheckOut: r.requestedCheckOut,
    reason:            r.reason,
    status:            r.status,
    createdAt:         r.createdAt,
  }));

  return NextResponse.json({ data });
});
