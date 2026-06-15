/**
 * ============================================================================
 * PMS MODELS  —  Performance Management System
 * src/models/pms.models.ts
 *
 * All PMS Mongoose models in a single file (mirrors workspace.models.ts ADR).
 * These are ADDITIVE — they do not redefine WorkspaceGoal (ws_goals) or
 * WorkspacePerformanceReview (ws_performance_reviews).
 *
 * Collections:
 *   WorkspaceAppraisalCycle    → 'ws_appraisal_cycles'
 *   WorkspaceOrgNode           → 'ws_org_nodes'
 *   WorkspacePMSReview         → 'ws_pms_reviews'
 *   WorkspacePeerNomination    → 'ws_peer_nominations'
 *   WorkspaceFeedbackEvent     → 'ws_feedback_events'
 *   WorkspacePIP               → 'ws_pips'
 *   WorkspaceIncrementMatrix   → 'ws_increment_matrices'
 * ============================================================================
 */

import mongoose, {
  Schema,
  model,
  type Model,
  type Document,
  type Types,
} from 'mongoose';

// ─────────────────────────────────────────────────────────────────────────────
// Shared Enumerations
// ─────────────────────────────────────────────────────────────────────────────

export type CycleStatus =
  | 'draft'
  | 'cycle_initiated'
  | 'self_appraisal'
  | 'manager_review'
  | 'peer_360'
  | 'calibration'
  | 'approved_hr'
  | 'signed_off'
  | 'archived';

export type PhaseKey =
  | 'cycle_initiated'
  | 'self_appraisal'
  | 'manager_review'
  | 'peer_360'
  | 'calibration'
  | 'approved_hr'
  | 'signed_off';

export const ALLOWED_TRANSITIONS: Record<CycleStatus, CycleStatus[]> = {
  draft:           ['cycle_initiated'],
  cycle_initiated: ['self_appraisal'],
  self_appraisal:  ['manager_review'],
  manager_review:  ['peer_360', 'calibration'],
  peer_360:        ['calibration'],
  calibration:     ['approved_hr'],
  approved_hr:     ['signed_off'],
  signed_off:      ['archived'],
  archived:        [],
};

// ─────────────────────────────────────────────────────────────────────────────
// §1  WorkspaceAppraisalCycle  →  ws_appraisal_cycles
// ─────────────────────────────────────────────────────────────────────────────

export interface IWAppraisalCycle extends Document {
  tenantId:    Types.ObjectId;
  name:        string;
  type:        'annual' | 'half_year' | 'quarterly' | 'probation';
  status:      CycleStatus;
  startDate:   Date;
  endDate:     Date;
  phases: Array<{
    phase:            PhaseKey;
    opensAt:          Date;
    closesAt:         Date;
    gracePeriodHours: number;
  }>;
  formulaConfig: {
    components: Array<{ source: string; weight: number }>;
    scale:      { min: number; max: number };
  };
  calibrationConfig: {
    targetBands: Array<{
      label:  string;
      minPct: number;
      maxPct: number;
      color:  string;
    }>;
    normalizeEnabled: boolean;
  };
  pipThreshold: number;
  enable360:    boolean;
  statusLog: Array<{
    from:    string;
    to:      string;
    actorId: Types.ObjectId;
    at:      Date;
  }>;
  createdById?: Types.ObjectId;
  isActive:     boolean;
  createdAt:    Date;
  updatedAt:    Date;
}

