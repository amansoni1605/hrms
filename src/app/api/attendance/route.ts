import { NextRequest, NextResponse }  from 'next/server';
import { withRoute }                  from '@/lib/withRoute';
import { WorkspaceAttendance, WorkspaceEmployee } from '@/models/workspace.models';
import { TenantContext, decryptField } from '@/infrastructure/multiTenantCore';
import mongoose                       from 'mongoose';

// GET /api/attendance — HR view: team attendance for a date range
export const GET = withRoute(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const ctx         = TenantContext.requireStore('GET /api/attendance');
  const dateStr     = searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
  const employeeId  = searchParams.get('employeeId') ?? '';
  const page        = parseInt(searchParams.get('page') ?? '1');
  const limit       = parseInt(searchParams.get('limit') ?? '50');

  const date  = new Date(dateStr);
  const start = new Date(date); start.setHours(0, 0, 0, 0);
  const end   = new Date(date); end.setHours(23, 59, 59, 999);

  // Managers only see their direct reports; HR roles see everyone
  const empQuery: Record<string, unknown> = { isActive: true };
  if (employeeId) {
    empQuery['_id'] = new mongoose.Types.ObjectId(employeeId);
  } else if (session.role === 'hr_manager' && session.employeeId) {
    empQuery['managerId'] = new mongoose.Types.ObjectId(session.employeeId);
  }

  const tenantId = ctx.tenantId.toString();
  const [employees, total] = await Promise.all([
    WorkspaceEmployee.find(empQuery)
      .select('employeeCode fullNameEnc jobTitle departmentId')
      .sort({ employeeCode: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    WorkspaceEmployee.countDocuments(empQuery),
  ]);

  const empIds = employees.map((e) => e._id);

  // Fetch today's attendance logs for these employees
  const logs = await WorkspaceAttendance.find({
    'meta.employeeId': { $in: empIds },
    ts: { $gte: start, $lte: end },
  }).lean();

  // Group logs by employee
  const logMap = new Map<string, typeof logs>();
  for (const log of logs) {
    const key = log.meta.employeeId.toString();
    const arr = logMap.get(key) ?? [];
    arr.push(log);
    logMap.set(key, arr);
  }

  const decryptedNames = await Promise.all(
    employees.map(async (emp) => {
      const enc = (emp as unknown as { fullNameEnc?: Buffer }).fullNameEnc;
      if (!enc) return emp.employeeCode;
      try { return await decryptField(tenantId, enc); } catch { return emp.employeeCode; }
    })
  );

  const rows = employees.map((emp, i) => {
    const empLogs   = logMap.get(emp._id.toString()) ?? [];
    const checkIn   = empLogs.find((l) => l.eventType === 'check_in');
    const checkOut  = empLogs.find((l) => l.eventType === 'check_out');
    const totalMs   = (checkIn && checkOut)
      ? checkOut.ts.getTime() - checkIn.ts.getTime()
      : 0;
    const hours     = totalMs / 3_600_000;
    const status    = !checkIn ? 'absent'
      : hours < 2 ? 'absent'
      : hours < 4 ? 'half_day'
      : 'present';

    return {
      employee:    { ...emp, fullName: decryptedNames[i] },
      checkIn:     checkIn?.ts ?? null,
      checkOut:    checkOut?.ts ?? null,
      workingHours: Math.round(hours * 10) / 10,
      status,
    };
  });

  return NextResponse.json({
    data: rows,
    date: dateStr,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}, ['super_admin','hr_admin','hr_manager','payroll_officer','finance_auditor']);
