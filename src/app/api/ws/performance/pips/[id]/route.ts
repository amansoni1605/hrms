import { NextRequest, NextResponse }           from 'next/server';
import { runWithSession }                       from '@/lib/withRoute';
import { TenantContext, getTenantDEK }          from '@/infrastructure/multiTenantCore';
import { WorkspacePIP, type PIPStatus }         from '@/models/pms.models';
import { createCipheriv, randomBytes }          from 'node:crypto';
import mongoose                                 from 'mongoose';

// ─────────────────────────────────────────────────────────────────────────────
// Allowed PIP status transitions (matches state machine in pms.models.ts)
// ─────────────────────────────────────────────────────────────────────────────

const PIP_TRANSITIONS: Record<PIPStatus, PIPStatus[]> = {
  draft:       ['active'],
  active:      ['checkpoint'],
  checkpoint:  ['completed', 'escalated', 'terminated'],
  escalated:   ['terminated'],
  completed:   [],
  terminated:  [],
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ws/performance/pips/[id]
//
// Returns a single PIP including its objectives and checkpoints.
// Checkpoint notes are stored encrypted; they are NOT decrypted in this
// response (HR views summaries — decrypt on individual checkpoint fetch).
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return runWithSession(async () => {
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: 'Invalid PIP id' }, { status: 400 });
    }

    const pip = await WorkspacePIP.findById(id).lean();
    if (!pip) {
      return NextResponse.json({ error: 'PIP not found' }, { status: 404 });
    }

    return NextResponse.json({ data: pip });
  }, ['hr_admin', 'super_admin', 'hr_manager']);
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/ws/performance/pips/[id]
//
// Update a PIP.  Supported operations:
//   • status transition (validated against state machine)
//   • scalar field updates (managerId, hrOwnerId, reviewDates, notifiedAt)
//   • outcome (only when completing / terminating)
//   • addCheckpoint  — appends an encrypted checkpoint
//   • addObjective   — appends a new objective
//   • objectiveId + objectiveStatus — updates an objective's status
// ─────────────────────────────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return runWithSession(async () => {
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: 'Invalid PIP id' }, { status: 400 });
    }

    const ctx  = TenantContext.requireStore('PATCH /api/ws/performance/pips/[id]');
    const body = await req.json() as Record<string, unknown>;

    const pip = await WorkspacePIP.findById(id);
    if (!pip) {
      return NextResponse.json({ error: 'PIP not found' }, { status: 404 });
    }

    // ── Status transition ─────────────────────────────────────────────────────
    if (body['status'] !== undefined) {
      const next    = body['status'] as PIPStatus;
      const allowed = PIP_TRANSITIONS[pip.status] ?? [];
      if (!allowed.includes(next)) {
        return NextResponse.json(
          {
            error:       'Invalid status transition',
            current:     pip.status,
            requested:   next,
            allowedNext: allowed,
          },
          { status: 422 },
        );
      }
      pip.status = next;
    }

    // ── Scalar field updates ──────────────────────────────────────────────────
    if (body['managerId'] !== undefined) {
      if (!mongoose.isValidObjectId(body['managerId'] as string)) {
        return NextResponse.json({ error: 'Invalid managerId' }, { status: 400 });
      }
      pip.managerId = new mongoose.Types.ObjectId(body['managerId'] as string);
    }

    if (body['hrOwnerId'] !== undefined) {
      if (!mongoose.isValidObjectId(body['hrOwnerId'] as string)) {
        return NextResponse.json({ error: 'Invalid hrOwnerId' }, { status: 400 });
      }
      pip.hrOwnerId = new mongoose.Types.ObjectId(body['hrOwnerId'] as string);
    }

    if (body['reviewDates'] !== undefined && Array.isArray(body['reviewDates'])) {
      pip.reviewDates = (body['reviewDates'] as string[]).map((d) => new Date(d));
    }

    if (body['notifiedAt'] !== undefined) {
      pip.notifiedAt = new Date(body['notifiedAt'] as string);
    }

    // ── Outcome (only when terminating or completing) ─────────────────────────
    if (body['outcome'] !== undefined) {
      if (pip.status !== 'completed' && pip.status !== 'terminated') {
        return NextResponse.json(
          { error: 'outcome can only be set when status is completed or terminated' },
          { status: 422 },
        );
      }
      const validOutcomes = new Set(['improved', 'terminated', 'extended']);
      if (!validOutcomes.has(body['outcome'] as string)) {
        return NextResponse.json(
          { error: `Invalid outcome. Must be one of: ${[...validOutcomes].join(', ')}` },
          { status: 400 },
        );
      }
      pip.outcome = body['outcome'] as 'improved' | 'terminated' | 'extended';
    }

    // ── Add checkpoint ────────────────────────────────────────────────────────
    if (body['addCheckpoint'] !== undefined) {
      const cp = body['addCheckpoint'] as {
        date:          string;
        managerNotes?: string;
        hrNotes?:      string;
        status:        string;
      };

      const validCpStatuses = new Set(['on_track', 'at_risk', 'failed']);
      if (!validCpStatuses.has(cp.status)) {
        return NextResponse.json(
          { error: `Invalid checkpoint status. Must be one of: ${[...validCpStatuses].join(', ')}` },
          { status: 400 },
        );
      }

      const { key }          = await getTenantDEK(ctx.tenantId.toString());

      // Encrypt managerNotes — format: [IV(12) | AuthTag(16) | Ciphertext]
      const mnIv          = randomBytes(12);
      const mnCipher      = createCipheriv('aes-256-gcm', key, mnIv);
      const mnPlain       = cp.managerNotes ?? '';
      const mnEnc         = Buffer.concat([mnCipher.update(mnPlain, 'utf8'), mnCipher.final()]);
      const mnTag         = mnCipher.getAuthTag();
      const managerNotesEnc = Buffer.concat([mnIv, mnTag, mnEnc]);

      // Encrypt hrNotes — format: [IV(12) | AuthTag(16) | Ciphertext]
      const hrIv          = randomBytes(12);
      const hrCipher      = createCipheriv('aes-256-gcm', key, hrIv);
      const hrPlain       = cp.hrNotes ?? '';
      const hrEnc         = Buffer.concat([hrCipher.update(hrPlain, 'utf8'), hrCipher.final()]);
      const hrTag         = hrCipher.getAuthTag();
      const hrNotesEnc    = Buffer.concat([hrIv, hrTag, hrEnc]);

      pip.checkpoints.push({
        date:            new Date(cp.date),
        managerNotesEnc,
        hrNotesEnc,
        status:          cp.status as 'on_track' | 'at_risk' | 'failed',
      });
    }

    // ── Add objective ─────────────────────────────────────────────────────────
    if (body['addObjective'] !== undefined) {
      const obj = body['addObjective'] as {
        description:   string;
        successMetric: string;
        dueDate:       string;
      };

      if (!obj.description || !obj.successMetric || !obj.dueDate) {
        return NextResponse.json(
          { error: 'addObjective requires description, successMetric, and dueDate' },
          { status: 400 },
        );
      }

      pip.objectives.push({
        description:   obj.description,
        successMetric: obj.successMetric,
        dueDate:       new Date(obj.dueDate),
        status:        'pending',
      });
    }

    // ── Update objective status ───────────────────────────────────────────────
    if (body['objectiveId'] !== undefined && body['objectiveStatus'] !== undefined) {
      const objId     = body['objectiveId'] as string;
      const objStatus = body['objectiveStatus'] as string;

      const validObjStatuses = new Set(['pending', 'met', 'missed']);
      if (!validObjStatuses.has(objStatus)) {
        return NextResponse.json(
          { error: `Invalid objectiveStatus. Must be one of: ${[...validObjStatuses].join(', ')}` },
          { status: 400 },
        );
      }

      const objective = pip.objectives.find(
        (o) => (o as unknown as { _id: mongoose.Types.ObjectId })._id.toString() === objId,
      );
      if (!objective) {
        return NextResponse.json({ error: 'Objective not found' }, { status: 404 });
      }
      objective.status = objStatus as 'pending' | 'met' | 'missed';
    }

    await pip.save();

    return NextResponse.json({ data: pip });
  }, ['hr_admin', 'super_admin']);
}
