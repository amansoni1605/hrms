import { NextRequest, NextResponse }            from 'next/server';
import { runWithSession, auditEvent }            from '@/lib/withRoute';
import {
  WorkspacePMSReview,
  WorkspaceAppraisalCycle,
}                                                from '@/models/pms.models';
import { TenantContext, getTenantDEK }           from '@/infrastructure/multiTenantCore';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import mongoose                                  from 'mongoose';

// ─────────────────────────────────────────────────────────────────────────────
// Crypto helpers (AES-256-GCM)
// ─────────────────────────────────────────────────────────────────────────────

async function encryptText(
  tenantId: string,
  text: string,
): Promise<{ enc: Buffer; iv: Buffer }> {
  const { key } = await getTenantDEK(tenantId);
  const iv      = randomBytes(12);
  const cipher  = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag   = cipher.getAuthTag();
  return { enc: Buffer.concat([authTag, encrypted]), iv };
}

async function decryptText(
  tenantId: string,
  enc: Buffer,
  iv: Buffer,
): Promise<string> {
  const { key }    = await getTenantDEK(tenantId);
  const authTag    = enc.subarray(0, 16);
  const data       = enc.subarray(16);
  const decipher   = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/me/performance/pms/[reviewId]
//
// Returns the review with decrypted comments.
// 403 if revieweeId != ctx.employeeId.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ reviewId: string }> },
) {
  const { reviewId } = await params;

  return runWithSession(async (session) => {
    if (!session.employeeId) {
      return NextResponse.json({ error: 'No employee profile linked to this account' }, { status: 404 });
    }
    if (!mongoose.isValidObjectId(reviewId)) {
      return NextResponse.json({ error: 'Invalid reviewId' }, { status: 400 });
    }

    const ctx        = TenantContext.requireStore('GET /api/me/performance/pms/[reviewId]');
    const employeeId = new mongoose.Types.ObjectId(session.employeeId);

    const review = await WorkspacePMSReview.findById(reviewId).lean();
    if (!review) {
      return NextResponse.json({ error: 'Review not found' }, { status: 404 });
    }
    if (review.revieweeId.toString() !== employeeId.toString()) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const tenantId = ctx.tenantId.toString();

    // Decrypt per-competency comments
    const ratings = await Promise.all(
      (review.ratings ?? []).map(async (r) => {
        let comment: string | null = null;
        if (r.commentEnc && r.commentIv) {
          try {
            comment = await decryptText(tenantId, r.commentEnc, r.commentIv);
          } catch {
            comment = null;
          }
        }
        return {
          dimension: r.dimension,
          score:     r.score,
          comment,
        };
      }),
    );

    // Decrypt overall comment
    let overallComment: string | null = null;
    if (review.overallCommentEnc && review.overallCommentIv) {
      try {
        overallComment = await decryptText(tenantId, review.overallCommentEnc, review.overallCommentIv);
      } catch {
        overallComment = null;
      }
    }

    return NextResponse.json({
      data: {
        _id:           review._id,
        cycleId:       review.cycleId,
        revieweeId:    review.revieweeId,
        reviewerRole:  review.reviewerRole,
        status:        review.status,
        draftSavedAt:  review.draftSavedAt  ?? null,
        submittedAt:   review.submittedAt   ?? null,
        lockedAt:      review.lockedAt      ?? null,
        ratings,
        overallComment,
        finalScore:    review.finalScore    ?? null,
        pipTriggered:  review.pipTriggered,
        createdAt:     review.createdAt,
        updatedAt:     review.updatedAt,
      },
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/me/performance/pms/[reviewId]
//
// Auto-save (draft) or submit a self-appraisal.
//
// Body variants:
//   Draft:  { ratings: [...], overallComment?: string }
//   Submit: { submit: true, ratings: [...], overallComment?: string }
// ─────────────────────────────────────────────────────────────────────────────

interface RatingInput {
  dimension:   string;
  score:       number;
  comment?:    string;
}

interface PatchBody {
  submit?:        boolean;
  ratings?:       RatingInput[];
  overallComment?: string;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ reviewId: string }> },
) {
  const { reviewId } = await params;

  return runWithSession(async (session) => {
    if (!session.employeeId) {
      return NextResponse.json({ error: 'No employee profile linked to this account' }, { status: 404 });
    }
    if (!mongoose.isValidObjectId(reviewId)) {
      return NextResponse.json({ error: 'Invalid reviewId' }, { status: 400 });
    }

    const ctx        = TenantContext.requireStore('PATCH /api/me/performance/pms/[reviewId]');
    const employeeId = new mongoose.Types.ObjectId(session.employeeId);
    const tenantId   = ctx.tenantId.toString();

    const review = await WorkspacePMSReview.findById(reviewId);
    if (!review) {
      return NextResponse.json({ error: 'Review not found' }, { status: 404 });
    }
    if (review.revieweeId.toString() !== employeeId.toString()) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (review.status === 'locked') {
      return NextResponse.json({ error: 'This review has been locked and can no longer be edited' }, { status: 409 });
    }
    if (review.status === 'submitted') {
      return NextResponse.json({ error: 'This review has already been submitted' }, { status: 409 });
    }
    if (review.status === 'recalled') {
      return NextResponse.json({ error: 'This review has been recalled and can no longer be edited' }, { status: 409 });
    }

    let body: PatchBody;
    try {
      body = (await req.json()) as PatchBody;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const isSubmit = body.submit === true;

    // On submit: verify cycle is still in self_appraisal phase
    if (isSubmit) {
      const cycle = await WorkspaceAppraisalCycle.findById(review.cycleId).lean();
      if (!cycle || cycle.status !== 'self_appraisal') {
        return NextResponse.json(
          { error: 'The self-appraisal window for this cycle has closed' },
          { status: 409 },
        );
      }
    }

    // ── Validate scores (server-side range check before encryption) ─────────
    if (body.ratings !== undefined) {
      for (const r of body.ratings) {
        if (typeof r.score !== 'number' || r.score < 1 || r.score > 10) {
          return NextResponse.json(
            { error: `Score for "${r.dimension}" must be between 1 and 10` },
            { status: 400 },
          );
        }
      }
    }

    // ── Encrypt ratings ──────────────────────────────────────────────────────
    const encryptedRatings = await Promise.all(
      (body.ratings ?? []).map(async (r) => {
        const base: {
          dimension:  string;
          score:      number;
          commentEnc?: Buffer;
          commentIv?:  Buffer;
        } = { dimension: r.dimension, score: r.score };

        if (r.comment !== undefined && r.comment !== null && r.comment !== '') {
          const { enc, iv } = await encryptText(tenantId, r.comment);
          base.commentEnc = enc;
          base.commentIv  = iv;
        }
        return base;
      }),
    );

    // ── Encrypt overall comment ──────────────────────────────────────────────
    let overallCommentEnc: Buffer | undefined;
    let overallCommentIv:  Buffer | undefined;
    if (body.overallComment !== undefined && body.overallComment !== null && body.overallComment !== '') {
      const { enc, iv } = await encryptText(tenantId, body.overallComment);
      overallCommentEnc = enc;
      overallCommentIv  = iv;
    }

    // ── Apply updates ─────────────────────────────────────────────────────────
    // Only replace ratings when the client actually sent them — prevent wipe on partial saves
    if (body.ratings !== undefined) {
      review.ratings = encryptedRatings as typeof review.ratings;
    }

    if (overallCommentEnc !== undefined) {
      review.overallCommentEnc = overallCommentEnc;
      review.overallCommentIv  = overallCommentIv;
    }

    if (isSubmit) {
      review.status      = 'submitted';
      review.submittedAt = new Date();
    } else {
      review.status       = 'draft';
      review.draftSavedAt = new Date();
    }

    await review.save();

    await auditEvent({
      actionType:        isSubmit ? 'SELF_APPRAISAL_SUBMITTED' : 'SELF_APPRAISAL_DRAFT_SAVED',
      targetCollection:  'ws_pms_reviews',
      targetDocumentId:  review._id.toString(),
      newStateHash:      review.status,
      changeSummary:     {
        reviewId:        review._id.toString(),
        cycleId:         review.cycleId.toString(),
        ratingsCount:    encryptedRatings.length,
        hasOverallComment: overallCommentEnc !== undefined,
      },
    });

    return NextResponse.json({
      data: {
        _id:          review._id,
        status:       review.status,
        draftSavedAt: review.draftSavedAt ?? null,
        submittedAt:  review.submittedAt  ?? null,
      },
    });
  });
}
