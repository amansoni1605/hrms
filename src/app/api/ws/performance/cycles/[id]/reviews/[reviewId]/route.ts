import { NextRequest, NextResponse }      from 'next/server';
import { runWithSession }                 from '@/lib/withRoute';
import { WorkspacePMSReview }             from '@/models/pms.models';
import {
  TenantContext,
  getTenantDEK,
  encryptField,
  decryptField,
}                                          from '@/infrastructure/multiTenantCore';
import mongoose                            from 'mongoose';

// GET /api/ws/performance/cycles/[id]/reviews/[reviewId]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; reviewId: string }> },
) {
  const { id, reviewId } = await params;
  return runWithSession(async (session) => {
    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(reviewId)) {
      return NextResponse.json({ error: 'Invalid id or reviewId' }, { status: 400 });
    }

    const ctx    = TenantContext.requireStore('GET /api/ws/performance/cycles/[id]/reviews/[reviewId]');
    const review = await WorkspacePMSReview.findOne({
      _id:     new mongoose.Types.ObjectId(reviewId),
      cycleId: new mongoose.Types.ObjectId(id),
    }).lean();

    if (!review) return NextResponse.json({ error: 'Review not found' }, { status: 404 });

    const isOwn = ctx.employeeId?.toString() === review.revieweeId.toString();
    const isHr  = session.role === 'hr_admin' || session.role === 'super_admin';
    if (!isOwn && !isHr) {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
    }

    const tenantId = ctx.tenantId.toString();

    // Decrypt comment fields
    const decryptedRatings = await Promise.all(
      (review.ratings ?? []).map(async (r) => {
        let comment: string | undefined;
        if (r.commentEnc && r.commentIv) {
          try { comment = await decryptField(tenantId, r.commentEnc); } catch { /* omit on error */ }
        }
        return { ...r, comment };
      }),
    );

    let overallComment: string | undefined;
    if (review.overallCommentEnc && review.overallCommentIv) {
      try { overallComment = await decryptField(tenantId, review.overallCommentEnc); } catch { /* omit on error */ }
    }

    const { overallCommentEnc: _oEnc, overallCommentIv: _oIv, ...rest } = review as typeof review & { overallCommentEnc?: unknown; overallCommentIv?: unknown };
    void _oEnc; void _oIv;

    return NextResponse.json({
      data: {
        ...rest,
        ratings: decryptedRatings,
        overallComment,
      },
    });
  });
}

// PATCH /api/ws/performance/cycles/[id]/reviews/[reviewId]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; reviewId: string }> },
) {
  const { id, reviewId } = await params;
  return runWithSession(async (session) => {
    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(reviewId)) {
      return NextResponse.json({ error: 'Invalid id or reviewId' }, { status: 400 });
    }

    const ctx    = TenantContext.requireStore('PATCH /api/ws/performance/cycles/[id]/reviews/[reviewId]');
    const review = await WorkspacePMSReview.findOne({
      _id:     new mongoose.Types.ObjectId(reviewId),
      cycleId: new mongoose.Types.ObjectId(id),
    });

    if (!review) return NextResponse.json({ error: 'Review not found' }, { status: 404 });

    const isOwn = ctx.employeeId?.toString() === review.revieweeId.toString();
    const isHr  = session.role === 'hr_admin' || session.role === 'super_admin';
    if (!isOwn && !isHr) {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
    }

    const body = await req.json() as Record<string, unknown>;
    const tenantId = ctx.tenantId.toString();

    // Calibration action (hr_admin / super_admin only)
    if ('calibratedScore' in body) {
      if (!isHr) {
        return NextResponse.json({ error: 'FORBIDDEN: calibration requires hr_admin or super_admin' }, { status: 403 });
      }

      const updates: Record<string, unknown> = {
        calibratedScore:    body['calibratedScore'],
        calibrationMethod:  body['calibrationMethod'] ?? 'manual_override',
      };

      if (body['reason']) {
        updates['calibrationOverrideReasonEnc'] = await encryptField(tenantId, String(body['reason']));
      }

      await WorkspacePMSReview.findByIdAndUpdate(reviewId, { $set: updates });
      const updated = await WorkspacePMSReview.findById(reviewId).lean();
      return NextResponse.json({ data: updated });
    }

    // Submit action
    if (body['submit'] === true) {
      if (review.status === 'locked') {
        return NextResponse.json({ error: 'Review is locked' }, { status: 409 });
      }
      if (!review.ratings || review.ratings.length === 0) {
        return NextResponse.json({ error: 'At least one rating is required before submitting' }, { status: 400 });
      }

      await WorkspacePMSReview.findByIdAndUpdate(reviewId, {
        $set: { status: 'submitted', submittedAt: new Date() },
      });
      const updated = await WorkspacePMSReview.findById(reviewId).lean();
      return NextResponse.json({ data: updated });
    }

    // Auto-save draft
    if (review.status === 'locked') {
      return NextResponse.json({ error: 'Review is locked' }, { status: 409 });
    }
    if (review.status !== 'draft') {
      return NextResponse.json({ error: `Review cannot be edited in "${review.status}" status` }, { status: 409 });
    }

    const { key } = await getTenantDEK(tenantId);
    void key; // used implicitly by encryptField

    const updates: Record<string, unknown> = { draftSavedAt: new Date() };

    if (Array.isArray(body['ratings'])) {
      const encryptedRatings = await Promise.all(
        (body['ratings'] as Array<Record<string, unknown>>).map(async (r) => {
          let commentEnc: Buffer | undefined;
          if (r['comment']) {
            commentEnc = await encryptField(tenantId, String(r['comment']));
          }
          return {
            goalId:     r['goalId'] ? new mongoose.Types.ObjectId(String(r['goalId'])) : undefined,
            dimension:  r['dimension'],
            score:      r['score'],
            commentEnc: commentEnc ?? r['commentEnc'],
            commentIv:  Buffer.alloc(0),
          };
        }),
      );
      updates['ratings'] = encryptedRatings;
    }

    if ('overallComment' in body && body['overallComment']) {
      updates['overallCommentEnc'] = await encryptField(tenantId, String(body['overallComment']));
      updates['overallCommentIv']  = Buffer.alloc(0);
    }

    await WorkspacePMSReview.findByIdAndUpdate(reviewId, { $set: updates });
    const updated = await WorkspacePMSReview.findById(reviewId).lean();
    return NextResponse.json({ data: updated });
  });
}
