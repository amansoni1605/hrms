import { NextRequest, NextResponse }   from 'next/server';
import { runWithSession, auditEvent }   from '@/lib/withRoute';
import { WorkspacePerformanceReview }   from '@/models/workspace.models';
import { TenantContext }                from '@/infrastructure/multiTenantCore';
import { notify }                       from '@/lib/notificationService';
import { createHash }                   from 'node:crypto';

// Guard: the review must belong to the authenticated employee.
function ownsReview(review: { employeeId: { toString(): string } }, employeeId?: string | null): boolean {
  return !!employeeId && review.employeeId.toString() === employeeId;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/me/performance/[id]   — employee: own review detail
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return runWithSession(async (session) => {
    const review = await WorkspacePerformanceReview.findById(id).lean();
    if (!review || !ownsReview(review, session.employeeId)) {
      return NextResponse.json({ error: 'Review not found' }, { status: 404 });
    }
    return NextResponse.json({ data: review });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/me/performance/[id]   — employee actions on their own review
//   action 'save'        — save self-assessment draft (stays self_assessment)
//   action 'submit'      — submit self-assessment → manager_review, notify HR
//   action 'acknowledge' — acknowledge a finalized review → acknowledged
// ─────────────────────────────────────────────────────────────────────────────

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return runWithSession(async (session) => {
    const body = await req.json() as {
      action?: 'save' | 'submit' | 'acknowledge';
      summary?: string;
      achievements?: string;
      challenges?: string;
      ackComment?: string;
      competencyRatings?: Array<{ key: string; selfRating?: number; selfComment?: string }>;
    };
    const action = body.action ?? 'save';
    const ctx    = TenantContext.requireStore('PUT /api/me/performance/[id]');

    const review = await WorkspacePerformanceReview.findById(id);
    if (!review || !ownsReview(review, session.employeeId)) {
      return NextResponse.json({ error: 'Review not found' }, { status: 404 });
    }

    if (action === 'acknowledge') {
      if (review.status !== 'finalized') {
        return NextResponse.json({ error: 'Only a finalized review can be acknowledged' }, { status: 400 });
      }
      review.employeeAck.acknowledged   = true;
      review.employeeAck.comment        = body.ackComment;
      review.employeeAck.acknowledgedAt = new Date();
      review.status                     = 'acknowledged';
    } else {
      // save / submit — only valid while the self-assessment phase is open
      if (review.status !== 'self_assessment') {
        return NextResponse.json({ error: 'Self-assessment is no longer editable' }, { status: 400 });
      }

      if (Array.isArray(body.competencyRatings)) {
        const byKey = new Map(body.competencyRatings.map((r) => [r.key, r]));
        for (const c of review.competencies) {
          const upd = byKey.get(c.key);
          if (!upd) continue;
          if (upd.selfRating  !== undefined) c.selfRating  = upd.selfRating;
          if (upd.selfComment !== undefined) c.selfComment = upd.selfComment;
        }
        review.markModified('competencies');
      }

      review.selfAssessment.summary      = body.summary      ?? review.selfAssessment.summary;
      review.selfAssessment.achievements = body.achievements ?? review.selfAssessment.achievements;
      review.selfAssessment.challenges   = body.challenges   ?? review.selfAssessment.challenges;

      if (action === 'submit') {
        review.selfAssessment.submittedAt = new Date();
        review.status                     = 'manager_review';
      }
    }

    await review.save();

    await auditEvent({
      actionType:       action === 'submit' ? 'REVIEW_SELF_SUBMITTED' : action === 'acknowledge' ? 'REVIEW_ACKNOWLEDGED' : 'REVIEW_SELF_SAVED',
      targetCollection: 'ws_performance_reviews',
      targetDocumentId: id,
      newStateHash:     createHash('sha256').update(`${action}:${id}:${Date.now()}`).digest('hex'),
      changeSummary:    { action, status: review.status },
    });

    if (action === 'submit') {
      await notify.reviewSubmitted({
        tenantId:     ctx.tenantId.toString(),
        employeeCode: review.employeeCode,
        cycleLabel:   review.cycleLabel,
        reviewId:     id,
      });
    }

    return NextResponse.json({ data: review });
  });
}
