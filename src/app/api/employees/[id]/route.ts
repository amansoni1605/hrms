import { NextRequest, NextResponse } from 'next/server';
import { runWithSession, auditEvent } from '@/lib/withRoute';
import { WorkspaceEmployee }          from '@/models/workspace.models';
import { createHash }                 from 'node:crypto';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return runWithSession(async () => {
    const employee = await WorkspaceEmployee.findById(id).lean();
    if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    return NextResponse.json({ data: employee });
  });
}

// Fields HR/managers are allowed to update on an employee record.
// Encrypted PII and security-sensitive fields are excluded to prevent privilege escalation.
const MUTABLE_FIELDS = new Set([
  'jobTitle', 'departmentId', 'departmentName', 'departmentCode', 'costCenterCode',
  'managerId', 'managerName', 'salaryBand', 'payFrequency', 'timezone', 'locale',
  'countryCode', 'currencyCode', 'employeeStatus', 'employmentType',
  'probationEndDate', 'lastWorkingDay', 'emergencyContact',
  'skills', 'provisionedAssets', 'immigrationRecords',
  'burnoutRiskScore', 'flightRiskScore', 'nextReviewDate', 'lastPromotionDate',
]);

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return runWithSession(async (session) => {
    const body = await req.json() as Record<string, unknown>;

    // Whitelist — only allow known mutable fields; silently drop everything else
    const $set: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      if (MUTABLE_FIELDS.has(k)) $set[k] = v;
    }
    if (Object.keys($set).length === 0) {
      return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 });
    }

    const employee = await WorkspaceEmployee.findByIdAndUpdate(id, { $set }, { new: true, runValidators: true });
    if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

    await auditEvent({
      actionType:       'UPDATE',
      targetCollection: 'ws_employees',
      targetDocumentId: id,
      modifiedPaths:    Object.keys($set),
      newStateHash:     createHash('sha256').update(id + JSON.stringify(Object.keys($set)) + Date.now()).digest('hex'),
      changeSummary:    { updatedFields: Object.keys($set) },
    });

    return NextResponse.json({ data: employee });
  }, ['super_admin','hr_admin','hr_manager']);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return runWithSession(async () => {
    const employee = await WorkspaceEmployee.findByIdAndUpdate(id, {
      isActive: false,
      employeeStatus: 'terminated',
      lastWorkingDay: new Date(),
    });
    if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

    await auditEvent({
      actionType:       'STATUS_CHANGE',
      targetCollection: 'ws_employees',
      targetDocumentId: id,
      newStateHash:     createHash('sha256').update(`terminated:${id}:${Date.now()}`).digest('hex'),
      changeSummary:    { previousStatus: employee.employeeStatus, newStatus: 'terminated' },
    });

    return NextResponse.json({ message: 'Employee terminated' });
  }, ['super_admin','hr_admin']);
}
