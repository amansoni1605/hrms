import { NextRequest, NextResponse }   from 'next/server';
import { runWithSession, auditEvent }   from '@/lib/withRoute';
import { WorkspacePerformanceReview, WorkspaceEmployee } from '@/models/workspace.models';
import { getManagementChain, relationshipOf, needsTwoStep } from '@/lib/orgChain';
import { TenantContext }                from '@/infrastructure/multiTenantCore';
import { notify }                       from '@/lib/notificationService';
import { createHash }                   from 'node:crypto';

interface CompRecommendation {
  promotion?:     boolean;
  proposedTitle?: string;
  proposedBand?:  string;
  incrementPct?:  number;
  justification?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/performance/[id]   — HR/Admin: full review detail
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return runWithSession(async () => {
    const review = await WorkspacePerformanceReview.findById(id).lean();
    if (!review) return NextResponse.json({ error: 'Review not found' }, { status: 404 });
    return NextResponse.json({ data: review });
  }, ['super_admin', 'hr_admin', 'hr_manager']);
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/performance/[id]   — HR/Admin: manager evaluation
//   action 'save'     — save manager ratings/comments (stays in manager_review)
//   action 'finalize' — lock the review, compute overall rating, notify employee
// ─────────────────────────────────────────────────────────────────────────────

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return runWithSession(async (session) => {
    const body = await req.json() as {
      action?: 'save' | 'finalize';
      summary?: string;
      areasOfStrength?: string;
      areasToImprove?: string;
      overallRating?: number;
      competencyRatings?: Array<{ key: string; managerRating?: number; managerComment?: string }>;
      compensation?: CompRecommendation;
    };
    const action = body.action ?? 'save';
    const ctx    = TenantContext.requireStore('PUT /api/performance/[id]');

    const review = await WorkspacePerformanceReview.findById(id);
    if (!review) return NextResponse.json({ error: 'Review not found' }, { status: 404 });

    // Merge manager ratings into the co-located competency rows
    if (Array.isArray(body.competencyRatings)) {
      const byKey = new Map(body.competencyRatings.map((r) => [r.key, r]));
      for (const c of review.competencies) {
        const upd = byKey.get(c.key);
        if (!upd) continue;
        if (upd.managerRating  !== undefined) c.managerRating  = upd.managerRating;
        if (upd.managerComment !== undefined) c.managerComment = upd.managerComment;
      }
      review.markModified('competencies');
    }

    review.managerReview.summary         = body.summary         ?? review.managerReview.summary;
    review.managerReview.areasOfStrength = body.areasOfStrength ?? review.managerReview.areasOfStrength;
    review.managerReview.areasToImprove  = body.areasToImprove  ?? review.managerReview.areasToImprove;
    review.managerReview.reviewerId      = ctx.userId;
    if (body.overallRating !== undefined) review.managerReview.overallRating = body.overallRating;

    if (action === 'finalize') {
      // Fall back to the average of manager competency ratings if no explicit overall given
      const rated = review.competencies.map((c) => c.managerRating).filter((n): n is number => typeof n === 'number');
      const avg   = rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : undefined;
      const overall = review.managerReview.overallRating ?? (avg ? Math.round(avg * 10) / 10 : undefined);

      if (overall === undefined) {
        return NextResponse.json({ error: 'Provide an overall rating or rate at least one competency before finalizing' }, { status: 400 });
      }

      review.managerReview.overallRating = overall;
      review.managerReview.submittedAt   = new Date();
      review.overallRating               = overall;
      review.status                      = 'finalized';

      // Optional compensation recommendation attached at finalize time.
      const c = body.compensation;
      const hasRec = !!c && ((c.incrementPct ?? 0) > 0 || c.promotion === true);
      if (hasRec && c) {
        const pct       = c.incrementPct ?? 0;
        const promotion = !!c.promotion;

        // Walk the employee's reporting chain to classify the recommender and
        // locate the skip-level (2nd-line) manager for two-step routing.
        const chain        = await getManagementChain(review.employeeId);
        const relationship = relationshipOf(chain, ctx.employeeId);
        const skipLevelMgr = chain[1];   // 2nd-line manager (may be undefined)
        const twoStep      = needsTwoStep(promotion, pct);

        review.compensation.recommended             = true;
        review.compensation.recommendedById         = ctx.userId;
        review.compensation.recommendedByEmpId      = ctx.employeeId ?? undefined;
        review.compensation.recommendedByManager    = relationship === 'direct';
        review.compensation.recommenderRelationship = relationship;
        review.compensation.recommendedAt           = new Date();
        review.compensation.promotion        = promotion;
        review.compensation.proposedTitle     = c.proposedTitle;
        review.compensation.proposedBand      = c.proposedBand;
        review.compensation.incrementPct      = pct;
        review.compensation.justification      = c.justification;

        // Build the approval chain: two-step (skip-level → HR) for promotions or
        // large increments; single HR step otherwise.
        review.compensation.requiresTwoStep    = twoStep;
        review.compensation.skipLevelManagerId = twoStep ? skipLevelMgr : undefined;
        review.compensation.currentStep        = twoStep ? 'skip_level' : 'hr';
        review.compensation.approvals          = twoStep
          ? [{ step: 'skip_level', status: 'pending' }, { step: 'hr', status: 'pending' }]
          : [{ step: 'hr', status: 'pending' }];
        review.compensation.decision           = 'pending';
        review.markModified('compensation');
      }
    } else {
      review.status = 'manager_review';
    }

    await review.save();

    await auditEvent({
      actionType:       action === 'finalize' ? 'REVIEW_FINALIZED' : 'REVIEW_UPDATED',
      targetCollection: 'ws_performance_reviews',
      targetDocumentId: id,
      newStateHash:     createHash('sha256').update(`${action}:${id}:${Date.now()}`).digest('hex'),
      changeSummary:    { action, status: review.status, overallRating: review.overallRating, compDecision: review.compensation.decision },
    });

    if (action === 'finalize') {
      await notify.reviewFinalized({
        tenantId:      ctx.tenantId.toString(),
        employeeId:    review.employeeId.toString(),
        cycleLabel:    review.cycleLabel,
        overallRating: review.overallRating ?? 0,
        reviewId:      id,
      });
      if (review.compensation.decision === 'pending') {
        if (review.compensation.requiresTwoStep && review.compensation.currentStep === 'skip_level') {
          // Two-step: the skip-level manager endorses first. Notify them (or, if
          // no skip-level manager exists, fall back to notifying HR approvers).
          if (review.compensation.skipLevelManagerId) {
            await notify.compEndorsementNeeded({
              tenantId:     ctx.tenantId.toString(),
              employeeId:   review.compensation.skipLevelManagerId.toString(),
              employeeCode: review.employeeCode,
              cycleLabel:   review.cycleLabel,
              incrementPct: review.compensation.incrementPct,
              promotion:    review.compensation.promotion,
              reviewId:     id,
            });
          } else {
            await notify.compRecommended({
              tenantId: ctx.tenantId.toString(), employeeCode: review.employeeCode,
              cycleLabel: review.cycleLabel, incrementPct: review.compensation.incrementPct,
              promotion: review.compensation.promotion, reviewId: id,
            });
          }
        } else {
          // Single-step: straight to HR approvers.
          await notify.compRecommended({
            tenantId:     ctx.tenantId.toString(),
            employeeCode: review.employeeCode,
            cycleLabel:   review.cycleLabel,
            incrementPct: review.compensation.incrementPct,
            promotion:    review.compensation.promotion,
            reviewId:     id,
          });
        }
      }
    }

    return NextResponse.json({ data: review });
  }, ['super_admin', 'hr_admin', 'hr_manager']);
}
