/**
 * ============================================================================
 * FILE 2 OF 3  —  The Unified Hybrid Employee & Workspace Schema
 * src/models/workspace.models.ts
 *
 * All Mongoose models defined in a single file to eliminate circular imports
 * and simplify cross-schema references. These are the canonical production
 * models used by all workspace API routes and dashboard components.
 *
 * Collections:
 *   Tenant                  (global — not tenant-scoped)
 *   WorkspaceUser           → 'ws_users'
 *   WorkspaceDepartment     → 'ws_departments'
 *   WorkspaceEmployee       → 'ws_employees'   (ADR-001 embedded, AES-256-GCM PII)
 *   WorkspaceLeaveRequest   → 'ws_leave_requests'
 *   WorkspaceLeaveBalance   → 'ws_leave_balances'
 *   WorkspacePayrollRun     → 'ws_payroll_runs'
 *   WorkspaceCommsTemplate  → 'ws_comms_templates'
 *   WorkspaceNotifLog       → 'ws_notification_logs'  (2-yr TTL — ADR-007)
 *   WorkspaceAuditTrail     → 'ws_audit_trail'        (append-only HMAC chain)
 * ============================================================================
 */

import { createHash, createHmac } from 'node:crypto';
import mongoose, {
  Schema,
  model,
  type Model,
  type Document,
  type Types,
  type HydratedDocument,
} from 'mongoose';
import {
  TenantContext,
  computeLookupHash,
  encryptEmployeeFields,
  type PlainEmployeeFields,
  type EncryptedEmployeeFields,
  type DeviceTrustLevel,
} from '../infrastructure/multiTenantCore';
import bcrypt from 'bcryptjs';

// ─────────────────────────────────────────────────────────────────────────────
// Shared Enumerations
// ─────────────────────────────────────────────────────────────────────────────

export type UserRole =
  | 'super_admin' | 'hr_admin' | 'hr_manager' | 'payroll_officer'
  | 'finance_auditor' | 'compliance_officer' | 'employee' | 'digital_worker' | 'readonly';

export type EmployeeStatus =
  | 'pre_hire' | 'active' | 'on_leave' | 'pip'
  | 'suspended' | 'terminated' | 'retired';

export type EmploymentType =
  | 'full_time' | 'part_time' | 'contractor' | 'intern' | 'advisor' | 'digital_worker';

export type SkillProficiency = 'awareness' | 'working' | 'practitioner' | 'expert' | 'authority';
export type GrantType        = 'esop' | 'rsu' | 'sar' | 'phantom';
export type GrantStatus      = 'active' | 'exercised' | 'expired' | 'cancelled';
export type AssetState       = 'pending' | 'provisioned' | 'suspended' | 'deprovisioned' | 'failed';
export type LeaveStatus      = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type LeaveType        = 'annual' | 'sick' | 'maternity' | 'paternity' | 'unpaid' | 'compensatory';
export type PayrollStatus    = 'draft' | 'agentic_audit_queued' | 'audit_passed' | 'audit_failed' | 'approved' | 'processing' | 'paid' | 'reversed' | 'cancelled';
export type DeliveryStatus   = 'queued' | 'rendering' | 'dispatched' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'spam_flagged' | 'failed' | 'cancelled';
export type NexusRisk        = 'safe' | 'watch' | 'at_risk' | 'triggered';
export type VerifyStatus     = 'pending' | 'in_progress' | 'verified' | 'failed' | 'expired';

// ADR-001 embedding limits
const LIMITS = { SKILLS: 20, ASSETS: 10, VESTING: 20, IMMIGRATION: 20, STATUTORY: 10 } as const;

// Shared `(schema as any).pre()` helper — bypasses Mongoose v9 strict overloads
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hookPre = (s: Schema, event: string, fn: (...a: any[]) => any) =>
  (s as unknown as Record<string, (...a: unknown[]) => unknown>).pre(event, fn);

// ─────────────────────────────────────────────────────────────────────────────
// §1  TENANT  (global — plugin skips this collection)
// ─────────────────────────────────────────────────────────────────────────────

