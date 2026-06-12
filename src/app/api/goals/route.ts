import { NextResponse }   from 'next/server';
import { withFeature }      from '@/lib/featureGate';
import { WorkspaceGoal }    from '@/models/workspace.models';
import mongoose             from 'mongoose';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/goals?employeeId=&cycleLabel=&status=
//   HR / managers: read goals across the tenant (filtered).  Gated by the
//   `performance` plan feature.  Tenant isolation is automatic via the plugin.
// ─────────────────────────────────────────────────────────────────────────────

export const GET = withFeature('performance', async (req) => {
  const { searchParams } = new URL(req.url);
  const employeeId = searchParams.get('employeeId') ?? '';
  const cycleLabel = searchParams.get('cycleLabel') ?? '';
  const status     = searchParams.get('status') ?? '';

  const query: Record<string, unknown> = { isActive: true };
  if (employeeId && mongoose.isValidObjectId(employeeId)) query['employeeId'] = new mongoose.Types.ObjectId(employeeId);
  if (cycleLabel) query['cycleLabel'] = cycleLabel;
  if (status)     query['status']     = status;

  const goals = await WorkspaceGoal.find(query).sort({ createdAt: -1 }).limit(200).lean();
  return NextResponse.json({ data: goals });
}, ['super_admin', 'hr_admin', 'hr_manager']);