const WAppraisalCycleSchema = new Schema<IWAppraisalCycle>(
  {
    tenantId:  { type: Schema.Types.ObjectId, required: true, immutable: true },
    name:      { type: String, required: true, trim: true },
    type:      { type: String, enum: ['annual', 'half_year', 'quarterly', 'probation'], required: true },
    status:    {
      type: String,
      enum: ['draft','cycle_initiated','self_appraisal','manager_review','peer_360','calibration','approved_hr','signed_off','archived'],
      required: true,
      default: 'draft',
    },
    startDate: { type: Date, required: true },
    endDate:   { type: Date, required: true },
    phases: [
      {
        phase:            { type: String, enum: ['cycle_initiated','self_appraisal','manager_review','peer_360','calibration','approved_hr','signed_off'], required: true },
        opensAt:          { type: Date, required: true },
        closesAt:         { type: Date, required: true },
        gracePeriodHours: { type: Number, default: 24 },
        _id:              false,
      },
    ],
    formulaConfig: {
      components: [
        {
          source: { type: String },
          weight: { type: Number },
          _id:    false,
        },
      ],
      scale: {
        min: { type: Number, default: 1 },
        max: { type: Number, default: 5 },
      },
    },
    calibrationConfig: {
      targetBands: [
        {
          label:  { type: String },
          minPct: { type: Number },
          maxPct: { type: Number },
          color:  { type: String },
          _id:    false,
        },
      ],
      normalizeEnabled: { type: Boolean, default: false },
    },
    pipThreshold: { type: Number, default: 2 },
    enable360:    { type: Boolean, default: false },
    statusLog: [
      {
        from:    { type: String },
        to:      { type: String },
        actorId: { type: Schema.Types.ObjectId },
        at:      { type: Date },
        _id:     false,
      },
    ],
    createdById: { type: Schema.Types.ObjectId },
    isActive:    { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'ws_appraisal_cycles' },
);

WAppraisalCycleSchema.index({ tenantId: 1, status: 1 });
WAppraisalCycleSchema.index({ tenantId: 1, isActive: 1, endDate: -1 });

export const WorkspaceAppraisalCycle: Model<IWAppraisalCycle> =
  (mongoose.models['WorkspaceAppraisalCycle'] as Model<IWAppraisalCycle>) ??
  model<IWAppraisalCycle>('WorkspaceAppraisalCycle', WAppraisalCycleSchema);

// ─────────────────────────────────────────────────────────────────────────────
// §2  WorkspaceOrgNode  →  ws_org_nodes
// ─────────────────────────────────────────────────────────────────────────────

export interface IWOrgNode extends Document {
  tenantId:        Types.ObjectId;
  employeeId:      Types.ObjectId;
  ancestorPath:    Types.ObjectId[];
  depth:           number;
  departmentId?:   Types.ObjectId;
  matrixManagerIds: Types.ObjectId[];
  effectiveFrom:   Date;
  effectiveTo:     Date | null;
  createdAt:       Date;
  updatedAt:       Date;
}

const WOrgNodeSchema = new Schema<IWOrgNode>(
  {
    tenantId:         { type: Schema.Types.ObjectId, required: true, immutable: true },
    employeeId:       { type: Schema.Types.ObjectId, required: true, ref: 'WorkspaceEmployee' },
    ancestorPath:     [{ type: Schema.Types.ObjectId }],
    depth:            { type: Number, default: 0 },
    departmentId:     { type: Schema.Types.ObjectId },
    matrixManagerIds: [{ type: Schema.Types.ObjectId }],
    effectiveFrom:    { type: Date, required: true },
    effectiveTo:      { type: Date, default: null },
  },
  { timestamps: true, collection: 'ws_org_nodes' },
);

WOrgNodeSchema.index({ tenantId: 1, employeeId: 1, effectiveTo: 1 });
WOrgNodeSchema.index({ tenantId: 1, ancestorPath: 1 });

export const WorkspaceOrgNode: Model<IWOrgNode> =
  (mongoose.models['WorkspaceOrgNode'] as Model<IWOrgNode>) ??
  model<IWOrgNode>('WorkspaceOrgNode', WOrgNodeSchema);

// ─────────────────────────────────────────────────────────────────────────────
// §3  WorkspacePMSReview  →  ws_pms_reviews
// ─────────────────────────────────────────────────────────────────────────────

export type ReviewerRole = 'self' | 'manager' | 'skip_level' | 'peer' | 'hr';
export type ReviewStatus = 'draft' | 'submitted' | 'locked' | 'recalled';
export type CalibrationMethod = 'normalized' | 'manual_override';

export interface IWPMSReview extends Document {
  tenantId:       Types.ObjectId;
  cycleId:        Types.ObjectId;
  revieweeId:     Types.ObjectId;
  reviewerId:     Types.ObjectId;
  reviewerUserId?: Types.ObjectId;
  reviewerRole:   ReviewerRole;
  isAnonymous:    boolean;
  status:         ReviewStatus;
  draftSavedAt?:  Date;
  submittedAt?:   Date;
  lockedAt?:      Date;
  ratings: Array<{
    goalId:      Types.ObjectId;
    dimension:   string;
    score:       number;
    commentEnc:  Buffer;
    commentIv:   Buffer;
  }>;
  overallCommentEnc?:          Buffer;
  overallCommentIv?:           Buffer;
  finalScore?:                 number;
  calibratedScore?:            number;
  calibrationMethod?:          CalibrationMethod;
  calibrationOverrideReasonEnc?: Buffer;
  pipTriggered:                boolean;
  createdAt:                   Date;
  updatedAt:                   Date;
}

const WPMSReviewSchema = new Schema<IWPMSReview>(
  {
    tenantId:       { type: Schema.Types.ObjectId, required: true, immutable: true },
    cycleId:        { type: Schema.Types.ObjectId, required: true, ref: 'WorkspaceAppraisalCycle' },
    revieweeId:     { type: Schema.Types.ObjectId, required: true, ref: 'WorkspaceEmployee' },
    reviewerId:     { type: Schema.Types.ObjectId, required: true, ref: 'WorkspaceEmployee' },
    reviewerUserId: { type: Schema.Types.ObjectId },
    reviewerRole:   { type: String, enum: ['self','manager','skip_level','peer','hr'], required: true },
    isAnonymous:    { type: Boolean, default: false },
    status:         { type: String, enum: ['draft','submitted','locked','recalled'], required: true, default: 'draft' },
    draftSavedAt:   { type: Date },
    submittedAt:    { type: Date },
    lockedAt:       { type: Date },
    ratings: [
      {
        goalId:     { type: Schema.Types.ObjectId },
        dimension:  { type: String },
        score:      { type: Number, min: 1, max: 10 },
        commentEnc: { type: Buffer },
        commentIv:  { type: Buffer },
      },
    ],
    overallCommentEnc:          { type: Buffer },
    overallCommentIv:           { type: Buffer },
    finalScore:                 { type: Number },
    calibratedScore:            { type: Number },
    calibrationMethod:          { type: String, enum: ['normalized','manual_override'] },
    calibrationOverrideReasonEnc: { type: Buffer },
    pipTriggered:               { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'ws_pms_reviews' },
);

WPMSReviewSchema.index({ tenantId: 1, cycleId: 1, revieweeId: 1, reviewerRole: 1 }, { unique: true });
WPMSReviewSchema.index({ tenantId: 1, cycleId: 1, status: 1 });

export const WorkspacePMSReview: Model<IWPMSReview> =
  (mongoose.models['WorkspacePMSReview'] as Model<IWPMSReview>) ??
  model<IWPMSReview>('WorkspacePMSReview', WPMSReviewSchema);

// ─────────────────────────────────────────────────────────────────────────────
// §4  WorkspacePeerNomination  →  ws_peer_nominations
// ─────────────────────────────────────────────────────────────────────────────

export type NominationStatus = 'pending_approval' | 'approved' | 'rejected' | 'completed';

export interface IWPeerNomination extends Document {
  tenantId:            Types.ObjectId;
  cycleId:             Types.ObjectId;
  revieweeId:          Types.ObjectId;
  nominatedBy?:        Types.ObjectId;
  nomineeId:           Types.ObjectId;
  status:              NominationStatus;
  approvedBy?:         Types.ObjectId;
  rejectionReasonEnc?: Buffer;
  createdAt:           Date;
  updatedAt:           Date;
}

const WPeerNominationSchema = new Schema<IWPeerNomination>(
  {
    tenantId:           { type: Schema.Types.ObjectId, required: true, immutable: true },
    cycleId:            { type: Schema.Types.ObjectId, required: true },
    revieweeId:         { type: Schema.Types.ObjectId, required: true },
    nominatedBy:        { type: Schema.Types.ObjectId },
    nomineeId:          { type: Schema.Types.ObjectId, required: true },
    status:             { type: String, enum: ['pending_approval','approved','rejected','completed'], required: true, default: 'pending_approval' },
    approvedBy:         { type: Schema.Types.ObjectId },
    rejectionReasonEnc: { type: Buffer },
  },
  { timestamps: true, collection: 'ws_peer_nominations' },
);

WPeerNominationSchema.index({ tenantId: 1, cycleId: 1, revieweeId: 1 });
WPeerNominationSchema.index({ tenantId: 1, cycleId: 1, nomineeId: 1 });

export const WorkspacePeerNomination: Model<IWPeerNomination> =
  (mongoose.models['WorkspacePeerNomination'] as Model<IWPeerNomination>) ??
  model<IWPeerNomination>('WorkspacePeerNomination', WPeerNominationSchema);

// ─────────────────────────────────────────────────────────────────────────────
// §5  WorkspaceFeedbackEvent  →  ws_feedback_events
// ─────────────────────────────────────────────────────────────────────────────

export type FeedbackType       = 'anytime_feedback' | 'shoutout' | 'one_on_one_action' | 'coaching_note';
export type FeedbackVisibility = 'private' | 'manager_visible' | 'public';
export type FeedbackSentiment  = 'positive' | 'constructive' | 'neutral';

export interface IWFeedbackEvent extends Document {
  tenantId:               Types.ObjectId;
  type:                   FeedbackType;
  fromId:                 Types.ObjectId;
  toId:                   Types.ObjectId;
  visibility:             FeedbackVisibility;
  tags:                   string[];
  bodyEnc:                Buffer;
  bodyIv:                 Buffer;
  cycleId?:               Types.ObjectId;
  linkedGoalId?:          Types.ObjectId;
  sentiment?:             FeedbackSentiment;
  aggregatedIntoCycleId?: Types.ObjectId;
  createdAt:              Date;
  updatedAt:              Date;
}

const WFeedbackEventSchema = new Schema<IWFeedbackEvent>(
  {
    tenantId:               { type: Schema.Types.ObjectId, required: true, immutable: true },
    type:                   { type: String, enum: ['anytime_feedback','shoutout','one_on_one_action','coaching_note'], required: true },
    fromId:                 { type: Schema.Types.ObjectId, required: true, ref: 'WorkspaceEmployee' },
    toId:                   { type: Schema.Types.ObjectId, required: true, ref: 'WorkspaceEmployee' },
    visibility:             { type: String, enum: ['private','manager_visible','public'], required: true, default: 'private' },
    tags:                   [{ type: String }],
    bodyEnc:                { type: Buffer, required: true },
    bodyIv:                 { type: Buffer, required: true },
    cycleId:                { type: Schema.Types.ObjectId },
    linkedGoalId:           { type: Schema.Types.ObjectId },
    sentiment:              { type: String, enum: ['positive','constructive','neutral'] },
    aggregatedIntoCycleId:  { type: Schema.Types.ObjectId },
  },
  { timestamps: true, collection: 'ws_feedback_events' },
);

WFeedbackEventSchema.index({ tenantId: 1, toId: 1, createdAt: -1 });
WFeedbackEventSchema.index({ tenantId: 1, fromId: 1, createdAt: -1 });
WFeedbackEventSchema.index({ tenantId: 1, cycleId: 1 });

export const WorkspaceFeedbackEvent: Model<IWFeedbackEvent> =
  (mongoose.models['WorkspaceFeedbackEvent'] as Model<IWFeedbackEvent>) ??
  model<IWFeedbackEvent>('WorkspaceFeedbackEvent', WFeedbackEventSchema);

// ─────────────────────────────────────────────────────────────────────────────
// §6  WorkspacePIP  →  ws_pips
// ─────────────────────────────────────────────────────────────────────────────

export type PIPStatus         = 'draft' | 'active' | 'checkpoint' | 'completed' | 'escalated' | 'terminated';
export type PIPObjectiveStatus = 'pending' | 'met' | 'missed';
export type PIPCheckpointStatus = 'on_track' | 'at_risk' | 'failed';
export type PIPOutcome        = 'improved' | 'terminated' | 'extended';

export interface IWPIPObjective {
  description:   string;
  successMetric: string;
  dueDate:       Date;
  status:        PIPObjectiveStatus;
}

export interface IWPIPCheckpoint {
  date:            Date;
  managerNotesEnc: Buffer;
  hrNotesEnc:      Buffer;
  status:          PIPCheckpointStatus;
}

export interface IWPIP extends Document {
  tenantId:        Types.ObjectId;
  employeeId:      Types.ObjectId;
  cycleId?:        Types.ObjectId;
  triggeredScore?: number;
  triggerThreshold?: number;
  status:          PIPStatus;
  managerId?:      Types.ObjectId;
  hrOwnerId?:      Types.ObjectId;
  startDate?:      Date;
  reviewDates:     Date[];
  objectives:      IWPIPObjective[];
  checkpoints:     IWPIPCheckpoint[];
  outcome?:        PIPOutcome;
  notifiedAt?:     Date;
  createdAt:       Date;
  updatedAt:       Date;
}

const WPIPObjectiveSchema = new Schema<IWPIPObjective>(
  {
    description:   { type: String, trim: true },
    successMetric: { type: String },
    dueDate:       { type: Date },
    status:        { type: String, enum: ['pending','met','missed'], default: 'pending' },
  },
);

const WPIPCheckpointSchema = new Schema<IWPIPCheckpoint>(
  {
    date:            { type: Date },
    managerNotesEnc: { type: Buffer },
    hrNotesEnc:      { type: Buffer },
    status:          { type: String, enum: ['on_track','at_risk','failed'] },
  },
);

const WPIPSchema = new Schema<IWPIP>(
  {
    tenantId:         { type: Schema.Types.ObjectId, required: true, immutable: true },
    employeeId:       { type: Schema.Types.ObjectId, required: true },
    cycleId:          { type: Schema.Types.ObjectId },
    triggeredScore:   { type: Number },
    triggerThreshold: { type: Number },
    status:           { type: String, enum: ['draft','active','checkpoint','completed','escalated','terminated'], required: true, default: 'draft' },
    managerId:        { type: Schema.Types.ObjectId },
    hrOwnerId:        { type: Schema.Types.ObjectId },
    startDate:        { type: Date },
    reviewDates:      [{ type: Date }],
    objectives:       [WPIPObjectiveSchema],
    checkpoints:      [WPIPCheckpointSchema],
    outcome:          { type: String, enum: ['improved','terminated','extended'] },
    notifiedAt:       { type: Date },
  },
  { timestamps: true, collection: 'ws_pips' },
);

WPIPSchema.index({ tenantId: 1, employeeId: 1, status: 1 });
WPIPSchema.index({ tenantId: 1, cycleId: 1 });

export const WorkspacePIP: Model<IWPIP> =
  (mongoose.models['WorkspacePIP'] as Model<IWPIP>) ??
  model<IWPIP>('WorkspacePIP', WPIPSchema);

// ─────────────────────────────────────────────────────────────────────────────
// §7  WorkspaceIncrementMatrix  →  ws_increment_matrices
// ─────────────────────────────────────────────────────────────────────────────

export type TenureBucket = '0-2y' | '2-5y' | '5y+';

export interface IWIncrementMatrixRow {
  ratingBand:      string;
  salaryBand:      string;
  tenureBucket:    TenureBucket;
  incrementPct:    number;
  maxIncrementAmt: number;
}

export interface IWIncrementMatrix extends Document {
  tenantId: Types.ObjectId;
  cycleId:  Types.ObjectId;
  rows:     IWIncrementMatrixRow[];
  createdAt: Date;
  updatedAt: Date;
}

const WIncrementMatrixSchema = new Schema<IWIncrementMatrix>(
  {
    tenantId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    cycleId:  { type: Schema.Types.ObjectId, required: true },
    rows: [
      {
        ratingBand:      { type: String },
        salaryBand:      { type: String },
        tenureBucket:    { type: String, enum: ['0-2y','2-5y','5y+'] },
        incrementPct:    { type: Number, min: 0, max: 100 },
        maxIncrementAmt: { type: Number },
      },
    ],
  },
  { timestamps: true, collection: 'ws_increment_matrices' },
);

WIncrementMatrixSchema.index({ tenantId: 1, cycleId: 1 }, { unique: true });

export const WorkspaceIncrementMatrix: Model<IWIncrementMatrix> =
  (mongoose.models['WorkspaceIncrementMatrix'] as Model<IWIncrementMatrix>) ??
  model<IWIncrementMatrix>('WorkspaceIncrementMatrix', WIncrementMatrixSchema);

// ─────────────────────────────────────────────────────────────────────────────
// Barrel re-export for convenient single-line imports in route files
// ─────────────────────────────────────────────────────────────────────────────

export const PMSModels = {
  AppraisalCycle:    WorkspaceAppraisalCycle,
  OrgNode:           WorkspaceOrgNode,
  PMSReview:         WorkspacePMSReview,
  PeerNomination:    WorkspacePeerNomination,
  FeedbackEvent:     WorkspaceFeedbackEvent,
  PIP:               WorkspacePIP,
  IncrementMatrix:   WorkspaceIncrementMatrix,
} as const;

export default PMSModels;
