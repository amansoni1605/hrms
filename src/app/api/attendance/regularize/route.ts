/**
 * GET /api/attendance/regularize
 *
 * HR / manager view of attendance regularization requests.
 * Query params:
 *   ?status=pending|approved|rejected  (default: pending)
 *   ?page=1&limit=50
 *
 * Protected: hr_admin, hr_manager, super_admin
 */

import { NextRequest, NextResponse }    from 'next/server';
import { withRoute }                    from '@/lib/withRoute';
import { WorkspaceAttendanceReg, WorkspaceEmployee, type IWAttendanceReg } from '@/models/workspace.models';
import { decryptField }                 from '@/infrastructure/multiTenantCore';
import { TenantContext }                from '@/infrastructure/multiTenantCore';
import mongoose                         from 'mongoose';

export const GET = withRoute(async (req) => {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') ?? 'pending';
  const page   = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
  const limit  = Math.min(100, parseInt(searchParams.get('limit') ?? '50'));

  const validStatuses: Array<IWAttendanceReg['status']> = ['pending', 'approved', 'rejected'];
  const safeStatus = validStatuses.includes(status as IWAttendanceReg['status']) ? status as IWAttendanceReg['status'] : 'pending';
  const filter: { status: IWAttendanceReg['status'] } = { status: safeStatus };

  const [requests, total] = await Promise.all([
    WorkspaceAttendanceReg.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    WorkspaceAttendanceReg.countDocuments(filter),
  ]);

  const ctx = TenantContext.requireStore('GET /api/attendance/regularize');
  const tid = ctx.tenantId.toString();

  // Enrich with employee name (decrypt)
  const empIds = [...new Set(requests.map((r) => r.employeeId.toString()))];
  const emps   = await WorkspaceEmployee.find({
    _id: { $in: empIds.map((id) => new mongoose.Types.ObjectId(id)) },
  }).select('_id employeeCode fullNameEnc jobTitle departmentName').lean();

  const empMap: Record<string, { code: string; name: string; title: string }> = {};
  await Promise.all(
    emps.map(async (e) => {
      let name = e.employeeCode;
      try {
        if ((e as unknown as { fullNameEnc?: Buffer }).fullNameEnc)
          name = await decryptField(tid, (e as unknown as { fullNameEnc: Buffer }).fullNameEnc);
      } catch { /* keep code */ }
      empMap[e._id.toString()] = {
        code:  e.employeeCode,
        name,
        title: (e as unknown as { jobTitle?: string }).jobTitle ?? '',
      };
    }),
  );

  const data = requests.map((r) => ({
    _id:              r._id,
    employeeId:       r.employeeId,
    employee:         empMap[r.employeeId.toString()] ?? { code: '—', name: '—', title: '' },
    date:             r.date,
    requestedCheckIn: r.requestedCheckIn,
    requestedCheckOut:r.requestedCheckOut,
    reason:           r.reason,
    status:           r.status,
    approvedAt:       r.managerApprovedAt,
    rejectionReason:  r.rejectionReason,
    createdAt:        r.createdAt,
  }));

  return NextResponse.json({ data, pagination: { total, page, limit, pages: Math.ceil(total / limit) } });
}, ['super_admin', 'hr_admin', 'hr_manager']);