const TenantSchema = new Schema(
  {
    slug:            { type: String, required: true, unique: true, lowercase: true, trim: true, match: /^[a-z0-9][a-z0-9\-]{1,61}[a-z0-9]$/ },
    legalName:       { type: String, required: true, trim: true },
    primaryCountry:  { type: String, required: true, uppercase: true, maxlength: 2 },
    primaryCurrency: { type: String, default: 'USD', uppercase: true, maxlength: 3 },
    kmsConfig: {
      provider:      { type: String, enum: ['local', 'aws_kms', 'gcp_kms', 'azure_kv'], default: 'local' },
      masterKeyId:   { type: String, default: '' },
      region:        { type: String },
      wrappedDek:    { type: Buffer },
      keyAltName:    { type: String },
      rotationCycle: { type: Number, default: 0, min: 0 },
    },
    commProvider: {
      provider:    { type: String, enum: ['sendgrid', 'aws_ses', 'postmark', 'resend'] },
      apiKeyEnc:   { type: Buffer },
      fromAddress: { type: String, trim: true },
      fromName:    { type: String, trim: true },
    },
    subscription: {
      tier:     { type: String, enum: ['starter', 'growth', 'enterprise', 'global'], default: 'enterprise' },
      maxSeats: { type: Number, default: 1000, min: 1 },
      usedSeats:{ type: Number, default: 0, min: 0 },
      features: [{ type: String }],
      renewsAt: { type: Date },
    },
    ztPolicy: {
      deviceComplianceRequired:   { type: Boolean, default: true },
      heartbeatIntervalSeconds:   { type: Number, default: 300 },
      autoRevokeOnNonCompliance:  { type: Boolean, default: true },
    },

    // ── Branding ────────────────────────────────────────────────────
    // logoData: base64 data-URL (data:image/png;base64,...) stored directly.
    // Kept on the tenant doc so it survives without external storage.
    logoData:       { type: String },   // base64 data-URL, max ~200 KB after validation
    loginBgData:    { type: String },   // base64 data-URL for login page background, max ~1.5 MB
    loginBgOverlay: { type: Number, default: 0.45, min: 0, max: 0.9 }, // dark overlay opacity
    brandColor:     { type: String, default: '#1C509D', match: /^#[0-9A-Fa-f]{6}$/ },
    loginTagline:   { type: String, trim: true, maxlength: 120 },

    // ── Company profile ─────────────────────────────────────────────
    displayName:   { type: String, trim: true },   // short name shown in UI ("Acme" vs legal "Acme Corp Pvt Ltd")
    industry:      { type: String, trim: true },
    companySize:   { type: String, enum: ['1-50','51-200','201-1000','1001-5000','5000+'] },
    websiteUrl:    { type: String, trim: true },
    billingEmail:  { type: String, trim: true, lowercase: true },
    phone:         { type: String, trim: true },
    foundedYear:   { type: Number, min: 1800, max: 2100 },
    registeredAddress: {
      street:     { type: String },
      city:       { type: String },
      state:      { type: String },
      postalCode: { type: String },
      country:    { type: String },
    },

    // ── Guided setup wizard state ───────────────────────────────────
    setupComplete: { type: Boolean, default: false },
    setupStep:     { type: Number,  default: 1, min: 1, max: 6 },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'tenants' }
);
TenantSchema.index({ slug: 1 }, { unique: true });

export interface ITenant extends Document {
  slug: string; legalName: string; primaryCountry: string; primaryCurrency: string;
  kmsConfig: { provider: string; masterKeyId: string; region?: string; wrappedDek?: Buffer; keyAltName?: string; rotationCycle?: number };
  subscription: { tier: string; maxSeats: number; usedSeats: number };
  ztPolicy?: { deviceComplianceRequired: boolean; heartbeatIntervalSeconds: number; autoRevokeOnNonCompliance: boolean };
  logoData?: string; loginBgData?: string; loginBgOverlay?: number;
  brandColor?: string; loginTagline?: string;
  displayName?: string; industry?: string; companySize?: string;
  websiteUrl?: string; billingEmail?: string; phone?: string; foundedYear?: number;
  registeredAddress?: { street?: string; city?: string; state?: string; postalCode?: string; country?: string };
  setupComplete: boolean; setupStep: number;
  isActive: boolean;
}
export const Tenant: Model<ITenant> =
  (mongoose.models['Tenant'] as Model<ITenant>) ?? model<ITenant>('Tenant', TenantSchema);

// ─────────────────────────────────────────────────────────────────────────────
// §2  WORKSPACE USER  (tenant-scoped)
// ─────────────────────────────────────────────────────────────────────────────

const WUserSchema = new Schema(
  {
    tenantId:     { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, immutable: true },
    employeeId:   { type: Schema.Types.ObjectId, ref: 'WorkspaceEmployee' },
    name:         { type: String, required: true, trim: true },
    email:        { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role:         { type: String, enum: ['super_admin','hr_admin','hr_manager','payroll_officer','finance_auditor','compliance_officer','employee','digital_worker','readonly'], default: 'employee' },
    isActive:            { type: Boolean, default: true },
    mfaEnabled:          { type: Boolean, default: false },
    lastLoginAt:         { type: Date },
    phone:               { type: String, trim: true },
    designation:         { type: String, trim: true },
    passwordResetToken:  { type: String },
    passwordResetExpiry: { type: Date },
  },
  { timestamps: true, collection: 'ws_users' }
);
WUserSchema.index({ tenantId: 1, email: 1 }, { unique: true });
WUserSchema.index({ tenantId: 1, role: 1, isActive: 1 });

// Mongoose v9: save hooks use Promise resolution — no next() callback
hookPre(WUserSchema, 'save', async function (this: HydratedDocument<IWUser>) {
  if (typeof this.isModified !== 'function') return;
  if (this.isModified('passwordHash') && !this.passwordHash.startsWith('$2')) {
    this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
  }
});

export interface IWUser extends Document {
  tenantId: Types.ObjectId; employeeId?: Types.ObjectId;
  name: string; email: string; passwordHash: string;
  role: UserRole; isActive: boolean; mfaEnabled: boolean; lastLoginAt?: Date;
  phone?: string; designation?: string;
  passwordResetToken?: string; passwordResetExpiry?: Date;
}
export const WorkspaceUser: Model<IWUser> =
  (mongoose.models['WorkspaceUser'] as Model<IWUser>) ?? model<IWUser>('WorkspaceUser', WUserSchema);

// ─────────────────────────────────────────────────────────────────────────────
// §3  WORKSPACE DEPARTMENT  (tenant-scoped)
// ─────────────────────────────────────────────────────────────────────────────

const WDeptSchema = new Schema(
  {
    tenantId:       { type: Schema.Types.ObjectId, required: true, immutable: true },
    name:           { type: String, required: true, trim: true },
    code:           { type: String, required: true, uppercase: true, trim: true },
    costCenterCode: { type: String, trim: true },
    headCount:      { type: Number, default: 0, min: 0 },
    parentId:       { type: Schema.Types.ObjectId, ref: 'WorkspaceDepartment' },
    isActive:       { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'ws_departments' }
);
WDeptSchema.index({ tenantId: 1, code: 1 }, { unique: true });
WDeptSchema.index({ tenantId: 1, isActive: 1 });

export interface IWDept extends Document {
  tenantId: Types.ObjectId; name: string; code: string;
  costCenterCode?: string; headCount: number; parentId?: Types.ObjectId; isActive: boolean;
}
export const WorkspaceDepartment: Model<IWDept> =
  (mongoose.models['WorkspaceDepartment'] as Model<IWDept>) ?? model<IWDept>('WorkspaceDepartment', WDeptSchema);

// ─────────────────────────────────────────────────────────────────────────────
// §4  WORKSPACE EMPLOYEE  (tenant-scoped, ADR-001 embedded)
// ─────────────────────────────────────────────────────────────────────────────

// ── Embedded Sub-Schemas ─────────────────────────────────────────────────────

const StatutoryS = new Schema({
  countryCode:           { type: String, required: true, uppercase: true, maxlength: 2 },
  residencyCode:         { type: String },
  taxIdentifierEnc:      { type: Buffer },
  taxRegimeCode:         { type: String },
  pfAccountEnc:          { type: Buffer },
  esiApplicable:         { type: Boolean, default: false },
  professionalTaxState:  { type: String },
  registeredAt:          { type: Date },
}, { _id: false });

const SkillS = new Schema({
  skillSlug:        { type: String, required: true, lowercase: true, trim: true },
  skillName:        { type: String, required: true },
  category:         { type: String, required: true },
  proficiency:      { type: String, enum: ['awareness','working','practitioner','expert','authority'], required: true },
  verifiedVia:      { type: String, enum: ['self_assessment','peer_review_360','project_delivery','certification','manager_eval','open_source_contribution'], required: true },
  endorsementCount: { type: Number, default: 0, min: 0 },
  lastAssessedAt:   { type: Date },
}, { _id: false });

const AssetRefS = new Schema({
  assetId:      { type: Schema.Types.ObjectId, required: true },
  assetCategory:{ type: String, enum: ['saas_identity','hardware'], required: true },
  provider:     { type: String },
  state:        { type: String, enum: ['pending','provisioned','suspended','deprovisioned','failed'], default: 'pending' },
  syncedAt:     { type: Date },
}, { _id: false });

const VestingS = new Schema({
  grantId:             { type: String, required: true },
  grantType:           { type: String, enum: ['esop','rsu','sar','phantom'], required: true },
  grantDate:           { type: Date, required: true },
  cliffDate:           { type: Date, required: true },
  fullyVestedDate:     { type: Date, required: true },
  totalUnits:          { type: Number, required: true, min: 0 },
  vestedUnits:         { type: Number, default: 0, min: 0 },
  unvestedUnits:       { type: Number, default: 0, min: 0 },
  strikePrice:         { type: Number },
  currencyCode:        { type: String, default: 'USD', maxlength: 3 },
  vestingScheduleType: { type: String, enum: ['cliff','graded_monthly','graded_quarterly','performance'], default: 'graded_monthly' },
  vestingPeriodMonths: { type: Number, default: 48 },
  cliffMonths:         { type: Number, default: 12 },
  payoutMethod:        { type: String, enum: ['bank_transfer','digital_wallet','stablecoin','check'], default: 'bank_transfer' },
  walletAddressEnc:    { type: Buffer },
  capitalGainsTaxRate: { type: Number, min: 0, max: 1 },
  taxJurisdiction:     { type: String },
  lastVestEventAt:     { type: Date },
  status:              { type: String, enum: ['active','exercised','expired','cancelled'], default: 'active' },
}, { _id: false });

const ImmigrationS = new Schema({
  documentType:          { type: String, enum: ['visa','work_permit','permanent_residency','business_visitor','intra_company_transfer'], required: true },
  documentNumber:        { type: String },
  issuingCountry:        { type: String, required: true, uppercase: true, maxlength: 2 },
  hostCountry:           { type: String, required: true, uppercase: true, maxlength: 2 },
  validFrom:             { type: Date, required: true },
  expiresAt:             { type: Date, required: true },
  visaCategory:          { type: String },
  physicalDaysInCountry: { type: Number, default: 0, min: 0 },
  nexusTriggerDays:      { type: Number, default: 183 },
  nexusRiskLevel:        { type: String, enum: ['safe','watch','at_risk','triggered'], default: 'safe' },
  alertsSent:            [{ type: Date }],
  status:                { type: String, enum: ['active','expired','cancelled'], default: 'active' },
}, { _id: false });

const DeviceTrustS = new Schema({
  deviceId:             { type: String },
  deviceFingerprint:    { type: String },
  mdmEnrollmentId:      { type: String },
  mdmProvider:          { type: String },
  lastHeartbeatAt:      { type: Date },
  heartbeatIntervalSec: { type: Number, default: 300 },
  diskEncrypted:        { type: Boolean, default: false },
  osPatchCurrent:       { type: Boolean, default: false },
  mdmProfileActive:     { type: Boolean, default: false },
  edrAgentActive:       { type: Boolean, default: false },
  firewallEnabled:      { type: Boolean, default: false },
  antivirusActive:      { type: Boolean, default: false },
  screenLockEnabled:    { type: Boolean, default: false },
  complianceScore:      { type: Number, default: 0, min: 0, max: 100 },
  trustLevel:           { type: String, enum: ['trusted','conditional','non_compliant','revoked','unknown'], default: 'unknown' },
  accessTokenThrottle:  { type: Number, default: 1, min: 0, max: 1 },
  nonComplianceSince:   { type: Date },
  autoRevokedAt:        { type: Date },
}, { _id: false });

const IdentityVerifyS = new Schema({
  verificationSessionId:  { type: String },
  webAuthnCredentialId:   { type: String },
  webAuthnPublicKeyHash:  { type: String, maxlength: 64 },
  livenessCheckPassed:    { type: Boolean, default: false },
  livenessScore:          { type: Number, min: 0, max: 1 },
  antiSpoofScore:         { type: Number, min: 0, max: 1 },
  biometricTemplateHash:  { type: String, maxlength: 64 },   // SHA-256 hash — NO raw data
  sessionSignature:       { type: String },
  verifiedAt:             { type: Date },
  verificationProvider:   { type: String },
  verificationStatus:     { type: String, enum: ['pending','in_progress','verified','failed','expired'], default: 'pending' },
  failedAttempts:         { type: Number, default: 0, min: 0 },
  lastFailedAt:           { type: Date },
}, { _id: false });

const DigitalWorkerS = new Schema({
  isDigitalWorker:       { type: Boolean, default: false },
  agentFramework:        { type: String },
  modelVersion:          { type: String },
  parentRepositoryUrl:   { type: String },
  humanSupervisorId:     { type: Schema.Types.ObjectId, ref: 'WorkspaceEmployee' },
  tokenBudgetMonthly:    { type: Number, default: 1_000_000, min: 0 },
  tokenBudgetUsed:       { type: Number, default: 0, min: 0 },
  apiCostMtd:            { type: Number, default: 0, min: 0 },
  accessScopes:          [{ type: String }],
  lastActiveAt:          { type: Date },
  deploymentEnvironment: { type: String, enum: ['production','staging','dev'], default: 'production' },
}, { _id: false });

// ── Root Employee Schema ──────────────────────────────────────────────────────

// Using untyped Schema to allow flexible field definitions;
// type safety is enforced at model<IWEmployee, IWEmployeeModel>() call below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const WEmployeeSchema = new Schema<any>(
  {
    tenantId:      { type: Schema.Types.ObjectId, required: true, immutable: true },
    subsidiaryId:  { type: Schema.Types.ObjectId },
    employeeCode:  { type: String, required: true, uppercase: true, trim: true },

    // AES-256-GCM encrypted PII (Buffer)
    fullNameEnc:      { type: Buffer, required: true },
    emailEnc:         { type: Buffer, required: true },
    personalEmailEnc: { type: Buffer },
    phoneEnc:         { type: Buffer },
    nationalIdEnc:    { type: Buffer },
    dateOfBirthEnc:   { type: Buffer },
    addressEnc:       { type: Buffer },
    passportEnc:      { type: Buffer },

    // AES-256-GCM encrypted compensation (Buffer)
    baseSalaryEnc:    { type: Buffer, required: true },
    variableCompEnc:  { type: Buffer },
    bankAccountEnc:   { type: Buffer },
    bankRoutingEnc:   { type: Buffer },
    bankSwiftEnc:     { type: Buffer },
    equityValueEnc:   { type: Buffer },

    // HMAC lookup hashes (64-char hex, indexed)
    emailHash:        { type: String, required: true, maxlength: 64 },
    nationalIdHash:   { type: String, maxlength: 64 },

    // Compensation metadata — plaintext for payroll aggregation
    currencyCode:  { type: String, default: 'USD', uppercase: true, maxlength: 3 },
    salaryBand:    { type: String },
    payFrequency:  { type: String, enum: ['weekly','biweekly','semi_monthly','monthly'], default: 'monthly' },

    // Denormalized operational fields (zero $lookup on hot reads)
    departmentId:   { type: Schema.Types.ObjectId, required: true },
    departmentName: { type: String, required: true, trim: true },
    departmentCode: { type: String, required: true, uppercase: true },
    costCenterCode: { type: String },
    jobTitleId:     { type: Schema.Types.ObjectId },
    jobTitle:       { type: String, required: true, trim: true },
    managerId:      { type: Schema.Types.ObjectId, ref: 'WorkspaceEmployee' },
    managerName:    { type: String },
    countryCode:    { type: String, required: true, uppercase: true, maxlength: 2 },
    timezone:       { type: String, default: 'UTC' },
    locale:         { type: String, default: 'en-US' },

    // Emergency contact (plain text — not PII-encrypted by policy)
    emergencyContact: {
      name:         { type: String },
      relationship: { type: String },
      phone:        { type: String },
      email:        { type: String },
    },

    // Date milestones (drive comms engine scheduling)
    hireDate:          { type: Date, required: true },
    hireDateMonth:     { type: Number, min: 1, max: 12 },   // computed by pre-hook
    hireDateDay:       { type: Number, min: 1, max: 31 },
    dateOfBirth:       { type: Date },
    birthMonth:        { type: Number, min: 1, max: 12 },
    birthDay:          { type: Number, min: 1, max: 31 },
    probationEndDate:  { type: Date },
    lastWorkingDay:    { type: Date },
    nextReviewDate:    { type: Date },
    lastPromotionDate: { type: Date },

    // A future-dated compensation revision (from an accepted PMS recommendation)
    // that has NOT yet taken effect.  baseSalaryEnc is only swapped on/after
    // effectiveDate via applyDueCompRevisions().  Not in COMP_PROTECTED, so it
    // can be staged without the compGuard escape hatch.
    pendingCompRevision: {
      newSalaryEnc:  { type: Buffer },
      incrementPct:  { type: Number },
      promotion:     { type: Boolean },
      proposedTitle: { type: String },
      proposedBand:  { type: String },
      currencyCode:  { type: String },
      effectiveDate: { type: Date },
      reviewId:      { type: Schema.Types.ObjectId },
      decidedById:   { type: Schema.Types.ObjectId },
    },

    // Lifecycle
    employeeStatus:      { type: String, enum: ['pre_hire','active','on_leave','pip','suspended','terminated','retired'], default: 'pre_hire' },
    employmentType:      { type: String, enum: ['full_time','part_time','contractor','intern','advisor','digital_worker'], default: 'full_time' },
    offboardInitiatedAt: { type: Date },
    offboardCompletedAt: { type: Date },

    // ADR-001: embedded sub-documents with array-limit validators
    statutoryProfiles: {
      type: [StatutoryS], default: [],
      validate: { validator: (v: unknown[]) => v.length <= LIMITS.STATUTORY, message: `Max ${LIMITS.STATUTORY} statutory profiles` },
    },
    skills: {
      type: [SkillS], default: [],
      validate: { validator: (v: unknown[]) => v.length <= LIMITS.SKILLS, message: `Max ${LIMITS.SKILLS} skills (ADR-001)` },
    },
    provisionedAssets: {
      type: [AssetRefS], default: [],
      validate: { validator: (v: unknown[]) => v.length <= LIMITS.ASSETS, message: `Max ${LIMITS.ASSETS} asset refs (ADR-001)` },
    },
    vestingSchedules: {
      type: [VestingS], default: [],
      validate: { validator: (v: unknown[]) => v.length <= LIMITS.VESTING, message: `Max ${LIMITS.VESTING} vesting grants (ADR-001)` },
    },
    immigrationRecords: {
      type: [ImmigrationS], default: [],
      validate: { validator: (v: unknown[]) => v.length <= LIMITS.IMMIGRATION, message: `Max ${LIMITS.IMMIGRATION} immigration records (ADR-001)` },
    },
    deviceTrustState:     { type: DeviceTrustS,     default: () => ({}) },
    identityVerification: { type: IdentityVerifyS,  default: () => ({}) },
    digitalWorkerMeta:    { type: DigitalWorkerS,   default: () => ({ isDigitalWorker: false }) },

    // ML risk signals — written exclusively by inference worker
    burnoutRiskScore: { type: Number, min: 0, max: 1, default: 0 },
    flightRiskScore:  { type: Number, min: 0, max: 1, default: 0 },
    engagementPct:    { type: Number, min: 0, max: 100 },
    riskComputedAt:   { type: Date },

    isActive: { type: Boolean, default: true },

    // HR-controlled per-employee nav visibility overrides.
    // Each entry is a sidebar href (e.g. '/my/equity').  Items in this list
    // are filtered out of the employee's Sidebar regardless of role nav config.
    hiddenTabs: [{ type: String, trim: true }],
  },
  {
    timestamps: true,
    collection: 'ws_employees',
    toJSON: {
      virtuals: true,
      // Strip every *Enc field from JSON output — raw ciphertext must never leak via API
      transform: (_doc, ret: Record<string, unknown>) => {
        for (const k of Object.keys(ret)) { if (k.endsWith('Enc')) delete ret[k]; }
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// ── Compound Indexes ──────────────────────────────────────────────────────────
WEmployeeSchema.index({ tenantId: 1, employeeStatus: 1, isActive: 1 });
WEmployeeSchema.index({ tenantId: 1, emailHash: 1 }, { unique: true });
WEmployeeSchema.index({ tenantId: 1, employeeCode: 1 }, { unique: true });
WEmployeeSchema.index({ tenantId: 1, nationalIdHash: 1 }, { sparse: true });
WEmployeeSchema.index({ tenantId: 1, departmentId: 1, isActive: 1 });
WEmployeeSchema.index({ tenantId: 1, managerId: 1 });
WEmployeeSchema.index({ tenantId: 1, countryCode: 1, employeeStatus: 1 });
WEmployeeSchema.index({ tenantId: 1, employmentType: 1, isActive: 1 });
WEmployeeSchema.index({ tenantId: 1, flightRiskScore: -1 }, { partialFilterExpression: { isActive: true } });
WEmployeeSchema.index({ tenantId: 1, burnoutRiskScore: -1 }, { partialFilterExpression: { isActive: true } });
WEmployeeSchema.index({ tenantId: 1, 'skills.skillSlug': 1, 'skills.proficiency': 1 });
WEmployeeSchema.index({ tenantId: 1, 'vestingSchedules.cliffDate': 1 }, { partialFilterExpression: { 'vestingSchedules.0': { $exists: true } } });
WEmployeeSchema.index({ tenantId: 1, 'immigrationRecords.expiresAt': 1 }, { partialFilterExpression: { 'immigrationRecords.status': 'active' } });
WEmployeeSchema.index({ tenantId: 1, 'deviceTrustState.trustLevel': 1 }, { partialFilterExpression: { 'deviceTrustState.trustLevel': { $in: ['non_compliant','revoked'] } } });
WEmployeeSchema.index({ tenantId: 1, hireDateMonth: 1, hireDateDay: 1, isActive: 1 });
WEmployeeSchema.index({ tenantId: 1, birthMonth: 1, birthDay: 1, isActive: 1 }, { partialFilterExpression: { birthMonth: { $exists: true } } });
WEmployeeSchema.index({ tenantId: 1, 'identityVerification.verificationStatus': 1 }, { partialFilterExpression: { 'identityVerification.verificationStatus': { $in: ['pending','failed'] } } });
WEmployeeSchema.index({ tenantId: 1, offboardInitiatedAt: 1 }, { partialFilterExpression: { offboardInitiatedAt: { $exists: true }, offboardCompletedAt: { $exists: false } } });
WEmployeeSchema.index({ tenantId: 1, 'digitalWorkerMeta.isDigitalWorker': 1, isActive: 1 }, { partialFilterExpression: { 'digitalWorkerMeta.isDigitalWorker': true } });
WEmployeeSchema.index({ tenantId: 1, hireDate: 1 });

// ── Pre-Hooks ─────────────────────────────────────────────────────────────────

// Denormalize month/day for fast milestone calendar queries
// Mongoose v9: no next() callback in save hooks
hookPre(WEmployeeSchema, 'save', function (this: HydratedDocument<IWEmployee>) {
  if (typeof this.isModified !== 'function') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = this as any;
    if (raw.hireDate) { raw.hireDateMonth = new Date(raw.hireDate).getMonth() + 1; raw.hireDateDay = new Date(raw.hireDate).getDate(); }
    if (raw.dateOfBirth) { raw.birthMonth = new Date(raw.dateOfBirth).getMonth() + 1; raw.birthDay = new Date(raw.dateOfBirth).getDate(); }
    return;
  }
  if (this.isModified('hireDate') && this.hireDate) {
    this.hireDateMonth = this.hireDate.getMonth() + 1;
    this.hireDateDay   = this.hireDate.getDate();
  }
  if (this.isModified('dateOfBirth') && this.dateOfBirth) {
    this.birthMonth = this.dateOfBirth.getMonth() + 1;
    this.birthDay   = this.dateOfBirth.getDate();
  }
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
hookPre(WEmployeeSchema, 'findOneAndUpdate', function (this: any) {
  const $set = (this.getUpdate() as Record<string, unknown>)?.['$set'] as Record<string, unknown>;
  if (!$set) return;
  if ($set['hireDate']) { const d = new Date($set['hireDate'] as string); $set['hireDateMonth'] = d.getMonth() + 1; $set['hireDateDay'] = d.getDate(); }
  if ($set['dateOfBirth']) { const d = new Date($set['dateOfBirth'] as string); $set['birthMonth'] = d.getMonth() + 1; $set['birthDay'] = d.getDate(); }
});

// Compensation field mutation guard — only payroll pipeline may update these
const COMP_PROTECTED = new Set(['baseSalaryEnc','variableCompEnc','bankAccountEnc','bankRoutingEnc','bankSwiftEnc','equityValueEnc','vestingSchedules']);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function compGuard(this: any, op: string) {
  if (this._compensationCtx) return;
  const upd = this.getUpdate?.() as Record<string, unknown>;
  if (!upd) return;
  const all = [...Object.keys((upd['$set'] as object) ?? {}), ...Object.keys((upd['$unset'] as object) ?? {})];
  const blocked = all.filter((k) => COMP_PROTECTED.has(k.split('.')[0] ?? ''));
  if (blocked.length) throw new Error(`COMPENSATION_MUTATION_BLOCKED: [${blocked.join(', ')}] — use /api/v3/payroll/compensation-change`);
}
hookPre(WEmployeeSchema, 'findOneAndUpdate', function (this: unknown) { compGuard.call(this, 'findOneAndUpdate'); });
hookPre(WEmployeeSchema, 'updateOne',  function (this: unknown) { compGuard.call(this, 'updateOne'); });
hookPre(WEmployeeSchema, 'updateMany', function (this: unknown) { compGuard.call(this, 'updateMany'); });

// Vesting unit balance consistency — Mongoose v9: throw to abort, return to proceed
hookPre(WEmployeeSchema, 'save', function (this: HydratedDocument<IWEmployee>) {
  if (typeof this.isModified !== 'function') return;
  if (this.isModified('vestingSchedules')) {
    for (const g of this.vestingSchedules) {
      if (g.vestedUnits > g.totalUnits) throw new Error(`VESTING_ERROR: grant "${g.grantId}" vestedUnits exceeds totalUnits`);
      g.unvestedUnits = g.totalUnits - g.vestedUnits;
    }
  }
});

// ── Virtuals ──────────────────────────────────────────────────────────────────
WEmployeeSchema.virtual('tenureYears').get(function (this: HydratedDocument<IWEmployee>) {
  return Math.round(((Date.now() - this.hireDate.getTime()) / 31_557_600_000) * 10) / 10;
});
WEmployeeSchema.virtual('totalUnvestedUnits').get(function (this: HydratedDocument<IWEmployee>) {
  return this.vestingSchedules.filter((g) => g.status === 'active').reduce((s, g) => s + g.unvestedUnits, 0);
});
WEmployeeSchema.virtual('immigrationAlertCount').get(function (this: HydratedDocument<IWEmployee>) {
  return this.immigrationRecords.filter((r) => r.status === 'active' && r.expiresAt.getTime() <= Date.now() + 90 * 86_400_000).length;
});

// ── Static Methods ────────────────────────────────────────────────────────────
WEmployeeSchema.statics.findByEmailHash = async function (email: string): Promise<HydratedDocument<IWEmployee> | null> {
  const ctx = TenantContext.requireStore('findByEmailHash');
  const hash = await computeLookupHash(ctx.tenantId.toString(), 'email', email);
  return this.findOne({ emailHash: hash });
};

WEmployeeSchema.statics.createWithEncryption = async function (plain: PlainEmployeeFields, meta: Partial<IWEmployee>): Promise<HydratedDocument<IWEmployee>> {
  const ctx = TenantContext.requireStore('createWithEncryption');
  const enc  = await encryptEmployeeFields(ctx.tenantId.toString(), plain);
  const n    = await this.countDocuments({});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (this as any).create({ ...meta, ...enc, employeeCode: `EMP-${String(n + 1).padStart(5, '0')}` });
};

WEmployeeSchema.statics.matchBySkills = async function (
  required: Array<{ skillSlug: string; minimumProficiency: SkillProficiency }>,
  opts: { maxResults?: number; countryFilter?: string[] } = {},
) {
  const slugs = required.map((r) => r.skillSlug);
  const base: Record<string, unknown> = { isActive: true, employeeStatus: 'active', 'skills.0': { $exists: true } };
  if (opts.countryFilter?.length) base['countryCode'] = { $in: opts.countryFilter };
  return this.aggregate([
    { $match: base },
    { $unwind: '$skills' },
    { $match: { 'skills.skillSlug': { $in: slugs } } },
    { $group: { _id: '$_id', employeeCode: { $first: '$employeeCode' }, jobTitle: { $first: '$jobTitle' }, departmentName: { $first: '$departmentName' }, flightRiskScore: { $first: '$flightRiskScore' }, matchedSkills: { $push: '$skills' }, matchedCount: { $sum: 1 } } },
    { $addFields: { matchScore: { $divide: ['$matchedCount', required.length] } } },
    { $sort: { matchScore: -1 } },
    { $limit: opts.maxResults ?? 20 },
    { $project: { fullNameEnc: 0, emailEnc: 0, nationalIdEnc: 0, baseSalaryEnc: 0 } },
  ]);
};

// ── Interface & Model Export ──────────────────────────────────────────────────
export interface IWEmployee extends Document {
  tenantId: Types.ObjectId; subsidiaryId?: Types.ObjectId; employeeCode: string;
  fullNameEnc: Buffer; emailEnc: Buffer; personalEmailEnc?: Buffer; phoneEnc?: Buffer;
  nationalIdEnc?: Buffer; dateOfBirthEnc?: Buffer; addressEnc?: Buffer; passportEnc?: Buffer;
  baseSalaryEnc: Buffer; variableCompEnc?: Buffer; bankAccountEnc?: Buffer;
  bankRoutingEnc?: Buffer; bankSwiftEnc?: Buffer; equityValueEnc?: Buffer;
  emailHash: string; nationalIdHash?: string;
  currencyCode: string; salaryBand?: string; payFrequency: string;
  departmentId: Types.ObjectId; departmentName: string; departmentCode: string;
  costCenterCode?: string; jobTitleId?: Types.ObjectId; jobTitle: string; managerId?: Types.ObjectId;
  countryCode: string; timezone: string; locale: string;
  hireDate: Date; hireDateMonth: number; hireDateDay: number;
  dateOfBirth?: Date; birthMonth?: number; birthDay?: number;
  probationEndDate?: Date; lastWorkingDay?: Date;
  employeeStatus: EmployeeStatus; employmentType: EmploymentType;
  offboardInitiatedAt?: Date; offboardCompletedAt?: Date;
  statutoryProfiles:    Array<{ countryCode: string; taxIdentifierEnc?: Buffer; esiApplicable: boolean }>;
  skills:               Array<{ skillSlug: string; skillName: string; proficiency: SkillProficiency; verifiedVia: string; endorsementCount: number }>;
  provisionedAssets:    Array<{ assetId: Types.ObjectId; assetCategory: string; provider?: string; state: AssetState }>;
  vestingSchedules:     Array<{ grantId: string; grantType: GrantType; totalUnits: number; vestedUnits: number; unvestedUnits: number; status: GrantStatus; walletAddressEnc?: Buffer }>;
  immigrationRecords:   Array<{ documentType: string; hostCountry: string; expiresAt: Date; nexusRiskLevel: NexusRisk; status: string }>;
  deviceTrustState:     { trustLevel: DeviceTrustLevel; complianceScore: number; lastHeartbeatAt?: Date; accessTokenThrottle: number };
  identityVerification: { verificationStatus: VerifyStatus; livenessCheckPassed: boolean; failedAttempts: number };
  digitalWorkerMeta:    { isDigitalWorker: boolean; agentFramework?: string; modelVersion?: string; parentRepositoryUrl?: string; humanSupervisorId?: Types.ObjectId; tokenBudgetMonthly: number; tokenBudgetUsed: number; apiCostMtd: number; accessScopes?: string[]; lastActiveAt?: Date; deploymentEnvironment?: 'production' | 'staging' | 'dev' };
  burnoutRiskScore: number; flightRiskScore: number; engagementPct?: number; riskComputedAt?: Date;
  pendingCompRevision?: {
    newSalaryEnc?: Buffer; incrementPct?: number; promotion?: boolean;
    proposedTitle?: string; proposedBand?: string; currencyCode?: string;
    effectiveDate?: Date; reviewId?: Types.ObjectId; decidedById?: Types.ObjectId;
  };
  lastPromotionDate?: Date;
  isActive: boolean; createdAt: Date; updatedAt: Date;
  tenureYears: number; totalUnvestedUnits: number; immigrationAlertCount: number;
  hiddenTabs: string[];
}
export interface IWEmployeeModel extends Model<IWEmployee> {
  findByEmailHash(email: string): Promise<HydratedDocument<IWEmployee> | null>;
  createWithEncryption(plain: PlainEmployeeFields, meta: Partial<IWEmployee>): Promise<HydratedDocument<IWEmployee>>;
  matchBySkills(required: Array<{ skillSlug: string; minimumProficiency: SkillProficiency }>, opts?: { maxResults?: number; countryFilter?: string[] }): Promise<unknown[]>;
}
export const WorkspaceEmployee: IWEmployeeModel =
  (mongoose.models['WorkspaceEmployee'] as IWEmployeeModel) ??
  model<IWEmployee, IWEmployeeModel>('WorkspaceEmployee', WEmployeeSchema);

// ─────────────────────────────────────────────────────────────────────────────
// §5  LEAVE REQUEST  (tenant-scoped)
// ─────────────────────────────────────────────────────────────────────────────

const WLeaveSchema = new Schema(
  {
    tenantId:        { type: Schema.Types.ObjectId, required: true, immutable: true },
    employeeId:      { type: Schema.Types.ObjectId, ref: 'WorkspaceEmployee', required: true },
    leaveType:        { type: String, enum: ['annual','sick','maternity','paternity','unpaid','compensatory'], required: true },
    startDate:        { type: Date, required: true },
    endDate:          { type: Date, required: true },
    totalDays:        { type: Number, required: true, min: 0.5 },
    reason:           { type: String, required: true, trim: true },
    status:           { type: String, enum: ['pending','approved','rejected','cancelled'], default: 'pending' },
    managerId:        { type: Schema.Types.ObjectId },
    managerApprovedById: { type: Schema.Types.ObjectId },
    managerApprovedAt:   { type: Date },
    approvedById:     { type: Schema.Types.ObjectId },
    approvedAt:       { type: Date },
    rejectionReason:  { type: String },
    isActive:         { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'ws_leave_requests' }
);
WLeaveSchema.index({ tenantId: 1, employeeId: 1, status: 1 });
WLeaveSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
WLeaveSchema.index({ tenantId: 1, startDate: 1, endDate: 1 });

export interface IWLeave extends Document {
  tenantId: Types.ObjectId; employeeId: Types.ObjectId;
  leaveType: LeaveType; startDate: Date; endDate: Date; totalDays: number;
  reason: string; status: LeaveStatus;
  managerId?: Types.ObjectId; managerApprovedById?: Types.ObjectId; managerApprovedAt?: Date;
  approvedById?: Types.ObjectId; approvedAt?: Date; rejectionReason?: string;
}
export const WorkspaceLeaveRequest: Model<IWLeave> =
  (mongoose.models['WorkspaceLeaveRequest'] as Model<IWLeave>) ?? model<IWLeave>('WorkspaceLeaveRequest', WLeaveSchema);

// ─────────────────────────────────────────────────────────────────────────────
// §6  LEAVE BALANCE  (tenant-scoped, one per employee per year)
// ─────────────────────────────────────────────────────────────────────────────

const WLeaveBalSchema = new Schema(
  {
    tenantId:   { type: Schema.Types.ObjectId, required: true, immutable: true },
    employeeId: { type: Schema.Types.ObjectId, required: true },
    year:       { type: Number, required: true },
    annual:     { type: Number, default: 21, min: 0 },
    sick:       { type: Number, default: 12, min: 0 },
    earned:     { type: Number, default: 0,  min: 0 },
    used:       { type: Number, default: 0,  min: 0 },
    remaining:  { type: Number, default: 21, min: 0 },
  },
  { timestamps: true, collection: 'ws_leave_balances' }
);
WLeaveBalSchema.index({ tenantId: 1, employeeId: 1, year: 1 }, { unique: true });

export interface IWLeaveBal extends Document {
  tenantId: Types.ObjectId; employeeId: Types.ObjectId; year: number;
  annual: number; sick: number; earned: number; used: number; remaining: number;
}
export const WorkspaceLeaveBalance: Model<IWLeaveBal> =
  (mongoose.models['WorkspaceLeaveBalance'] as Model<IWLeaveBal>) ?? model<IWLeaveBal>('WorkspaceLeaveBalance', WLeaveBalSchema);

// ─────────────────────────────────────────────────────────────────────────────
// §7  PAYROLL RUN  (tenant-scoped)
// ─────────────────────────────────────────────────────────────────────────────

const PayrollLineItemS = new Schema({
  employeeId:      { type: Schema.Types.ObjectId, required: true },
  employeeCode:    { type: String, required: true },
  currencyCode:    { type: String, required: true, maxlength: 3 },
  baseSalaryEnc:   { type: Buffer, required: true },
  grossSalaryEnc:  { type: Buffer, required: true },
  netSalaryEnc:    { type: Buffer, required: true },
  overtimePayEnc:  { type: Buffer },
  bonusEnc:        { type: Buffer },
  deductionsEnc:   { type: Buffer },
  taxBuckets: [{
    taxCode: { type: String }, amountEnc: { type: Buffer }, rateApplied: { type: Number },
    isEmployerShare: { type: Boolean, default: false },
  }],
  attendanceDays:   { type: Number },
  overtimeHours:    { type: Number, default: 0 },
  leaveDaysDeducted:{ type: Number, default: 0 },  // paid leave working-days
  lwpDays:          { type: Number, default: 0 },   // Loss of Pay days (absent + unpaid leave)
  lineHash:         { type: String, maxlength: 64 },
  varianceFlag:     { type: Boolean, default: false },
  varianceNotes:    { type: String },
}, { _id: false });

const AuditFlagS = new Schema({
  flagId:        { type: String, required: true },
  severity:      { type: String, enum: ['critical','warning','informational'], required: true },
  checkCode:     { type: String, required: true },
  statutoryRef:  { type: String },
  affectedCount: { type: Number, default: 0 },
  description:   { type: String, required: true },
  remediation:   { type: String },
  isBlocking:    { type: Boolean, default: false },
  resolvedAt:    { type: Date },
  resolvedById:  { type: Schema.Types.ObjectId },
}, { _id: false });

const WPayrollSchema = new Schema(
  {
    tenantId:         { type: Schema.Types.ObjectId, required: true, immutable: true },
    subsidiaryId:     { type: Schema.Types.ObjectId },
    runCode:          { type: String, required: true, trim: true },
    payPeriodMonth:   { type: Number, required: true, min: 1, max: 12 },
    payPeriodYear:    { type: Number, required: true, min: 2000 },
    payDate:          { type: Date },
    currencyCode:     { type: String, required: true, uppercase: true, maxlength: 3 },
    runStatus:        { type: String, enum: ['draft','agentic_audit_queued','audit_passed','audit_failed','approved','processing','paid','reversed','cancelled'], default: 'draft' },
    totalGrossEnc:    { type: Buffer },
    totalNetEnc:      { type: Buffer },
    totalDeductionsEnc: { type: Buffer },
    employeeCount:    { type: Number, default: 0 },
    headcountHash:    { type: String, maxlength: 64 },
    lineItems:        [PayrollLineItemS],
    auditFlags:       [AuditFlagS],
    criticalFlagCount:{ type: Number, default: 0 },
    agentAuditJobId:  { type: String },
    agentAuditCompletedAt: { type: Date },
    approvedById:     { type: Schema.Types.ObjectId },
    approvedAt:       { type: Date },
    initiatedAt:      { type: Date, default: Date.now },
    processingStartedAt: { type: Date },
    processingCompletedAt: { type: Date },
    kafkaEventId:     { type: String },
    reversalOfRunId:  { type: Schema.Types.ObjectId, ref: 'WorkspacePayrollRun' },
  },
  { timestamps: true, collection: 'ws_payroll_runs' }
);
WPayrollSchema.index({ tenantId: 1, runCode: 1 }, { unique: true });
WPayrollSchema.index({ tenantId: 1, subsidiaryId: 1, payPeriodYear: 1, payPeriodMonth: 1 }, { unique: true });
WPayrollSchema.index({ tenantId: 1, runStatus: 1, payPeriodYear: -1 });

// Block approval if critical flags exist
hookPre(WPayrollSchema, 'findOneAndUpdate', async function (this: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q: any = this;
  const upd = q.getUpdate() as Record<string, unknown>;
  if ((upd?.['$set'] as Record<string, unknown>)?.['runStatus'] === 'approved') {
    const doc = await q.model.findOne(q.getFilter()).select('criticalFlagCount').lean();
    if (doc?.criticalFlagCount > 0) throw new Error(`PAYROLL_APPROVAL_BLOCKED: ${doc.criticalFlagCount} critical flags unresolved`);
  }
});

export interface IWPayroll extends Document {
  tenantId: Types.ObjectId; runCode: string; payPeriodMonth: number; payPeriodYear: number;
  currencyCode: string; runStatus: PayrollStatus; employeeCount: number;
  auditFlags: Array<{ severity: string; checkCode: string; isBlocking: boolean; resolvedAt?: Date }>;
  criticalFlagCount: number; approvedById?: Types.ObjectId; approvedAt?: Date; payDate?: Date;
}
export const WorkspacePayrollRun: Model<IWPayroll> =
  (mongoose.models['WorkspacePayrollRun'] as Model<IWPayroll>) ?? model<IWPayroll>('WorkspacePayrollRun', WPayrollSchema);

// ─────────────────────────────────────────────────────────────────────────────
// §8  COMMUNICATION TEMPLATE  (tenant-scoped, Mustache {{handleKey}})
// ─────────────────────────────────────────────────────────────────────────────

const LocaleS = new Schema({
  locale:    { type: String, required: true },
  subject:   { type: String, required: true },
  bodyHtml:  { type: String, required: true },
  bodyText:  { type: String },
  preheader: { type: String },
}, { _id: false });

const WCommsSchema = new Schema(
  {
    tenantId:    { type: Schema.Types.ObjectId, required: true, immutable: true },
    templateKey: { type: String, required: true, lowercase: true, trim: true },
    templateType: {
      type: String,
      enum: [
        'onboarding_welcome','offboarding_checklist','payslip_ready',
        'leave_approved','leave_rejected','leave_reminder',
        'it_credentials_dispatched','liveness_verification_invite','liveness_verified','liveness_failed',
        'equity_vest_notification','equity_exercise_window',
        'device_compliance_warning','device_access_revoked','device_access_restored',
        'immigration_nexus_triggered',
        'work_anniversary','birthday_greeting','probation_completion',
        'year_end_tax_declaration','visa_expiry_alert','nexus_risk_alert',
        'performance_review_open','pulse_survey_invite','open_enrollment_reminder',
        'salary_revision_notification','custom',
      ],
      required: true,
    },
    channel:  { type: String, enum: ['email','slack','teams','sms','in_app'], default: 'email' },
    supportedHandles: [{
      key: { type: String, required: true }, description: { type: String, default: '' }, required: { type: Boolean, default: false },
    }],
    locales:       {
      type: [LocaleS], required: true,
      validate: { validator: (v: unknown[]) => v.length >= 1, message: 'At least one locale required' },
    },
    defaultLocale:  { type: String, default: 'en-US' },
    schedulingConfig: {
      triggerType:       { type: String, enum: ['date_offset','event_driven','recurring_cron'] },
      offsetDays:        { type: Number },
      cronExpression:    { type: String },
      evaluationTimeUtc: { type: String, match: /^\d{2}:\d{2}$/ },
    },
    version:  { type: Number, default: 1 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'ws_comms_templates' }
);
WCommsSchema.index({ tenantId: 1, templateKey: 1 }, { unique: true });
WCommsSchema.index({ tenantId: 1, templateType: 1, isActive: 1 });

export interface IWCommsTemplate extends Document {
  tenantId: Types.ObjectId; templateKey: string; templateType: string; channel: string;
  locales: Array<{ locale: string; subject: string; bodyHtml: string; bodyText?: string }>;
  defaultLocale: string; isActive: boolean;
}
export const WorkspaceCommsTemplate: Model<IWCommsTemplate> =
  (mongoose.models['WorkspaceCommsTemplate'] as Model<IWCommsTemplate>) ?? model<IWCommsTemplate>('WorkspaceCommsTemplate', WCommsSchema);

// ─────────────────────────────────────────────────────────────────────────────
// §9  NOTIFICATION LOG  (tenant-scoped, 2-year TTL — ADR-007)
// ─────────────────────────────────────────────────────────────────────────────

const WNotifSchema = new Schema(
  {
    tenantId:            { type: Schema.Types.ObjectId, required: true, immutable: true },
    employeeId:          { type: Schema.Types.ObjectId },
    recipientEmailEnc:   { type: Buffer },          // AES-256-GCM encrypted
    recipientEmailHash:  { type: String, maxlength: 64 },
    channel:             { type: String, enum: ['email','slack','teams','sms','in_app'], required: true },
    templateId:          { type: Schema.Types.ObjectId, ref: 'WorkspaceCommsTemplate' },
    templateKey:         { type: String, required: true },
    templateType:        { type: String, required: true },
    locale:              { type: String, default: 'en-US' },
    triggerEvent:        { type: String, required: true },
    triggerPayload:      { type: Schema.Types.Mixed },
    deliveryStatus: {
      type: String,
      enum: ['queued','rendering','dispatched','delivered','opened','clicked','bounced','spam_flagged','failed','cancelled'],
      default: 'queued',
    },
    deliveryStatusHistory: [{
      status:    { type: String, required: true },
      timestamp: { type: Date, default: Date.now },
      metadata:  { type: Schema.Types.Mixed },
    }],
    providerMessageId: { type: String },
    errorCode:         { type: String },
    errorMessage:      { type: String },
    retryCount:        { type: Number, default: 0, min: 0 },
    nextRetryAt:       { type: Date },
    maxRetries:        { type: Number, default: 3 },
    queuedAt:          { type: Date, default: Date.now, immutable: true },
    dispatchedAt:      { type: Date },
    deliveredAt:       { type: Date },
    bullJobId:         { type: String },
    kafkaEventId:      { type: String },
  },
  { timestamps: true, collection: 'ws_notification_logs' }
);

WNotifSchema.index({ tenantId: 1, employeeId: 1, queuedAt: -1 });
WNotifSchema.index({ tenantId: 1, deliveryStatus: 1, queuedAt: -1 });
WNotifSchema.index({ tenantId: 1, templateType: 1, queuedAt: -1 });
WNotifSchema.index({ nextRetryAt: 1 }, { partialFilterExpression: { deliveryStatus: 'failed', retryCount: { $lt: 3 } } });

/**
 * ADR-007: 2-year automated TTL index on `queuedAt`.
 * MongoDB automatically deletes notification log documents 2 years after
 * they are created, satisfying minimum regulatory retention requirements
 * without manual purge jobs.
 */
WNotifSchema.index(
  { queuedAt: 1 },
  { name: 'idx_ttl_regulatory_2yr', expireAfterSeconds: 63_072_000 }  // 2 years
);

// Status history is append-only: block direct $set on the array
hookPre(WNotifSchema, 'findOneAndUpdate', function (this: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upd = (this as any).getUpdate() as Record<string, unknown>;
  if ((upd?.['$set'] as Record<string, unknown>)?.['deliveryStatusHistory']) {
    throw new Error('NOTIF_IMMUTABLE: use $push to append to deliveryStatusHistory');
  }
});

export interface IWNotif extends Document {
  tenantId: Types.ObjectId; employeeId?: Types.ObjectId;
  recipientEmailEnc?: Buffer; recipientEmailHash?: string;
  channel: string; templateKey: string; templateType: string; locale: string;
  triggerEvent: string; deliveryStatus: DeliveryStatus;
  deliveryStatusHistory: Array<{ status: string; timestamp: Date }>;
  retryCount: number; queuedAt: Date; dispatchedAt?: Date; bullJobId?: string;
}
export const WorkspaceNotifLog: Model<IWNotif> =
  (mongoose.models['WorkspaceNotifLog'] as Model<IWNotif>) ?? model<IWNotif>('WorkspaceNotifLog', WNotifSchema);

// ─────────────────────────────────────────────────────────────────────────────
// §10  IMMUTABLE AUDIT TRAIL  (tenant-scoped, append-only HMAC chain)
// ─────────────────────────────────────────────────────────────────────────────

const WAuditSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, required: true, immutable: true },

    // Actor context
    actorId:         { type: Schema.Types.ObjectId },   // NULL = system / agent
    actorEmailHash:  { type: String, maxlength: 64 },
    actorRole:       { type: String },
    actorIpHash:     { type: String, maxlength: 64 },   // HMAC of IP — no raw IPs
    actorTrustLevel: { type: String },

    // Action metadata
    actionType: {
      type: String,
      enum: [
        'INSERT','UPDATE','DELETE',
        'EMPLOYEE_CREATED','LEAVE_REQUESTED','PAYROLL_RUN_CREATED',
        'SALARY_CHANGE','BANKING_CHANGE','EQUITY_CHANGE','STATUS_CHANGE',
        'PERMISSION_ESCALATION','BULK_OVERRIDE','COMPLIANCE_OVERRIDE',
        'OFFBOARD_REVOKE','PAYROLL_APPROVED','PAYROLL_REVERSED',
        'DEK_ROTATION','AUDIT_EXPORT','ACCESS_REVOKED','ACCESS_RESTORED',
        'LIVENESS_VERIFIED','LIVENESS_FAILED','DEVICE_COMPLIANCE_BREACH',
        'IMMIGRATION_NEXUS_TRIGGERED','EQUITY_VEST_EXECUTED',
        'TENANT_UPDATED','TENANT_DELETED',
      ],
      required: true,
    },
    targetCollection: { type: String, required: true },
    targetDocumentId: { type: Schema.Types.ObjectId },
    modifiedPaths:    [{ type: String }],

    // Cryptographic chain (blockchain-style)
    oldStateHash:     { type: String, maxlength: 64 },
    newStateHash:     { type: String, required: true, maxlength: 64 },
    previousHash:     { type: String, maxlength: 64 },    // NULL = genesis entry
    digitalSignature: { type: String, required: true, maxlength: 64 },
    sequenceNumber:   { type: Number, required: true, min: 1 },

    // Sanitized change summary — zero raw PII
    changeSummary: { type: Schema.Types.Mixed, default: {} },
    kafkaEventId:  { type: String },

    // Immutable timestamp — no updatedAt
    createdAt: { type: Date, default: Date.now, immutable: true },
  },
  {
    collection: 'ws_audit_trail',
    timestamps: { createdAt: true, updatedAt: false },
  }
);

WAuditSchema.index({ tenantId: 1, sequenceNumber: 1 }, { unique: true });
WAuditSchema.index({ tenantId: 1, actorId: 1, createdAt: -1 });
WAuditSchema.index({ tenantId: 1, targetCollection: 1, targetDocumentId: 1 });
WAuditSchema.index({ tenantId: 1, actionType: 1, createdAt: -1 });
// 7-year regulatory retention TTL
WAuditSchema.index({ createdAt: 1 }, { name: 'idx_ttl_regulatory_7yr', expireAfterSeconds: 220_752_000 });

// ── Immutability: block all mutation operations (ADR-006) ─────────────────────
// All 6 Mongoose mutation hooks throw synchronously.  The only way to write
// to ws_audit_trail is via WorkspaceAuditTrail.create() / .appendEvent(),
// both of which are INSERT-only.  No replaceOne / bulkWrite escape hatch.
const AUDIT_IMMUTABLE_MSG = 'AUDIT_IMMUTABILITY_VIOLATION: audit trail records are permanent';
for (const op of ['updateOne','updateMany','findOneAndUpdate','findOneAndReplace','deleteOne','deleteMany','findOneAndDelete']) {
  hookPre(WAuditSchema, op, function () {
    throw new Error(AUDIT_IMMUTABLE_MSG);
  });
}

// ── Static: append to cryptographic chain ────────────────────────────────────
// Concurrency model:
//   The (tenantId, sequenceNumber) unique index rejects duplicate inserts
//   when two appends race.  We retry up to 5 times with exponential backoff
//   on E11000 duplicate-key errors; each retry re-reads the last sequence
//   number and re-derives the hash chain.
//
//   The HMAC chain hashes:
//     digitalSignature = HMAC(auditKey, newStateHash : previousHash : tenantId)
//   ensuring tampering with any single entry breaks signature verification.
WAuditSchema.statics.appendEvent = async function (event: {
  tenantId:          Types.ObjectId;
  actorId?:          Types.ObjectId;
  actorRole?:        string;
  actorTrustLevel?:  string;
  actionType:        string;
  targetCollection:  string;
  targetDocumentId?: Types.ObjectId;
  modifiedPaths?:    string[];
  oldStateHash?:     string;
  newStateHash:      string;
  changeSummary?:    Record<string, unknown>;
  kafkaEventId?:     string;
  auditKey:          string;
}) {
  const MAX_RETRIES = 5;
  let attempt = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let lastError: any = null;

  while (attempt < MAX_RETRIES) {
    const last = await this.findOne(
      { tenantId: event.tenantId },
      { newStateHash: 1, sequenceNumber: 1 },
      { sort: { sequenceNumber: -1 } },
    ).lean() as { newStateHash?: string; sequenceNumber?: number } | null;

    const previousHash   = last?.newStateHash ?? null;
    const sequenceNumber = (last?.sequenceNumber ?? 0) + 1;
    const digitalSignature = createHmac('sha256', event.auditKey)
      .update(`${event.newStateHash}:${previousHash ?? 'GENESIS'}:${event.tenantId.toString()}`)
      .digest('hex');

    try {
      return await this.create({ ...event, previousHash, sequenceNumber, digitalSignature });
    } catch (err) {
      lastError = err;
      // E11000 duplicate key — another append won the race; retry
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const code = (err as any)?.code;
      if (code !== 11000) throw err;
      attempt++;
      // Exponential backoff: 5ms, 10ms, 20ms, 40ms, 80ms
      await new Promise((r) => setTimeout(r, 5 * Math.pow(2, attempt - 1)));
    }
  }
  throw lastError ?? new Error('Audit chain append failed after retries');
};

/**
 * Verifies the integrity of the entire audit chain for a tenant.
 * Walks every entry in sequence-order and re-derives the digitalSignature.
 * Returns an array of {sequenceNumber, ok} so a worker can flag tampered rows.
 *
 * Used by the daily Audit Chain Verifier cron (workers/auditChainVerifier.ts).
 */
WAuditSchema.statics.verifyChain = async function (
  tenantId:  Types.ObjectId,
  auditKey:  string,
  opts:      { limit?: number; fromSequence?: number } = {},
): Promise<Array<{ sequenceNumber: number; ok: boolean; reason?: string }>> {
  const query: Record<string, unknown> = { tenantId };
  if (opts.fromSequence) query['sequenceNumber'] = { $gte: opts.fromSequence };

  const entries = await this
    .find(query, { sequenceNumber: 1, previousHash: 1, newStateHash: 1, digitalSignature: 1 })
    .sort({ sequenceNumber: 1 })
    .limit(opts.limit ?? 10_000)
    .lean() as Array<{ sequenceNumber: number; previousHash?: string; newStateHash: string; digitalSignature: string }>;

  const results: Array<{ sequenceNumber: number; ok: boolean; reason?: string }> = [];
  let expectedPrev: string | null = null;

  for (const e of entries) {
    let ok     = true;
    let reason = '';

    // Chain link check
    if (e.sequenceNumber === 1) {
      if (e.previousHash) { ok = false; reason = 'genesis entry has previousHash'; }
    } else if (e.previousHash !== expectedPrev) {
      ok = false; reason = 'broken chain link';
    }

    // Signature re-derivation check
    const expectedSig = createHmac('sha256', auditKey)
      .update(`${e.newStateHash}:${e.previousHash ?? 'GENESIS'}:${tenantId.toString()}`)
      .digest('hex');
    if (expectedSig !== e.digitalSignature) {
      ok = false; reason = reason || 'signature mismatch';
    }

    results.push({ sequenceNumber: e.sequenceNumber, ok, reason: ok ? undefined : reason });
    expectedPrev = e.newStateHash;
  }
  return results;
};

export interface IWAudit extends Document {
  tenantId: Types.ObjectId; actorId?: Types.ObjectId; actorRole?: string;
  actionType: string; targetCollection: string; targetDocumentId?: Types.ObjectId;
  newStateHash: string; previousHash?: string; digitalSignature: string;
  sequenceNumber: number; changeSummary: Record<string, unknown>; createdAt: Date;
}
export interface IWAuditModel extends Model<IWAudit> {
  appendEvent(event: {
    tenantId: Types.ObjectId; actorId?: Types.ObjectId; actorRole?: string;
    actorTrustLevel?: string; actionType: string; targetCollection: string;
    targetDocumentId?: Types.ObjectId; modifiedPaths?: string[];
    oldStateHash?: string; newStateHash: string;
    changeSummary?: Record<string, unknown>; kafkaEventId?: string; auditKey: string;
  }): Promise<HydratedDocument<IWAudit>>;
  /** Verifies the HMAC chain integrity for a tenant.  Returns per-entry results. */
  verifyChain(
    tenantId: Types.ObjectId,
    auditKey: string,
    opts?:    { limit?: number; fromSequence?: number },
  ): Promise<Array<{ sequenceNumber: number; ok: boolean; reason?: string }>>;
}
export const WorkspaceAuditTrail: IWAuditModel =
  (mongoose.models['WorkspaceAuditTrail'] as IWAuditModel) ??
  model<IWAudit, IWAuditModel>('WorkspaceAuditTrail', WAuditSchema);

// ─────────────────────────────────────────────────────────────────────────────
// §11  PULSE TELEMETRY  (tenant-scoped, MongoDB Bucket Pattern — ADR-002)
//
// Anonymized engagement / wellbeing micro-survey responses, bucketed at ~200
// pulses per document.  Bucket Pattern keeps the working set tiny — one
// document per (department × month) instead of one per pulse — eliminating
// index bloat and enabling sub-millisecond aggregations.
//
// Anonymity contract:
//   • Pulses are bucketed by department, NEVER by employeeId.
//   • If bucket size < 5 distinct submitters, aggregations must redact.
//   • Buckets are append-only — no edits or deletions of individual pulses.
// ─────────────────────────────────────────────────────────────────────────────

const PULSE_BUCKET_TARGET = 200;

const PulseResponseS = new Schema({
  responseId:        { type: String, required: true },          // opaque random uuid
  submittedAt:       { type: Date,   required: true },
  surveyKey:         { type: String, required: true, lowercase: true },
  pulseType:         {
    type: String,
    enum: ['enps','burnout','manager_feedback','culture','workload','psychological_safety','wellbeing'],
    required: true,
  },
  // Anonymized cohort attribution — used for aggregation only
  departmentCode:    { type: String, required: true, uppercase: true },
  countryCode:       { type: String, required: true, uppercase: true, maxlength: 2 },
  tenureBand:        { type: String, enum: ['<6mo','6-12mo','1-2y','2-5y','5y+'] },
  // Quantitative signal
  numericScore:      { type: Number, min: 0, max: 10 },         // eNPS-style score
  scaleType:         { type: String, enum: ['nps_0_10','likert_5','binary','custom'], default: 'nps_0_10' },
  // Optional sentiment vector (already redacted, no raw text)
  sentimentBucket:   { type: String, enum: ['positive','neutral','negative','unclassified'] },
  freeTextRedactedHash: { type: String, maxlength: 64 },        // SHA-256 of normalized text — never raw
  // Device meta (no identifiers)
  submittedVia:      { type: String, enum: ['email_link','in_app','slack','teams','sms'] },
}, { _id: false });

const WPulseTelemetrySchema = new Schema(
  {
    tenantId:        { type: Schema.Types.ObjectId, required: true, immutable: true },
    // Bucket primary key: (tenantId, departmentCode, bucketPeriod, surveyKey)
    departmentCode:  { type: String, required: true, uppercase: true, immutable: true },
    surveyKey:       { type: String, required: true, lowercase: true, immutable: true },
    bucketPeriodStart: { type: Date, required: true, immutable: true },
    bucketPeriodEnd:   { type: Date, required: true, immutable: true },
    granularity:     { type: String, enum: ['daily','weekly','monthly'], default: 'monthly', immutable: true },

    // Append-only responses (ADR-002 capped at ~200 per bucket)
    responses:       {
      type: [PulseResponseS], default: [],
      validate: {
        validator: (v: unknown[]) => v.length <= PULSE_BUCKET_TARGET,
        message:   `Bucket at capacity (max ${PULSE_BUCKET_TARGET}) — rotate to new bucket`,
      },
    },
    responseCount:   { type: Number, default: 0, min: 0 },
    isSealed:        { type: Boolean, default: false },          // closes the bucket for further writes

    // Precomputed aggregates (refreshed by analytics worker on each append)
    aggregates: {
      avgScore:           { type: Number, min: 0, max: 10 },
      eNps:               { type: Number, min: -100, max: 100 },
      promoterCount:      { type: Number, default: 0 },
      passiveCount:       { type: Number, default: 0 },
      detractorCount:     { type: Number, default: 0 },
      sentimentPositive:  { type: Number, default: 0 },
      sentimentNeutral:   { type: Number, default: 0 },
      sentimentNegative:  { type: Number, default: 0 },
      lastAggregatedAt:   { type: Date },
      sufficientForReport:{ type: Boolean, default: false },     // true when uniqueRespondents ≥ 5
      uniqueRespondents:  { type: Number, default: 0 },
    },
  },
  { timestamps: true, collection: 'ws_pulse_telemetry_buckets' }
);

WPulseTelemetrySchema.index(
  { tenantId: 1, departmentCode: 1, surveyKey: 1, bucketPeriodStart: 1 },
  { unique: true, name: 'idx_pulse_bucket_pk' },
);
WPulseTelemetrySchema.index({ tenantId: 1, bucketPeriodStart: -1, isSealed: 1 });
WPulseTelemetrySchema.index({ tenantId: 1, 'aggregates.eNps': -1 }, {
  partialFilterExpression: { 'aggregates.sufficientForReport': true },
});

// Block any mutation of individual response entries — only $push allowed
hookPre(WPulseTelemetrySchema, 'findOneAndUpdate', function (this: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upd = (this as any).getUpdate() as Record<string, unknown>;
  const $set = upd?.['$set'] as Record<string, unknown> | undefined;
  if ($set && ($set['responses'] !== undefined ||
                Object.keys($set).some((k) => k.startsWith('responses.')))) {
    throw new Error('PULSE_IMMUTABLE: use $push to append responses, never $set');
  }
});

// Auto-seal once bucket reaches capacity (post-save trigger)
hookPre(WPulseTelemetrySchema, 'save', function (this: HydratedDocument<IWPulseTelemetry>) {
  if (typeof this.isModified !== 'function') return;
  if (Array.isArray(this.responses)) {
    this.responseCount = this.responses.length;
    if (this.responses.length >= PULSE_BUCKET_TARGET) this.isSealed = true;

    // ── k≥5 anonymity gate (ADR-002) ───────────────────────────────────────
    // Bucket aggregates are only reportable when at least 5 distinct
    // submitters contributed.  uniqueRespondents counts unique responseId
    // prefixes (the responseId is a salted UUID, so 5 distinct IDs = 5
    // distinct anonymous submitters).
    const distinctIds   = new Set(this.responses.map((r) => r.responseId.slice(0, 16)));
    this.aggregates.uniqueRespondents    = distinctIds.size;
    this.aggregates.sufficientForReport  = distinctIds.size >= 5;
  }
});

export interface IWPulseTelemetry extends Document {
  tenantId: Types.ObjectId; departmentCode: string; surveyKey: string;
  bucketPeriodStart: Date; bucketPeriodEnd: Date; granularity: 'daily'|'weekly'|'monthly';
  responses: Array<{
    responseId: string; submittedAt: Date; surveyKey: string; pulseType: string;
    departmentCode: string; countryCode: string; tenureBand?: string;
    numericScore?: number; scaleType?: string; sentimentBucket?: string;
  }>;
  responseCount: number; isSealed: boolean;
  aggregates: {
    avgScore?: number; eNps?: number;
    promoterCount: number; passiveCount: number; detractorCount: number;
    sentimentPositive: number; sentimentNeutral: number; sentimentNegative: number;
    lastAggregatedAt?: Date; sufficientForReport: boolean; uniqueRespondents: number;
  };
}
export const WorkspacePulseTelemetry: Model<IWPulseTelemetry> =
  (mongoose.models['WorkspacePulseTelemetry'] as Model<IWPulseTelemetry>) ??
  model<IWPulseTelemetry>('WorkspacePulseTelemetry', WPulseTelemetrySchema);

// ─────────────────────────────────────────────────────────────────────────────
// §12  ATTENDANCE  (tenant-scoped, MongoDB native Time-Series — ADR-004)
//
// Shift check-in / check-out events written via Kafka or BullMQ ingestion
// workers.  Stored in a TIME-SERIES collection so MongoDB can compress with
// best-fit delta encoding (10-100× space reduction vs. regular collections).
//
// timeField:  ts            — primary clustering axis (seconds granularity)
// metaField:  meta          — { tenantId, employeeId, deviceId } — drives the
//                             bucket key.  Mongoose v9 stores tenantId on this
//                             nested field so we register a synthetic top-level
//                             tenantId for the global isolation plugin too.
// ─────────────────────────────────────────────────────────────────────────────

const WAttendanceTSSchema = new Schema(
  {
    // Mongoose Time-Series uses `meta` for the metaField — keep it shallow
    meta: {
      tenantId:    { type: Schema.Types.ObjectId, required: true },
      employeeId:  { type: Schema.Types.ObjectId, required: true },
      employeeCode:{ type: String,                required: true },
      deviceId:    { type: String },
      shiftCode:   { type: String },
      siteCode:    { type: String, uppercase: true },
    },
    // Mirror tenantId at top level — required for global plugin
    tenantId: { type: Schema.Types.ObjectId, required: true, immutable: true },

    ts:          { type: Date, required: true, default: Date.now },
    eventType:   { type: String, enum: ['check_in','check_out','break_start','break_end','sync','manual_adjust'], required: true },

    // Geofencing (no raw GPS retained → only verified zone-id)
    geofenceZoneId: { type: String },
    verifiedInZone: { type: Boolean, default: false },

    // Biometric verification meta (no template data)
    biometricMethod:    { type: String, enum: ['fingerprint','face','iris','webauthn','manual'] },
    biometricMatchScore:{ type: Number, min: 0, max: 1 },
    biometricPassed:    { type: Boolean, default: false },

    // Ingestion provenance
    sourceProvider: { type: String, enum: ['mobile_app','web_portal','kiosk','badge_reader','agent_sync'] },
    kafkaOffset:    { type: Number },
    bullJobId:      { type: String },
    receivedAt:     { type: Date, default: Date.now },

    // Anomaly fingerprint — populated by the agentic shift auditor
    anomalyCode:    { type: String, enum: ['none','out_of_geofence','overlapping_shift','impossible_travel','suspicious_pattern'], default: 'none' },
  },
  {
    collection: 'ws_attendance_timeseries',
    timeseries: {
      timeField:   'ts',
      metaField:   'meta',
      granularity: 'seconds',
    },
    // expire bucketed series after 5 years
    expireAfterSeconds: 5 * 365 * 86_400,
    autoCreate: true,
  } as mongoose.SchemaOptions,
);

// Secondary indexes on metaField sub-keys — accelerate per-employee scans
WAttendanceTSSchema.index({ 'meta.tenantId': 1, 'meta.employeeId': 1, ts: -1 });
WAttendanceTSSchema.index({ 'meta.tenantId': 1, eventType: 1, ts: -1 });
WAttendanceTSSchema.index({ 'meta.tenantId': 1, anomalyCode: 1, ts: -1 },
  { partialFilterExpression: { anomalyCode: { $ne: 'none' } } });

// Sync the top-level tenantId from meta.tenantId on every insert
hookPre(WAttendanceTSSchema, 'save', function (this: HydratedDocument<IWAttendanceTS>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = this as any;
  if (raw?.meta?.tenantId && !raw.tenantId) raw.tenantId = raw.meta.tenantId;
});

export interface IWAttendanceTS extends Document {
  tenantId: Types.ObjectId;
  meta: {
    tenantId: Types.ObjectId; employeeId: Types.ObjectId; employeeCode: string;
    deviceId?: string; shiftCode?: string; siteCode?: string;
  };
  ts: Date;
  eventType: 'check_in'|'check_out'|'break_start'|'break_end'|'sync'|'manual_adjust';
  geofenceZoneId?: string; verifiedInZone: boolean;
  biometricMethod?: string; biometricMatchScore?: number; biometricPassed: boolean;
  sourceProvider?: string; kafkaOffset?: number; bullJobId?: string; receivedAt: Date;
  anomalyCode: string;
}
export const WorkspaceAttendance: Model<IWAttendanceTS> =
  (mongoose.models['WorkspaceAttendance'] as Model<IWAttendanceTS>) ??
  model<IWAttendanceTS>('WorkspaceAttendance', WAttendanceTSSchema);

// ─────────────────────────────────────────────────────────────────────────────
// §12b  ATTENDANCE REGULARIZATION REQUEST
//
// Employees submit these when they need to correct a past day's attendance
// (missed punch-in/out, WFH not captured, etc.).  On approval the handler
// creates manual_adjust events in ws_attendance_timeseries.
// ─────────────────────────────────────────────────────────────────────────────

const WAttendanceRegS = new Schema(
  {
    tenantId:              { type: Schema.Types.ObjectId, required: true, immutable: true },
    employeeId:            { type: Schema.Types.ObjectId, required: true },
    managerId:             { type: Schema.Types.ObjectId },          // line manager's employee OID
    date:                  { type: Date, required: true },           // calendar day being corrected
    requestedCheckIn:      { type: Date, required: true },
    requestedCheckOut:     { type: Date },
    reason:                { type: String, required: true, maxlength: 500, trim: true },
    status:                { type: String, enum: ['pending','approved','rejected'], default: 'pending' },
    managerApprovedById:   { type: Schema.Types.ObjectId },          // userId who approved (manager)
    managerApprovedAt:     { type: Date },
    rejectionReason:       { type: String, maxlength: 500 },
    appliedAt:             { type: Date },                           // when manual_adjust events were written
  },
  { timestamps: true },
);
WAttendanceRegS.index({ tenantId: 1, employeeId: 1, date: 1 });
WAttendanceRegS.index({ tenantId: 1, managerId: 1, status: 1, createdAt: -1 });
WAttendanceRegS.index({ tenantId: 1, status: 1, createdAt: -1 });

export interface IWAttendanceReg extends Document {
  tenantId: Types.ObjectId; employeeId: Types.ObjectId; managerId?: Types.ObjectId;
  date: Date; requestedCheckIn: Date; requestedCheckOut?: Date;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  managerApprovedById?: Types.ObjectId; managerApprovedAt?: Date;
  rejectionReason?: string; appliedAt?: Date;
  createdAt: Date; updatedAt: Date;
}
export const WorkspaceAttendanceReg: Model<IWAttendanceReg> =
  (mongoose.models['WorkspaceAttendanceReg'] as Model<IWAttendanceReg>) ??
  model<IWAttendanceReg>('WorkspaceAttendanceReg', WAttendanceRegS, 'ws_attendance_regularizations');

// ─────────────────────────────────────────────────────────────────────────────
// §13  IN-APP NOTIFICATION  (tenant-scoped, per-user inbox)
//
// Lightweight in-app notification model — separate from WorkspaceNotifLog
// (which is the email/SMS delivery log).  This drives the TopBar bell badge
// and the notification drawer.
// ─────────────────────────────────────────────────────────────────────────────

const WInAppNotifSchema = new Schema(
  {
    tenantId:   { type: Schema.Types.ObjectId, required: true, immutable: true },
    userId:     { type: Schema.Types.ObjectId, required: true },
    employeeId: { type: Schema.Types.ObjectId },

    type: {
      type: String,
      enum: [
        'leave_approved','leave_rejected','leave_request',
        'payroll_ready','payroll_approved','payroll_reversed',
        'device_warning','access_revoked','liveness_required',
        'visa_expiry','immigration_alert',
        'equity_vest','equity_exercise',
        'system_message','announcement','task_assigned',
      ],
      required: true,
    },
    title:     { type: String, required: true, trim: true, maxlength: 160 },
    body:      { type: String, trim: true, maxlength: 500 },
    actionUrl: { type: String, trim: true },
    isRead:    { type: Boolean, default: false },
    readAt:    { type: Date },
    priority:  { type: String, enum: ['low','normal','high','critical'], default: 'normal' },
    metadata:  { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: 'ws_inapp_notifications' },
);

WInAppNotifSchema.index({ tenantId: 1, userId: 1, isRead: 1, createdAt: -1 });
WInAppNotifSchema.index({ tenantId: 1, userId: 1, createdAt: -1 });
// Auto-expire in-app notifications after 90 days
WInAppNotifSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 86_400 });

export type InAppNotifType =
  | 'leave_approved' | 'leave_rejected' | 'leave_request'
  | 'payroll_ready'  | 'payroll_approved' | 'payroll_reversed'
  | 'device_warning' | 'access_revoked' | 'liveness_required'
  | 'visa_expiry'    | 'immigration_alert'
  | 'equity_vest'    | 'equity_exercise'
  | 'review_opened'  | 'review_submitted' | 'review_finalized'
  | 'comp_recommended' | 'comp_approved' | 'comp_rejected'
  | 'system_message' | 'announcement' | 'task_assigned';

export interface IWInAppNotif extends Document {
  tenantId:   Types.ObjectId;
  userId:     Types.ObjectId;
  employeeId?: Types.ObjectId;
  type:       InAppNotifType;
  title:      string;
  body?:      string;
  actionUrl?: string;
  isRead:     boolean;
  readAt?:    Date;
  priority:   'low' | 'normal' | 'high' | 'critical';
  metadata:   Record<string, unknown>;
  createdAt:  Date;
  updatedAt:  Date;
}
export const WorkspaceInAppNotification: Model<IWInAppNotif> =
  (mongoose.models['WorkspaceInAppNotification'] as Model<IWInAppNotif>) ??
  model<IWInAppNotif>('WorkspaceInAppNotification', WInAppNotifSchema);

// ─────────────────────────────────────────────────────────────────────────────
// §14  USER SETTINGS  (tenant-scoped, one document per WorkspaceUser)
// ─────────────────────────────────────────────────────────────────────────────

const WUserSettingsSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    userId:   { type: Schema.Types.ObjectId, required: true, immutable: true },

    profile: {
      displayName:  { type: String, trim: true },
      avatarUrl:    { type: String },
      preferredLang:{ type: String, default: 'en' },
      timezone:     { type: String, default: 'UTC' },
      dateFormat:   { type: String, enum: ['MM/DD/YYYY','DD/MM/YYYY','YYYY-MM-DD'], default: 'DD/MM/YYYY' },
    },

    notifications: {
      emailEnabled:    { type: Boolean, default: true },
      inAppEnabled:    { type: Boolean, default: true },
      leaveUpdates:    { type: Boolean, default: true },
      payrollReady:    { type: Boolean, default: true },
      securityAlerts:  { type: Boolean, default: true },
      announcements:   { type: Boolean, default: true },
      visaExpiry:      { type: Boolean, default: true },
      digestFrequency: { type: String, enum: ['realtime','daily','weekly','off'], default: 'realtime' },
    },

    security: {
      mfaEnabled:          { type: Boolean, default: false },
      lastPasswordChanged: { type: Date },
      trustedDevices:      [{ deviceId: String, label: String, lastSeenAt: Date }],
      sessionTimeout:      { type: Number, default: 480 },   // minutes
    },

    ui: {
      sidebarCollapsed: { type: Boolean, default: false },
      compactMode:      { type: Boolean, default: false },
      colorScheme:      { type: String, enum: ['system','light','dark'], default: 'light' },
    },
  },
  { timestamps: true, collection: 'ws_user_settings' },
);
WUserSettingsSchema.index({ tenantId: 1, userId: 1 }, { unique: true });

export interface IWUserSettings extends Document {
  tenantId: Types.ObjectId;
  userId:   Types.ObjectId;
  profile:  { displayName?: string; avatarUrl?: string; preferredLang: string; timezone: string; dateFormat: string };
  notifications: { emailEnabled: boolean; inAppEnabled: boolean; leaveUpdates: boolean; payrollReady: boolean; securityAlerts: boolean; announcements: boolean; visaExpiry: boolean; digestFrequency: string };
  security: { mfaEnabled: boolean; lastPasswordChanged?: Date; trustedDevices: Array<{ deviceId: string; label: string; lastSeenAt: Date }>; sessionTimeout: number };
  ui: { sidebarCollapsed: boolean; compactMode: boolean; colorScheme: string };
}
export const WorkspaceUserSettings: Model<IWUserSettings> =
  (mongoose.models['WorkspaceUserSettings'] as Model<IWUserSettings>) ??
  model<IWUserSettings>('WorkspaceUserSettings', WUserSettingsSchema);

// ─────────────────────────────────────────────────────────────────────────────
// §15  PERFORMANCE REVIEW  (tenant-scoped — PMS)
//
// One document per employee per review cycle.  Drives the appraisal workflow:
//   draft → self_assessment → manager_review → finalized → acknowledged
// Self-ratings and manager-ratings co-locate on each competency row so the
// review detail can render a side-by-side comparison without a join.
// ─────────────────────────────────────────────────────────────────────────────

export type PerfReviewStatus =
  | 'draft' | 'self_assessment' | 'manager_review' | 'finalized' | 'acknowledged';

/** Fixed competency framework — keep in sync with the PMS UI. */
export const PERF_COMPETENCIES = [
  { key: 'delivery',      label: 'Delivery & Execution' },
  { key: 'collaboration', label: 'Collaboration' },
  { key: 'expertise',     label: 'Technical Expertise' },
  { key: 'ownership',     label: 'Ownership & Initiative' },
  { key: 'communication', label: 'Communication' },
] as const;

const PerfCompetencyS = new Schema({
  key:           { type: String, required: true },
  label:         { type: String, required: true },
  selfRating:    { type: Number, min: 1, max: 5 },
  selfComment:   { type: String, trim: true },
  managerRating: { type: Number, min: 1, max: 5 },
  managerComment:{ type: String, trim: true },
}, { _id: false });

const PerfGoalS = new Schema({
  title:       { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  weight:      { type: Number, min: 0, max: 100, default: 0 },
  status:      { type: String, enum: ['not_started','in_progress','achieved','missed'], default: 'not_started' },
}, { _id: false });

// One step in a (possibly multi-step) compensation approval chain.
const CompApprovalStepS = new Schema({
  step:        { type: String, enum: ['skip_level','hr'], required: true },
  status:      { type: String, enum: ['pending','approved','rejected'], default: 'pending' },
  approverId:  { type: Schema.Types.ObjectId },   // user who acted
  approverRole:{ type: String },
  decidedAt:   { type: Date },
  note:        { type: String, trim: true },
}, { _id: false });

const WPerfReviewSchema = new Schema(
  {
    tenantId:       { type: Schema.Types.ObjectId, required: true, immutable: true },
    employeeId:     { type: Schema.Types.ObjectId, ref: 'WorkspaceEmployee', required: true },
    // Denormalised display fields (employee PII is encrypted, so we cannot read fullName cheaply)
    employeeCode:   { type: String, required: true },
    jobTitle:       { type: String },
    departmentName: { type: String },
    reviewerId:     { type: Schema.Types.ObjectId },   // HR/manager user who finalizes
    cycleLabel:     { type: String, required: true, trim: true },   // e.g. "H1 2026"
    periodStart:    { type: Date, required: true },
    periodEnd:      { type: Date, required: true },
    status:         { type: String, enum: ['draft','self_assessment','manager_review','finalized','acknowledged'], default: 'draft' },
    competencies:   { type: [PerfCompetencyS], default: [] },
    goals:          { type: [PerfGoalS], default: [] },
    selfAssessment: {
      summary:      { type: String, trim: true },
      achievements: { type: String, trim: true },
      challenges:   { type: String, trim: true },
      submittedAt:  { type: Date },
    },
    managerReview: {
      summary:          { type: String, trim: true },
      areasOfStrength:  { type: String, trim: true },
      areasToImprove:   { type: String, trim: true },
      overallRating:    { type: Number, min: 1, max: 5 },
      submittedAt:      { type: Date },
      reviewerId:       { type: Schema.Types.ObjectId },
    },
    // Compensation recommendation → HR decision → salary revision (feeds payroll).
    // Stores only the increment % / promotion metadata — never plaintext salary.
    compensation: {
      recommended:        { type: Boolean, default: false },
      recommendedById:    { type: Schema.Types.ObjectId },     // user who recommended
      recommendedByEmpId: { type: Schema.Types.ObjectId },     // their employee record (if any)
      recommendedByManager: { type: Boolean, default: false }, // true if recommender is the employee's DIRECT line manager
      recommenderRelationship: { type: String, enum: ['direct','skip_level','higher','not_in_chain'], default: 'not_in_chain' },
      recommendedAt:   { type: Date },
      promotion:       { type: Boolean, default: false },
      proposedTitle:   { type: String, trim: true },
      proposedBand:    { type: String, trim: true },
      incrementPct:    { type: Number, min: 0, max: 100, default: 0 },
      justification:   { type: String, trim: true },
      // Approval routing.  Single-step → just an HR decision.  Two-step
      // (promotions / large increments) → skip-level manager endorsement, then HR.
      requiresTwoStep:    { type: Boolean, default: false },
      currentStep:        { type: String, enum: ['skip_level','hr', null], default: null },
      skipLevelManagerId: { type: Schema.Types.ObjectId },     // employee record of the 2nd-line manager
      approvals:          { type: [CompApprovalStepS], default: [] },
      decision:        { type: String, enum: ['none','pending','accepted','rejected'], default: 'none' },
      decidedById:     { type: Schema.Types.ObjectId },        // user who gave the FINAL decision
      decidedAt:       { type: Date },
      decisionNote:    { type: String, trim: true },
      effectiveDate:   { type: Date },
      appliedAt:       { type: Date },
    },
    overallRating:  { type: Number, min: 1, max: 5 },
    employeeAck: {
      acknowledged:   { type: Boolean, default: false },
      comment:        { type: String, trim: true },
      acknowledgedAt: { type: Date },
    },
    isActive:       { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'ws_performance_reviews' }
);
WPerfReviewSchema.index({ tenantId: 1, employeeId: 1, cycleLabel: 1 }, { unique: true });
WPerfReviewSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
WPerfReviewSchema.index({ tenantId: 1, 'compensation.decision': 1, createdAt: -1 });

export interface IWPerfReview extends Document {
  tenantId: Types.ObjectId; employeeId: Types.ObjectId;
  employeeCode: string; jobTitle?: string; departmentName?: string;
  reviewerId?: Types.ObjectId; cycleLabel: string;
  periodStart: Date; periodEnd: Date; status: PerfReviewStatus;
  competencies: Array<{ key: string; label: string; selfRating?: number; selfComment?: string; managerRating?: number; managerComment?: string }>;
  goals: Array<{ title: string; description?: string; weight: number; status: string }>;
  selfAssessment: { summary?: string; achievements?: string; challenges?: string; submittedAt?: Date };
  managerReview: { summary?: string; areasOfStrength?: string; areasToImprove?: string; overallRating?: number; submittedAt?: Date; reviewerId?: Types.ObjectId };
  compensation: {
    recommended: boolean; recommendedById?: Types.ObjectId; recommendedByEmpId?: Types.ObjectId; recommendedByManager?: boolean;
    recommenderRelationship?: 'direct' | 'skip_level' | 'higher' | 'not_in_chain'; recommendedAt?: Date;
    promotion: boolean; proposedTitle?: string; proposedBand?: string;
    incrementPct: number; justification?: string;
    requiresTwoStep?: boolean; currentStep?: 'skip_level' | 'hr' | null; skipLevelManagerId?: Types.ObjectId;
    approvals?: Array<{ step: 'skip_level' | 'hr'; status: 'pending' | 'approved' | 'rejected'; approverId?: Types.ObjectId; approverRole?: string; decidedAt?: Date; note?: string }>;
    decision: 'none' | 'pending' | 'accepted' | 'rejected';
    decidedById?: Types.ObjectId; decidedAt?: Date; decisionNote?: string;
    effectiveDate?: Date; appliedAt?: Date;
  };
  overallRating?: number;
  employeeAck: { acknowledged: boolean; comment?: string; acknowledgedAt?: Date };
  isActive: boolean; createdAt: Date; updatedAt: Date;
}
export const WorkspacePerformanceReview: Model<IWPerfReview> =
  (mongoose.models['WorkspacePerformanceReview'] as Model<IWPerfReview>) ??
  model<IWPerfReview>('WorkspacePerformanceReview', WPerfReviewSchema);

// ─────────────────────────────────────────────────────────────────────────────
// §15b  COMPENSATION HISTORY  (tenant-scoped — immutable audit of salary revisions)
//
// One append-only record per applied salary revision.  Salaries are encrypted
// at rest; old/new amounts are stored as encrypted Buffers, with the increment %
// kept in clear for reporting.  Sourced from accepted PMS recommendations (or
// future ad-hoc comp changes).
// ─────────────────────────────────────────────────────────────────────────────

const WCompHistSchema = new Schema(
  {
    tenantId:        { type: Schema.Types.ObjectId, required: true, immutable: true },
    employeeId:      { type: Schema.Types.ObjectId, ref: 'WorkspaceEmployee', required: true },
    employeeCode:    { type: String, required: true },
    reviewId:        { type: Schema.Types.ObjectId, ref: 'WorkspacePerformanceReview' },
    cycleLabel:      { type: String },
    changeType:      { type: String, enum: ['merit','promotion','market','adjustment'], default: 'merit' },
    currencyCode:    { type: String, uppercase: true, maxlength: 3 },
    oldSalaryEnc:    { type: Buffer, required: true },
    newSalaryEnc:    { type: Buffer, required: true },
    incrementPct:    { type: Number, default: 0 },
    promotion:       { type: Boolean, default: false },
    oldTitle:        { type: String },
    newTitle:        { type: String },
    oldBand:         { type: String },
    newBand:         { type: String },
    effectiveDate:   { type: Date, required: true },
    decidedById:     { type: Schema.Types.ObjectId },
    note:            { type: String, trim: true },
  },
  { timestamps: true, collection: 'ws_compensation_history' }
);
WCompHistSchema.index({ tenantId: 1, employeeId: 1, effectiveDate: -1 });

export interface IWCompHist extends Document {
  tenantId: Types.ObjectId; employeeId: Types.ObjectId; employeeCode: string;
  reviewId?: Types.ObjectId; cycleLabel?: string; changeType: string;
  currencyCode?: string; oldSalaryEnc: Buffer; newSalaryEnc: Buffer;
  incrementPct: number; promotion: boolean;
  oldTitle?: string; newTitle?: string; oldBand?: string; newBand?: string;
  effectiveDate: Date; decidedById?: Types.ObjectId; note?: string; createdAt: Date;
}
export const WorkspaceCompensationHistory: Model<IWCompHist> =
  (mongoose.models['WorkspaceCompensationHistory'] as Model<IWCompHist>) ??
  model<IWCompHist>('WorkspaceCompensationHistory', WCompHistSchema);

// ─────────────────────────────────────────────────────────────────────────────
// §16  GOALS / OKRs  (tenant-scoped — part of the Performance module)
//
// An objective owned by an employee for a cycle, with optional measurable key
// results and a timeline of progress check-ins.  Goals are the planning half of
// PMS: set at the start of a cycle, tracked through it, and summarised on the
// review.  progressPct is the canonical completion number (auto-derived from
// key results when present, else set by the latest check-in).
// ─────────────────────────────────────────────────────────────────────────────

export type GoalStatus   = 'draft' | 'active' | 'at_risk' | 'achieved' | 'missed' | 'cancelled';
export type GoalCategory = 'business' | 'customer' | 'people' | 'operational' | 'personal';

const KeyResultS = new Schema({
  title:        { type: String, required: true, trim: true },
  targetValue:  { type: Number, default: 100 },
  currentValue: { type: Number, default: 0 },
  unit:         { type: String, trim: true, default: '%' },
  done:         { type: Boolean, default: false },
}, { _id: false });

const GoalCheckInS = new Schema({
  progressPct: { type: Number, min: 0, max: 100, required: true },
  note:        { type: String, trim: true },
  byUserId:    { type: Schema.Types.ObjectId },
  at:          { type: Date, default: Date.now },
}, { _id: false });

const WGoalSchema = new Schema(
  {
    tenantId:     { type: Schema.Types.ObjectId, required: true, immutable: true },
    employeeId:   { type: Schema.Types.ObjectId, ref: 'WorkspaceEmployee', required: true },
    employeeCode: { type: String, required: true },
    title:        { type: String, required: true, trim: true },
    description:  { type: String, trim: true },
    category:     { type: String, enum: ['business','customer','people','operational','personal'], default: 'business' },
    cycleLabel:   { type: String, trim: true },     // ties the goal to a review cycle, e.g. "H1 2026"
    periodStart:  { type: Date },
    periodEnd:    { type: Date },
    weight:       { type: Number, min: 0, max: 100, default: 0 },
    status:       { type: String, enum: ['draft','active','at_risk','achieved','missed','cancelled'], default: 'active' },
    progressPct:  { type: Number, min: 0, max: 100, default: 0 },
    keyResults:   { type: [KeyResultS], default: [] },
    checkIns:     { type: [GoalCheckInS], default: [] },
    createdById:  { type: Schema.Types.ObjectId },
    isActive:     { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'ws_goals' }
);
WGoalSchema.index({ tenantId: 1, employeeId: 1, cycleLabel: 1 });
WGoalSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

export interface IWGoal extends Document {
  tenantId: Types.ObjectId; employeeId: Types.ObjectId; employeeCode: string;
  title: string; description?: string; category: GoalCategory;
  cycleLabel?: string; periodStart?: Date; periodEnd?: Date;
  weight: number; status: GoalStatus; progressPct: number;
  keyResults: Array<{ title: string; targetValue: number; currentValue: number; unit: string; done: boolean }>;
  checkIns: Array<{ progressPct: number; note?: string; byUserId?: Types.ObjectId; at: Date }>;
  createdById?: Types.ObjectId; isActive: boolean; createdAt: Date; updatedAt: Date;
}
export const WorkspaceGoal: Model<IWGoal> =
  (mongoose.models['WorkspaceGoal'] as Model<IWGoal>) ??
  model<IWGoal>('WorkspaceGoal', WGoalSchema);

// ─────────────────────────────────────────────────────────────────────────────
// §17  SHIFT TYPES  (tenant-scoped, defines work schedules)
// ─────────────────────────────────────────────────────────────────────────────

const WShiftTypeSchema = new Schema(
  {
    tenantId:            { type: Schema.Types.ObjectId, required: true, immutable: true },
    name:                { type: String, required: true, trim: true },
    code:                { type: String, required: true, trim: true, uppercase: true },
    startTime:           { type: String, required: true },   // "09:30"
    endTime:             { type: String, required: true },   // "18:30"
    gracePeriodMinutes:  { type: Number, default: 15 },
    earlyExitGrace:      { type: Number, default: 15 },
    autoAttendance:      { type: Boolean, default: true },
    isWfh:               { type: Boolean, default: false },
    isActive:            { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'ws_shift_types' },
);
WShiftTypeSchema.index({ tenantId: 1, code: 1 }, { unique: true });
WShiftTypeSchema.index({ tenantId: 1, isActive: 1 });

export interface IWShiftType extends Document {
  tenantId: Types.ObjectId; name: string; code: string;
  startTime: string; endTime: string;
  gracePeriodMinutes: number; earlyExitGrace: number;
  autoAttendance: boolean; isWfh: boolean; isActive: boolean;
  createdAt: Date; updatedAt: Date;
}
export const WorkspaceShiftType: Model<IWShiftType> =
  (mongoose.models['WorkspaceShiftType'] as Model<IWShiftType>) ??
  model<IWShiftType>('WorkspaceShiftType', WShiftTypeSchema);

// ─────────────────────────────────────────────────────────────────────────────
// §18  EXPENSE CLAIM  (employee-submitted, two-level approval)
// ─────────────────────────────────────────────────────────────────────────────

const WExpenseItemSchema = new Schema({
  date:             { type: Date, required: true },
  expenseType:      { type: String, required: true, trim: true },
  amount:           { type: Number, required: true, min: 0 },
  description:      { type: String, trim: true },
  receiptUrl:       { type: String },
  sanctionedAmount: { type: Number, min: 0 },
}, { _id: true });

const WExpenseClaimSchema = new Schema(
  {
    tenantId:          { type: Schema.Types.ObjectId, required: true, immutable: true },
    employeeId:        { type: Schema.Types.ObjectId, required: true },
    status:            { type: String, enum: ['draft','submitted','manager_approved','finance_approved','rejected','paid'], default: 'draft' },
    items:             [WExpenseItemSchema],
    totalClaimed:      { type: Number, default: 0 },
    totalSanctioned:   { type: Number, default: 0 },
    managerId:         { type: Schema.Types.ObjectId },
    financeId:         { type: Schema.Types.ObjectId },
    managerApprovedAt: { type: Date },
    financeApprovedAt: { type: Date },
    paidAt:            { type: Date },
    rejectedById:      { type: Schema.Types.ObjectId },
    rejectedReason:    { type: String },
    notes:             { type: String },
    month:             { type: String },   // "2026-06" for grouping
  },
  { timestamps: true, collection: 'ws_expense_claims' },
);
WExpenseClaimSchema.index({ tenantId: 1, employeeId: 1, status: 1 });
WExpenseClaimSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

export type ExpenseClaimStatus = 'draft'|'submitted'|'manager_approved'|'finance_approved'|'rejected'|'paid';
export interface IWExpenseClaim extends Document {
  tenantId: Types.ObjectId; employeeId: Types.ObjectId;
  status: ExpenseClaimStatus;
  items: Array<{ date: Date; expenseType: string; amount: number; description?: string; receiptUrl?: string; sanctionedAmount?: number }>;
  totalClaimed: number; totalSanctioned: number;
  managerId?: Types.ObjectId; financeId?: Types.ObjectId;
  managerApprovedAt?: Date; financeApprovedAt?: Date; paidAt?: Date;
  rejectedById?: Types.ObjectId; rejectedReason?: string;
  notes?: string; month?: string;
  createdAt: Date; updatedAt: Date;
}
export const WorkspaceExpenseClaim: Model<IWExpenseClaim> =
  (mongoose.models['WorkspaceExpenseClaim'] as Model<IWExpenseClaim>) ??
  model<IWExpenseClaim>('WorkspaceExpenseClaim', WExpenseClaimSchema);

// ─────────────────────────────────────────────────────────────────────────────
// §19  RECRUITMENT  (job openings + applicant pipeline)
// ─────────────────────────────────────────────────────────────────────────────

const WInterviewRoundSchema = new Schema({
  round:         { type: Number, required: true },
  scheduledAt:   { type: Date },
  interviewers:  [{ type: Schema.Types.ObjectId }],
  feedback:      { type: String },
  rating:        { type: Number, min: 1, max: 5 },
  status:        { type: String, enum: ['scheduled','completed','cancelled'], default: 'scheduled' },
}, { _id: true });

const WJobOpeningSchema = new Schema(
  {
    tenantId:     { type: Schema.Types.ObjectId, required: true, immutable: true },
    title:        { type: String, required: true, trim: true },
    departmentId: { type: Schema.Types.ObjectId },
    designation:  { type: String, trim: true },
    headcount:    { type: Number, default: 1 },
    status:       { type: String, enum: ['open','paused','closed','filled'], default: 'open' },
    description:  { type: String },
    requirements: [{ type: String }],
    createdById:  { type: Schema.Types.ObjectId },
  },
  { timestamps: true, collection: 'ws_job_openings' },
);
WJobOpeningSchema.index({ tenantId: 1, status: 1 });

export interface IWJobOpening extends Document {
  tenantId: Types.ObjectId; title: string; departmentId?: Types.ObjectId;
  designation?: string; headcount: number;
  status: 'open'|'paused'|'closed'|'filled';
  description?: string; requirements: string[];
  createdById?: Types.ObjectId; createdAt: Date; updatedAt: Date;
}
export const WorkspaceJobOpening: Model<IWJobOpening> =
  (mongoose.models['WorkspaceJobOpening'] as Model<IWJobOpening>) ??
  model<IWJobOpening>('WorkspaceJobOpening', WJobOpeningSchema);

const WJobApplicantSchema = new Schema(
  {
    tenantId:     { type: Schema.Types.ObjectId, required: true, immutable: true },
    jobOpeningId: { type: Schema.Types.ObjectId, required: true },
    name:         { type: String, required: true, trim: true },
    email:        { type: String, required: true, trim: true, lowercase: true },
    phone:        { type: String },
    resumeUrl:    { type: String },
    source:       { type: String, enum: ['direct','linkedin','referral','agency','job_board','other'], default: 'direct' },
    status:       { type: String, enum: ['applied','shortlisted','interviewing','offered','accepted','rejected','withdrawn'], default: 'applied' },
    candidateStatus: {
      type: String,
      enum: ['SHORTLISTED','OFFER_EXTENDED','OFFER_ACCEPTED','ONBOARDING_ACTIVE','ONBOARDING_COMPLETED','TRAINING_IN_PROGRESS','FULLY_RAMPED'],
    },
    employeeId:   { type: Schema.Types.ObjectId },
    onboardingId: { type: Schema.Types.ObjectId },
    hiredAt:      { type: Date },
    interviews:   [WInterviewRoundSchema],
    offerCtc:          { type: Number },
    offerJoiningDate:  { type: Date },
    offerLetterUrl:    { type: String },
    offerStatus:       { type: String, enum: ['pending','accepted','rejected','expired'] },
    notes:        { type: String },
  },
  { timestamps: true, collection: 'ws_job_applicants' },
);
WJobApplicantSchema.index({ tenantId: 1, jobOpeningId: 1, status: 1 });
WJobApplicantSchema.index({ tenantId: 1, email: 1 });
WJobApplicantSchema.index({ tenantId: 1, candidateStatus: 1 });

export type ApplicantStatus = 'applied'|'shortlisted'|'interviewing'|'offered'|'accepted'|'rejected'|'withdrawn';
export type CandidateStatus = 'SHORTLISTED'|'OFFER_EXTENDED'|'OFFER_ACCEPTED'|'ONBOARDING_ACTIVE'|'ONBOARDING_COMPLETED'|'TRAINING_IN_PROGRESS'|'FULLY_RAMPED';
export interface IWJobApplicant extends Document {
  tenantId: Types.ObjectId; jobOpeningId: Types.ObjectId;
  name: string; email: string; phone?: string;
  resumeUrl?: string; source: string; status: ApplicantStatus;
  candidateStatus?: CandidateStatus;
  employeeId?: Types.ObjectId;
  onboardingId?: Types.ObjectId;
  hiredAt?: Date;
  interviews: Array<{ round: number; scheduledAt?: Date; interviewers: Types.ObjectId[]; feedback?: string; rating?: number; status: string }>;
  offerCtc?: number; offerJoiningDate?: Date; offerLetterUrl?: string; offerStatus?: string;
  notes?: string; createdAt: Date; updatedAt: Date;
}
export const WorkspaceJobApplicant: Model<IWJobApplicant> =
  (mongoose.models['WorkspaceJobApplicant'] as Model<IWJobApplicant>) ??
  model<IWJobApplicant>('WorkspaceJobApplicant', WJobApplicantSchema);

// ─────────────────────────────────────────────────────────────────────────────
// §20  TRAINING PROGRAMS  (programs + embedded enrollments)
// ─────────────────────────────────────────────────────────────────────────────

const WEnrollmentSchema = new Schema({
  employeeId:  { type: Schema.Types.ObjectId, required: true },
  enrolledAt:  { type: Date, default: Date.now },
  status:      { type: String, enum: ['enrolled','completed','absent','withdrawn'], default: 'enrolled' },
  result:      { type: String, enum: ['pass','fail','na'], default: 'na' },
  attendedAt:  { type: Date },
}, { _id: true });

const WTrainingProgramSchema = new Schema(
  {
    tenantId:      { type: Schema.Types.ObjectId, required: true, immutable: true },
    title:         { type: String, required: true, trim: true },
    description:   { type: String },
    trainer:       { type: String },
    category:      { type: String, enum: ['compliance','technical','leadership','soft_skills','other'], default: 'other' },
    scheduledAt:   { type: Date },
    durationHours: { type: Number, default: 1 },
    maxEnrollment: { type: Number, default: 50 },
    isMandatory:   { type: Boolean, default: false },
    status:        { type: String, enum: ['draft','scheduled','in_progress','completed','cancelled'], default: 'draft' },
    enrollments:   [WEnrollmentSchema],
    createdById:   { type: Schema.Types.ObjectId },
  },
  { timestamps: true, collection: 'ws_training_programs' },
);
WTrainingProgramSchema.index({ tenantId: 1, status: 1 });
WTrainingProgramSchema.index({ tenantId: 1, scheduledAt: -1 });

export interface IWTrainingProgram extends Document {
  tenantId: Types.ObjectId; title: string; description?: string;
  trainer?: string; category: string; scheduledAt?: Date;
  durationHours: number; maxEnrollment: number; isMandatory: boolean;
  status: 'draft'|'scheduled'|'in_progress'|'completed'|'cancelled';
  enrollments: Array<{ employeeId: Types.ObjectId; enrolledAt: Date; status: string; result: string; attendedAt?: Date }>;
  createdById?: Types.ObjectId; createdAt: Date; updatedAt: Date;
}
export const WorkspaceTrainingProgram: Model<IWTrainingProgram> =
  (mongoose.models['WorkspaceTrainingProgram'] as Model<IWTrainingProgram>) ??
  model<IWTrainingProgram>('WorkspaceTrainingProgram', WTrainingProgramSchema);

// ─────────────────────────────────────────────────────────────────────────────
// §21  SEPARATION / OFFBOARDING  (resignation → F&F)
// ─────────────────────────────────────────────────────────────────────────────

const WOffboardTaskSchema = new Schema({
  task:        { type: String, required: true },
  assignedTo:  { type: String, enum: ['employee','hr','it','finance','manager'], default: 'hr' },
  status:      { type: String, enum: ['pending','completed'], default: 'pending' },
  completedAt: { type: Date },
}, { _id: true });

const WSeparationSchema = new Schema(
  {
    tenantId:         { type: Schema.Types.ObjectId, required: true, immutable: true },
    employeeId:       { type: Schema.Types.ObjectId, required: true },
    type:             { type: String, enum: ['resignation','termination','retirement','contract_end'], required: true },
    initiatedById:    { type: Schema.Types.ObjectId },
    noticeDate:       { type: Date },
    lastWorkingDay:   { type: Date },
    status:           { type: String, enum: ['initiated','in_progress','completed','cancelled'], default: 'initiated' },
    offboardingTasks: [WOffboardTaskSchema],
    exitInterviewNotes: { type: String },
    fnf: {
      pendingSalary:      { type: Number, default: 0 },
      leaveEncashment:    { type: Number, default: 0 },
      gratuity:           { type: Number, default: 0 },
      advanceDeductions:  { type: Number, default: 0 },
      totalPayable:       { type: Number, default: 0 },
      status:             { type: String, enum: ['pending','calculated','paid'], default: 'pending' },
    },
    notes: { type: String },
  },
  { timestamps: true, collection: 'ws_separations' },
);
WSeparationSchema.index({ tenantId: 1, employeeId: 1 });
WSeparationSchema.index({ tenantId: 1, status: 1 });

export interface IWSeparation extends Document {
  tenantId: Types.ObjectId; employeeId: Types.ObjectId;
  type: 'resignation'|'termination'|'retirement'|'contract_end';
  initiatedById?: Types.ObjectId; noticeDate?: Date; lastWorkingDay?: Date;
  status: 'initiated'|'in_progress'|'completed'|'cancelled';
  offboardingTasks: Array<{ task: string; assignedTo: string; status: string; completedAt?: Date }>;
  exitInterviewNotes?: string;
  fnf: { pendingSalary: number; leaveEncashment: number; gratuity: number; advanceDeductions: number; totalPayable: number; status: string };
  notes?: string; createdAt: Date; updatedAt: Date;
}
export const WorkspaceSeparation: Model<IWSeparation> =
  (mongoose.models['WorkspaceSeparation'] as Model<IWSeparation>) ??
  model<IWSeparation>('WorkspaceSeparation', WSeparationSchema);

// ─────────────────────────────────────────────────────────────────────────────
// §22  HR SETTINGS  (one document per tenant — org-level configuration)
// ─────────────────────────────────────────────────────────────────────────────

const WHRSettingsSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, required: true, unique: true, immutable: true },

    leavePolicy: [{
      leaveType:    { type: String, required: true },
      annualDays:   { type: Number, required: true },
      carryForward: { type: Boolean, default: false },
      maxCarryDays: { type: Number, default: 0 },
      encashable:   { type: Boolean, default: false },
      isActive:     { type: Boolean, default: true },
    }],

    salaryBands: [{
      band:             { type: String, required: true },   // L1|L2|L3
      minBase:          { type: Number, required: true },
      maxBase:          { type: Number, required: true },
      travelAllowance:  { type: Number, default: 1600 },
    }],

    salaryFormula: {
      basicPercent:      { type: Number, default: 40 },
      hraPercent:        { type: Number, default: 20 },
      medicalAllowance:  { type: Number, default: 1250 },
      profTax:           { type: Number, default: 200 },
      pfPercent:         { type: Number, default: 12 },
    },

    workingDaysPerWeek:   { type: Number, default: 5 },
    leaveYearStart:       { type: String, enum: ['jan-1', 'apr-1', 'hire-anniversary'], default: 'jan-1' },
    probationPeriodDays:  { type: Number, default: 90 },
    noticePeriodDays:     { type: Number, default: 30 },

    holidays: [{
      date:  { type: Date, required: true },
      name:  { type: String, required: true },
      type:  { type: String, enum: ['national','optional','restricted'], default: 'national' },
    }],

    expenseTypes: [{
      name:        { type: String, required: true },
      description: { type: String },
      isActive:    { type: Boolean, default: true },
    }],

    offboardingTemplate: [{ type: String }],
  },
  { timestamps: true, collection: 'ws_hr_settings' },
);

export interface IWHRSettings extends Document {
  tenantId: Types.ObjectId;
  leavePolicy: Array<{ leaveType: string; annualDays: number; carryForward: boolean; maxCarryDays: number; encashable: boolean; isActive: boolean }>;
  salaryBands: Array<{ band: string; minBase: number; maxBase: number; travelAllowance: number }>;
  salaryFormula: { basicPercent: number; hraPercent: number; medicalAllowance: number; profTax: number; pfPercent: number };
  workingDaysPerWeek: number; leaveYearStart?: string; probationPeriodDays: number; noticePeriodDays: number;
  holidays: Array<{ date: Date; name: string; type: string }>;
  expenseTypes: Array<{ name: string; description?: string; isActive: boolean }>;
  offboardingTemplate: string[];
  createdAt: Date; updatedAt: Date;
}
export const WorkspaceHRSettings: Model<IWHRSettings> =
  (mongoose.models['WorkspaceHRSettings'] as Model<IWHRSettings>) ??
  model<IWHRSettings>('WorkspaceHRSettings', WHRSettingsSchema);

// ─────────────────────────────────────────────────────────────────────────────
// §23  ONBOARDING  (new joiner checklist, per employee)
// ─────────────────────────────────────────────────────────────────────────────

const WOnboardTaskSchema = new Schema({
  title:       { type: String, required: true },
  description: { type: String },
  category:    { type: String, enum: ['documentation','it_setup','training','orientation','compliance','cultural','other'], default: 'other' },
  assignedTo:  { type: String, enum: ['employee','hr','it','manager'], default: 'hr' },
  dueDate:     { type: Date },
  completedAt: { type: Date },
  status:      { type: String, enum: ['pending','in_progress','completed'], default: 'pending' },
}, { _id: true });

const WOnboardingSchema = new Schema(
  {
    tenantId:                { type: Schema.Types.ObjectId, required: true, immutable: true },
    employeeId:              { type: Schema.Types.ObjectId, required: true },
    applicantId:             { type: Schema.Types.ObjectId },
    managerId:               { type: Schema.Types.ObjectId },
    status:                  { type: String, enum: ['not_started','in_progress','completed'], default: 'not_started' },
    tasks:                   [WOnboardTaskSchema],
    startDate:               { type: Date },
    targetCompletionDate:    { type: Date },
    day90TargetDate:         { type: Date },
    completedAt:             { type: Date },
    completionTriggerFired:  { type: Boolean, default: false },
    notes:                   { type: String },
  },
  { timestamps: true, collection: 'ws_onboarding' },
);
WOnboardingSchema.index({ tenantId: 1, employeeId: 1 }, { unique: true });
WOnboardingSchema.index({ tenantId: 1, status: 1 });

export interface IWOnboarding extends Document {
  tenantId: Types.ObjectId; employeeId: Types.ObjectId;
  applicantId?: Types.ObjectId;
  managerId?: Types.ObjectId;
  status: 'not_started'|'in_progress'|'completed';
  tasks: Array<{ title: string; description?: string; category: string; assignedTo: string; dueDate?: Date; completedAt?: Date; status: string }>;
  startDate?: Date; targetCompletionDate?: Date; day90TargetDate?: Date;
  completedAt?: Date; completionTriggerFired: boolean; notes?: string;
  createdAt: Date; updatedAt: Date;
}
export const WorkspaceOnboarding: Model<IWOnboarding> =
  (mongoose.models['WorkspaceOnboarding'] as Model<IWOnboarding>) ??
  model<IWOnboarding>('WorkspaceOnboarding', WOnboardingSchema);

// ─────────────────────────────────────────────────────────────────────────────
// §24  LEARNING PATHS  (ordered training tracks for onboarding / role ramp-up)
// ─────────────────────────────────────────────────────────────────────────────

const WLearningTrackSchema = new Schema({
  programId:   { type: Schema.Types.ObjectId, required: true },
  order:       { type: Number, required: true },
  isMandatory: { type: Boolean, default: true },
  delayDays:   { type: Number, default: 0 },
}, { _id: true });

const WLearningPathSchema = new Schema(
  {
    tenantId:    { type: Schema.Types.ObjectId, required: true, immutable: true },
    name:        { type: String, required: true, trim: true },
    description: { type: String },
    targetRole:  { type: String, trim: true },
    isActive:    { type: Boolean, default: true },
    tracks:      [WLearningTrackSchema],
    createdById: { type: Schema.Types.ObjectId },
  },
  { timestamps: true, collection: 'ws_learning_paths' },
);
WLearningPathSchema.index({ tenantId: 1, isActive: 1 });

export interface IWLearningPath extends Document {
  tenantId: Types.ObjectId; name: string; description?: string;
  targetRole?: string; isActive: boolean;
  tracks: Array<{ programId: Types.ObjectId; order: number; isMandatory: boolean; delayDays: number }>;
  createdById?: Types.ObjectId; createdAt: Date; updatedAt: Date;
}
export const WorkspaceLearningPath: Model<IWLearningPath> =
  (mongoose.models['WorkspaceLearningPath'] as Model<IWLearningPath>) ??
  model<IWLearningPath>('WorkspaceLearningPath', WLearningPathSchema);

// ─────────────────────────────────────────────────────────────────────────────
// Barrel re-export for convenient single-line imports in route files
// ─────────────────────────────────────────────────────────────────────────────
export const WorkspaceModels = {
  Tenant,
  User:             WorkspaceUser,
  Department:       WorkspaceDepartment,
  Employee:         WorkspaceEmployee,
  LeaveRequest:     WorkspaceLeaveRequest,
  LeaveBalance:     WorkspaceLeaveBalance,
  PayrollRun:       WorkspacePayrollRun,
  CommsTemplate:    WorkspaceCommsTemplate,
  NotifLog:         WorkspaceNotifLog,
  AuditTrail:       WorkspaceAuditTrail,
  PulseTelemetry:    WorkspacePulseTelemetry,
  Attendance:        WorkspaceAttendance,
  InAppNotification: WorkspaceInAppNotification,
  UserSettings:      WorkspaceUserSettings,
  PerformanceReview: WorkspacePerformanceReview,
  CompensationHistory: WorkspaceCompensationHistory,
  Goal:              WorkspaceGoal,
  ShiftType:         WorkspaceShiftType,
  ExpenseClaim:      WorkspaceExpenseClaim,
  JobOpening:        WorkspaceJobOpening,
  JobApplicant:      WorkspaceJobApplicant,
  TrainingProgram:   WorkspaceTrainingProgram,
  Separation:        WorkspaceSeparation,
  HRSettings:        WorkspaceHRSettings,
  Onboarding:        WorkspaceOnboarding,
  LearningPath:      WorkspaceLearningPath,
  AttendanceReg:     WorkspaceAttendanceReg,
} as const;

export default WorkspaceModels;
