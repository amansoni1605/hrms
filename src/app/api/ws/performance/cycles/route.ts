import { NextResponse }          from 'next/server';
import { auditEvent }             from '@/lib/withRoute';
import { withFeature }            from '@/lib/featureGate';
import {
  WorkspaceAppraisalCycle,
}                                  from '@/models/pms.models';
import { TenantContext }           from '@/infrastructure/multiTenantCore';
import { createHash }              from 'node:crypto';

const DEFAULT_FORMULA_CONFIG = {
  components: [
    { source: 'self',      weight: 20 },
    { source: 'manager',   weight: 60 },
    { source: 'peer_avg',  weight: 20 },
  ],
  scale: { min: 1, max: 5 },
};

const DEFAULT_CALIBRATION_CONFIG = {
  targetBands: [
    { label: 'Outstanding', minPct: 0,  maxPct: 10,  color: '#16A34A' },
    { label: 'Exceeds',     minPct: 10, maxPct: 30,  color: '#2563EB' },
    { label: 'Meets',       minPct: 30, maxPct: 80,  color: '#6B7280' },
    { label: 'Below',       minPct: 80, maxPct: 95,  color: '#F59E0B' },
    { label: 'Poor',        minPct: 95, maxPct: 100, color: '#EF4444' },
  ],
  normalizeEnabled: false,
};

// GET /api/ws/performance/cycles
export const GET = withFeature('performance', async (req) => {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') ?? '';
  const page   = Math.max(1, parseInt(searchParams.get('page')  ?? '1'));
  const limit  = Math.max(1, parseInt(searchParams.get('limit') ?? '20'));

  const query: Record<string, unknown> = { isActive: true };
  if (status) query['status'] = status;

  const [data, total] = await Promise.all([
    WorkspaceAppraisalCycle.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    WorkspaceAppraisalCycle.countDocuments(query),
  ]);

  return NextResponse.json({
    data,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}, ['super_admin', 'hr_admin']);

// POST /api/ws/performance/cycles
export const POST = withFeature('performance', async (req) => {
  const ctx  = TenantContext.requireStore('POST /api/ws/performance/cycles');
  const body = await req.json() as Record<string, unknown>;

  const { name, type, startDate, endDate, phases, formulaConfig, enable360, pipThreshold } = body;

  if (!name || !type || !startDate || !endDate) {
    return NextResponse.json(
      { error: 'name, type, startDate, and endDate are required' },
      { status: 400 },
    );
  }

  const start = new Date(String(startDate));
  const end   = new Date(String(endDate));
  if (isNaN(start.getTime())) {
    return NextResponse.json({ error: 'startDate is not a valid date' }, { status: 400 });
  }
  if (isNaN(end.getTime())) {
    return NextResponse.json({ error: 'endDate is not a valid date' }, { status: 400 });
  }
  if (end <= start) {
    return NextResponse.json({ error: 'endDate must be after startDate' }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = await (WorkspaceAppraisalCycle as any).create({
    tenantId:          ctx.tenantId,
    name:              String(name),
    type,
    startDate:         start,
    endDate:           end,
    phases:            phases ?? [],
    formulaConfig:     formulaConfig ?? DEFAULT_FORMULA_CONFIG,
    calibrationConfig: body['calibrationConfig'] ?? DEFAULT_CALIBRATION_CONFIG,
    enable360:         enable360 ?? false,
    pipThreshold:      pipThreshold ?? 2,
    status:            'draft',
    statusLog:         [],
    createdById:       ctx.userId,
    isActive:          true,
  });

  await auditEvent({
    actionType:       'CYCLE_CREATED',
    targetCollection: 'ws_appraisal_cycles',
    targetDocumentId: doc._id.toString(),
    newStateHash:     createHash('sha256').update(doc._id.toString()).digest('hex'),
    changeSummary:    { name: String(name), status: 'draft' },
  });

  return NextResponse.json({ data: doc }, { status: 201 });
}, ['super_admin', 'hr_admin']);
