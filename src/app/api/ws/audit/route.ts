import { NextRequest, NextResponse }  from 'next/server';
import { withRoute }                  from '@/lib/withRoute';
import { WorkspaceAuditTrail }        from '@/models/workspace.models';
import mongoose                       from 'mongoose';

export const GET = withRoute(async (req) => {
  const { searchParams } = new URL(req.url);
  const page             = parseInt(searchParams.get('page')   ?? '1');
  const limit            = parseInt(searchParams.get('limit')  ?? '20');
  const action           = searchParams.get('action')           ?? '';
  const targetDocumentId = searchParams.get('targetDocumentId') ?? '';

  const query: Record<string, unknown> = {};
  if (action)           query['actionType']       = action;
  if (targetDocumentId && mongoose.isValidObjectId(targetDocumentId))
    query['targetDocumentId'] = new mongoose.Types.ObjectId(targetDocumentId);

  const [logs, total] = await Promise.all([
    WorkspaceAuditTrail.find(query)
      .sort({ sequenceNumber: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    WorkspaceAuditTrail.countDocuments(query),
  ]);

  return NextResponse.json({
    data: logs,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}, ['super_admin','hr_admin','hr_manager','payroll_officer','finance_auditor','compliance_officer']);
