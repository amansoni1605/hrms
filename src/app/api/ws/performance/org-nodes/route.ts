import { NextRequest, NextResponse }           from 'next/server';
import { withFeature }                          from '@/lib/featureGate';
import { TenantContext }                        from '@/infrastructure/multiTenantCore';
import { WorkspaceOrgNode }                     from '@/models/pms.models';
import mongoose                                 from 'mongoose';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ws/performance/org-nodes
//
// Returns the flat array of all currently-active org nodes for the tenant
// (effectiveTo: null).  The client builds the tree from this flat list.
// ─────────────────────────────────────────────────────────────────────────────

export const GET = withFeature(
  'performance',
  async () => {
    const data = await WorkspaceOrgNode.find({ effectiveTo: null })
      .sort({ depth: 1, employeeId: 1 })
      .lean();

    return NextResponse.json({ data });
  },
  ['hr_admin', 'super_admin', 'hr_manager'],
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ws/performance/org-nodes
//
// Upsert an org node for an employee:
//  1. Close the existing current node (effectiveTo = now)
//  2. Compute ancestorPath from the manager's current node
//  3. Create a new node with effectiveFrom = now, effectiveTo = null
// ─────────────────────────────────────────────────────────────────────────────

export const POST = withFeature(
  'performance',
  async (req: NextRequest) => {
    const ctx  = TenantContext.requireStore('POST /api/ws/performance/org-nodes');
    const body = await req.json() as Record<string, unknown>;

    const { employeeId, managerId, departmentId, matrixManagerIds } = body as {
      employeeId:        string;
      managerId?:        string;
      departmentId?:     string;
      matrixManagerIds?: string[];
    };

    if (!employeeId) {
      return NextResponse.json(
        { error: 'Missing required field: employeeId' },
        { status: 400 },
      );
    }

    if (!mongoose.isValidObjectId(employeeId)) {
      return NextResponse.json({ error: 'Invalid employeeId' }, { status: 400 });
    }

    if (managerId && !mongoose.isValidObjectId(managerId)) {
      return NextResponse.json({ error: 'Invalid managerId' }, { status: 400 });
    }

    if (departmentId && !mongoose.isValidObjectId(departmentId)) {
      return NextResponse.json({ error: 'Invalid departmentId' }, { status: 400 });
    }

    if (Array.isArray(matrixManagerIds)) {
      for (const mmId of matrixManagerIds) {
        if (!mongoose.isValidObjectId(mmId)) {
          return NextResponse.json({ error: `Invalid matrixManagerId: ${mmId}` }, { status: 400 });
        }
      }
    }

    const now = new Date();

    // ── Step 1: Close the current node if one exists ──────────────────────────
    await WorkspaceOrgNode.updateOne(
      { employeeId: new mongoose.Types.ObjectId(employeeId), effectiveTo: null },
      { $set: { effectiveTo: now } },
    );

    // ── Step 2: Build ancestorPath from manager's current node ────────────────
    let ancestorPath: mongoose.Types.ObjectId[] = [];
    let depth = 0;

    if (managerId) {
      const managerOid     = new mongoose.Types.ObjectId(managerId);
      const managerNode    = await WorkspaceOrgNode.findOne({
        employeeId:  managerOid,
        effectiveTo: null,
      }).lean();

      if (managerNode) {
        // ancestorPath = manager's ancestorPath + managerId
        ancestorPath = [...(managerNode.ancestorPath ?? []), managerOid];
        depth        = ancestorPath.length;
      } else {
        // Manager has no node yet (root-level manager)
        ancestorPath = [managerOid];
        depth        = 1;
      }
    }

    // ── Step 3: Create new node ───────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const node = await (WorkspaceOrgNode as any).create({
      tenantId:    ctx.tenantId,
      employeeId:  new mongoose.Types.ObjectId(employeeId),
      ancestorPath,
      depth,
      ...(departmentId && { departmentId: new mongoose.Types.ObjectId(departmentId) }),
      matrixManagerIds: Array.isArray(matrixManagerIds)
        ? matrixManagerIds.map((id) => new mongoose.Types.ObjectId(id))
        : [],
      effectiveFrom: now,
      effectiveTo:   null,
    });

    return NextResponse.json({ data: node }, { status: 201 });
  },
  ['hr_admin', 'super_admin'],
);
