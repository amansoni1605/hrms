import { NextRequest, NextResponse }           from 'next/server';
import { withFeature }                          from '@/lib/featureGate';
import { auditEvent }                           from '@/lib/withRoute';
import { TenantContext, getTenantDEK }          from '@/infrastructure/multiTenantCore';
import {
  WorkspaceFeedbackEvent,
  type FeedbackType,
  type FeedbackVisibility,
  type FeedbackSentiment,
}                                               from '@/models/pms.models';
import { createCipheriv, randomBytes }          from 'node:crypto';
import { createHash }                           from 'node:crypto';
import mongoose                                 from 'mongoose';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ws/performance/feedback
//
// List feedback events for the tenant, with optional filters.
// Bodies are NOT decrypted here (list view — caller fetches /[id] for detail).
// ─────────────────────────────────────────────────────────────────────────────

export const GET = withFeature('performance', async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const toId       = searchParams.get('toId');
  const fromId     = searchParams.get('fromId');
  const type       = searchParams.get('type');
  const page       = Math.max(1, parseInt(searchParams.get('page')  ?? '1'));
  const limit      = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20')));

  const query: Record<string, unknown> = {};
  if (toId   && mongoose.isValidObjectId(toId))   query['toId']   = new mongoose.Types.ObjectId(toId);
  if (fromId && mongoose.isValidObjectId(fromId)) query['fromId'] = new mongoose.Types.ObjectId(fromId);
  if (type)  query['type'] = type;

  const [data, total] = await Promise.all([
    WorkspaceFeedbackEvent.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-bodyEnc -bodyIv')   // strip encrypted body from list view
      .lean(),
    WorkspaceFeedbackEvent.countDocuments(query),
  ]);

  return NextResponse.json({
    data,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ws/performance/feedback
//
// Create a new feedback event.  Body is AES-256-GCM encrypted at rest.
// ─────────────────────────────────────────────────────────────────────────────

const VALID_TYPES = new Set<FeedbackType>([
  'anytime_feedback', 'shoutout', 'one_on_one_action', 'coaching_note',
]);

const VALID_VISIBILITY = new Set<FeedbackVisibility>([
  'private', 'manager_visible', 'public',
]);

const VALID_SENTIMENT = new Set<FeedbackSentiment>([
  'positive', 'constructive', 'neutral',
]);

export const POST = withFeature('performance', async (req: NextRequest) => {
  const ctx  = TenantContext.requireStore('POST /api/ws/performance/feedback');
  const body = await req.json() as Record<string, unknown>;

  // ── Validate required fields ──────────────────────────────────────────────
  const { toId, type, body: feedbackBody, visibility, tags, cycleId, linkedGoalId, sentiment } = body as {
    toId:          string;
    type:          string;
    body:          string;
    visibility?:   string;
    tags?:         string[];
    cycleId?:      string;
    linkedGoalId?: string;
    sentiment?:    string;
  };

  if (!toId || !type || !feedbackBody) {
    return NextResponse.json(
      { error: 'Missing required fields: toId, type, body' },
      { status: 400 },
    );
  }

  if (!VALID_TYPES.has(type as FeedbackType)) {
    return NextResponse.json(
      { error: `Invalid type. Must be one of: ${[...VALID_TYPES].join(', ')}` },
      { status: 400 },
    );
  }

  if (!mongoose.isValidObjectId(toId)) {
    return NextResponse.json({ error: 'Invalid toId' }, { status: 400 });
  }

  const resolvedVisibility: FeedbackVisibility = VALID_VISIBILITY.has(visibility as FeedbackVisibility)
    ? (visibility as FeedbackVisibility)
    : 'private';

  if (sentiment && !VALID_SENTIMENT.has(sentiment as FeedbackSentiment)) {
    return NextResponse.json(
      { error: `Invalid sentiment. Must be one of: ${[...VALID_SENTIMENT].join(', ')}` },
      { status: 400 },
    );
  }

  // ── Verify fromId is set (employee must be linked) ────────────────────────
  if (!ctx.employeeId) {
    return NextResponse.json(
      { error: 'Session has no associated employee record' },
      { status: 403 },
    );
  }

  // ── Encrypt feedback body (AES-256-GCM) ──────────────────────────────────
  const { key } = await getTenantDEK(ctx.tenantId.toString());
  const iv      = randomBytes(12);
  const cipher  = createCipheriv('aes-256-gcm', key, iv);
  const bodyEnc = Buffer.concat([cipher.update(feedbackBody, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Prepend 16-byte authTag so decryption can self-validate
  const encBuffer = Buffer.concat([authTag, bodyEnc]);

  // ── Build document ────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = await (WorkspaceFeedbackEvent as any).create({
    tenantId:     ctx.tenantId,
    type:         type as FeedbackType,
    fromId:       ctx.employeeId,
    toId:         new mongoose.Types.ObjectId(toId),
    visibility:   resolvedVisibility,
    tags:         Array.isArray(tags) ? tags.filter((t) => typeof t === 'string') : [],
    bodyEnc:      encBuffer,
    bodyIv:       iv,
    ...(cycleId      && mongoose.isValidObjectId(cycleId)      && { cycleId:      new mongoose.Types.ObjectId(cycleId) }),
    ...(linkedGoalId && mongoose.isValidObjectId(linkedGoalId) && { linkedGoalId: new mongoose.Types.ObjectId(linkedGoalId) }),
    ...(sentiment && VALID_SENTIMENT.has(sentiment as FeedbackSentiment) && { sentiment: sentiment as FeedbackSentiment }),
  });

  // ── Audit public shoutouts ────────────────────────────────────────────────
  if (type === 'shoutout' && resolvedVisibility === 'public') {
    await auditEvent({
      actionType:       'SHOUTOUT_GIVEN',
      targetCollection: 'ws_feedback_events',
      targetDocumentId: doc._id.toString(),
      newStateHash:     createHash('sha256')
        .update(`${doc._id}:${ctx.employeeId}:${toId}:${Date.now()}`)
        .digest('hex'),
      changeSummary: {
        fromId:     ctx.employeeId.toString(),
        toId,
        visibility: resolvedVisibility,
      },
    });
  }

  // Strip encrypted payload from response — caller can fetch /[id] to decrypt
  const { bodyEnc: _bEnc, bodyIv: _bIv, ...rest } = doc.toObject();
  return NextResponse.json({ data: rest }, { status: 201 });
});
