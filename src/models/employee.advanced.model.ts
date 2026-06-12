/**
 * FILE 2 OF 3 — The Unified Hybrid Employee Schema
 *
 * Implements:
 *   § 1   8 Embedded Sub-Schemas (skills, assets, vesting, immigration, etc.)
 *   § 2   Root Employee Schema  (encrypted PII, 21 compound indexes)
 *   § 3   Guards & Pre-Hooks    (compensation lock, ZT consistency, date denorm)
 *   § 4   Static Methods        (findByEmailHash, getOrgTree, matchBySkills)
 *   § 5   Virtual Properties
 *   § 6   IEmployee interface + IEmployeeModel + export
 *
 * ADR Compliance:
 *   ADR-001  Embed skills(≤20), assets(≤10), vesting(≤20), immigration(≤20)
 *   ADR-005  Tenant isolation via global plugin from multiTenantCore.ts
 *   ADR-006  All PII + financial fields stored as Buffer (AES-256-GCM encrypted)
 */

import mongoose, {
  Schema,
  model,
  type Model,
  type Document,
  type Types,
  type HydratedDocument,
  type CallbackError,
}                              from 'mongoose';

import {
  TenantContext,
  computeLookupHash,
  encryptEmployeeFields,
  type PlainEmployeeFields,
  type EncryptedEmployeeFields,
  type DeviceTrustLevel,
}                              from '../infrastructure/multiTenantCore';

// ─────────────────────────────────────────────────────────────────────────────
// Enumerations
// ─────────────────────────────────────────────────────────────────────────────

export type EmployeeStatus =
  | 'pre_hire' | 'active' | 'on_leave' | 'pip'
  | 'suspended' | 'terminated' | 'retired';

export type EmploymentType =
  | 'full_time' | 'part_time' | 'contractor'
  | 'intern' | 'advisor' | 'digital_worker';

export type SkillProficiency =
  | 'awareness' | 'working' | 'practitioner' | 'expert' | 'authority';

export type GrantType   = 'esop' | 'rsu' | 'sar' | 'phantom';
export type GrantStatus = 'active' | 'exercised' | 'expired' | 'cancelled';
export type PayoutMethod = 'bank_transfer' | 'digital_wallet' | 'stablecoin' | 'check';
export type NexusRiskLevel = 'safe' | 'watch' | 'at_risk' | 'triggered';
export type VerificationStatus = 'pending' | 'in_progress' | 'verified' | 'failed' | 'expired';
export type AssetCategory = 'saas_identity' | 'hardware';
export type AssetState = 'pending' | 'provisioned' | 'suspended' | 'deprovisioned' | 'failed';

const EMBED_LIMITS = Object.freeze({
  SKILLS:      20,
  ASSETS:      10,
  VESTING:     20,
  IMMIGRATION: 20,
  STATUTORY:   10,
});

const PROFICIENCY_RANK: Record<SkillProficiency, number> = {
  awareness: 1, working: 2, practitioner: 3, expert: 4, authority: 5,
};

// ─────────────────────────────────────────────────────────────────────────────
// Sub-Document Interfaces
// ─────────────────────────────────────────────────────────────────────────────

export interface IStatutoryProfile {
  countryCode:            string;
  residencyCode?:         string;
  taxIdentifierEnc?:      Buffer;
  taxRegimeCode?:         string;
  pfAccountEnc?:          Buffer;
  esiApplicable:          boolean;
  professionalTaxState?:  string;
  registeredAt?:          Date;
}

export interface ISkillEntry {
  skillSlug:         string;
  skillName:         string;
  category:          string;
  proficiency:       SkillProficiency;
  verifiedVia:       string;
  endorsementCount:  number;
  lastAssessedAt?:   Date;
}

export interface IProvisionedAssetRef {
  assetId:       Types.ObjectId;
  assetCategory: AssetCategory;
  provider?:     string;
  state:         AssetState;
  syncedAt?:     Date;
}

export interface IVestingScheduleEntry {
  grantId:               string;
  grantType:             GrantType;
  grantDate:             Date;
  cliffDate:             Date;
  fullyVestedDate:       Date;
  totalUnits:            number;
  vestedUnits:           number;
  unvestedUnits:         number;
  strikePrice?:          number;
  currencyCode:          string;
  vestingScheduleType:   string;
  vestingPeriodMonths:   number;
  cliffMonths:           number;
  payoutMethod:          PayoutMethod;
  walletAddressEnc?:     Buffer;
  capitalGainsTaxRate?:  number;
  taxJurisdiction?:      string;
  lastVestEventAt?:      Date;
  status:                GrantStatus;
}

export interface IImmigrationRecord {
  documentType:            string;
  documentNumber?:         string;
  issuingCountry:          string;
  hostCountry:             string;
  validFrom:               Date;
  expiresAt:               Date;
  visaCategory?:           string;
  physicalDaysInCountry:   number;
  nexusTriggerDays:        number;
  nexusRiskLevel:          NexusRiskLevel;
  alertsSent:              Date[];
  status:                  'active' | 'expired' | 'cancelled';
}

export interface IDeviceTrustState {
  deviceId?:              string;
  deviceFingerprint?:     string;
  mdmEnrollmentId?:       string;
  mdmProvider?:           string;
  lastHeartbeatAt?:       Date;
  heartbeatIntervalSec:   number;
  diskEncrypted:          boolean;
  osPatchCurrent:         boolean;
  mdmProfileActive:       boolean;
  edrAgentActive:         boolean;
  firewallEnabled:        boolean;
  antivirusActive:        boolean;
  screenLockEnabled:      boolean;
  complianceScore:        number;
  trustLevel:             DeviceTrustLevel;
  accessTokenThrottle:    number;
  nonComplianceSince?:    Date;
  autoRevokedAt?:         Date;
}

export interface IIdentityVerification {
  verificationSessionId?:  string;
  webAuthnCredentialId?:   string;
  webAuthnPublicKeyHash?:  string;
  livenessCheckPassed:     boolean;
  livenessScore?:          number;
  antiSpoofScore?:         number;
  biometricTemplateHash?:  string;
  sessionSignature?:       string;
  verifiedAt?:             Date;
  verificationProvider?:   string;
  verificationStatus:      VerificationStatus;
  failedAttempts:          number;
  lastFailedAt?:           Date;
}

export interface IDigitalWorkerMeta {
  isDigitalWorker:       boolean;
  agentFramework?:       string;
  modelVersion?:         string;
  parentRepositoryUrl?:  string;
  humanSupervisorId?:    Types.ObjectId;
  tokenBudgetMonthly:    number;
  tokenBudgetUsed:       number;
  apiCostMtd:            number;
  accessScopes:          string[];
  lastActiveAt?:         Date;
  deploymentEnvironment: 'production' | 'staging' | 'dev';
}

export interface OrgTreeNode {
  _id:              Types.ObjectId;
  employeeCode:     string;
  jobTitle:         string;
  departmentName:   string;
  departmentCode:   string;
  managerId?:       Types.ObjectId;
  employeeStatus:   EmployeeStatus;
  hireDate:         Date;
  countryCode:      string;
  burnoutRiskScore: number;
  flightRiskScore:  number;
  depth:            number;
}

export interface SkillMatchCandidate {
  _id:             Types.ObjectId;
  employeeCode:    string;
  jobTitle:        string;
  departmentName:  string;
  countryCode:     string;
  tenureYears:     number;
  matchScore:      number;
  flightRiskScore: number;
  matchedSkills:   ISkillEntry[];
}

// ─────────────────────────────────────────────────────────────────────────────
// § 1  Embedded Sub-Schemas
// ─────────────────────────────────────────────────────────────────────────────

const StatutoryProfileSchema = new Schema<IStatutoryProfile>({
  countryCode:           { type: String, required: true, uppercase: true, maxlength: 2 },
  residencyCode:         { type: String, trim: true },
  taxIdentifierEnc:      { type: Buffer },
  taxRegimeCode:         { type: String, trim: true },
  pfAccountEnc:          { type: Buffer },
  esiApplicable:         { type: Boolean, default: false },
  professionalTaxState:  { type: String, trim: true, uppercase: true },
  registeredAt:          { type: Date },
}, { _id: false });

const SkillEntrySchema = new Schema<ISkillEntry>({
  skillSlug:        { type: String, required: true, lowercase: true, trim: true },
  skillName:        { type: String, required: true, trim: true },
  category:         { type: String, required: true, trim: true },
  proficiency:      {
    type: String,
    enum: ['awareness', 'working', 'practitioner', 'expert', 'authority'],
    required: true,
  },
  verifiedVia:      {
    type: String,
    enum: ['self_assessment', 'peer_review_360', 'project_delivery', 'certification', 'manager_eval', 'open_source_contribution'],
    required: true,
  },
  endorsementCount: { type: Number, default: 0, min: 0 },
  lastAssessedAt:   { type: Date },
}, { _id: false });

const ProvisionedAssetRefSchema = new Schema<IProvisionedAssetRef>({
  assetId:       { type: Schema.Types.ObjectId, required: true },
  assetCategory: { type: String, enum: ['saas_identity', 'hardware'], required: true },
  provider:      { type: String, trim: true, lowercase: true },
  state:         { type: String, enum: ['pending', 'provisioned', 'suspended', 'deprovisioned', 'failed'], default: 'pending' },
  syncedAt:      { type: Date },
}, { _id: false });

const VestingScheduleEntrySchema = new Schema<IVestingScheduleEntry>({
  grantId:             { type: String, required: true, trim: true },
  grantType:           { type: String, enum: ['esop', 'rsu', 'sar', 'phantom'], required: true },
  grantDate:           { type: Date, required: true },
  cliffDate:           { type: Date, required: true },
  fullyVestedDate:     { type: Date, required: true },
  totalUnits:          { type: Number, required: true, min: 0 },
  vestedUnits:         { type: Number, default: 0, min: 0 },
  unvestedUnits:       { type: Number, required: true, min: 0 },
  strikePrice:         { type: Number, min: 0 },
  currencyCode:        { type: String, default: 'USD', uppercase: true, maxlength: 3 },
  vestingScheduleType: { type: String, enum: ['cliff', 'graded_monthly', 'graded_quarterly', 'performance'], default: 'graded_monthly' },
  vestingPeriodMonths: { type: Number, default: 48, min: 1 },
  cliffMonths:         { type: Number, default: 12, min: 0 },
  payoutMethod:        { type: String, enum: ['bank_transfer', 'digital_wallet', 'stablecoin', 'check'], default: 'bank_transfer' },
  walletAddressEnc:    { type: Buffer },
  capitalGainsTaxRate: { type: Number, min: 0, max: 1 },
  taxJurisdiction:     { type: String, trim: true },
  lastVestEventAt:     { type: Date },
  status:              { type: String, enum: ['active', 'exercised', 'expired', 'cancelled'], default: 'active' },
}, { _id: false });

const ImmigrationRecordSchema = new Schema<IImmigrationRecord>({
  documentType:          { type: String, enum: ['visa', 'work_permit', 'permanent_residency', 'business_visitor', 'intra_company_transfer'], required: true },
  documentNumber:        { type: String, trim: true },
  issuingCountry:        { type: String, required: true, uppercase: true, maxlength: 2 },
  hostCountry:           { type: String, required: true, uppercase: true, maxlength: 2 },
  validFrom:             { type: Date, required: true },
  expiresAt:             { type: Date, required: true },
  visaCategory:          { type: String, trim: true },
  physicalDaysInCountry: { type: Number, default: 0, min: 0 },
  nexusTriggerDays:      { type: Number, default: 183, min: 1 },
  nexusRiskLevel:        { type: String, enum: ['safe', 'watch', 'at_risk', 'triggered'], default: 'safe' },
  alertsSent:            [{ type: Date }],
  status:                { type: String, enum: ['active', 'expired', 'cancelled'], default: 'active' },
}, { _id: false });

const DeviceTrustStateSchema = new Schema<IDeviceTrustState>({
  deviceId:             { type: String, trim: true },
  deviceFingerprint:    { type: String, trim: true },
  mdmEnrollmentId:      { type: String, trim: true },
  mdmProvider:          { type: String, trim: true, lowercase: true },
  lastHeartbeatAt:      { type: Date },
  heartbeatIntervalSec: { type: Number, default: 300, min: 30 },
  diskEncrypted:        { type: Boolean, default: false },
  osPatchCurrent:       { type: Boolean, default: false },
  mdmProfileActive:     { type: Boolean, default: false },
  edrAgentActive:       { type: Boolean, default: false },
  firewallEnabled:      { type: Boolean, default: false },
  antivirusActive:      { type: Boolean, default: false },
  screenLockEnabled:    { type: Boolean, default: false },
  complianceScore:      { type: Number, min: 0, max: 100, default: 0 },
  trustLevel:           { type: String, enum: ['trusted', 'conditional', 'non_compliant', 'revoked', 'unknown'], default: 'unknown' },
  accessTokenThrottle:  { type: Number, min: 0, max: 1, default: 1 },
  nonComplianceSince:   { type: Date },
  autoRevokedAt:        { type: Date },
}, { _id: false });

const IdentityVerificationSchema = new Schema<IIdentityVerification>({
  verificationSessionId:  { type: String, trim: true },
  webAuthnCredentialId:   { type: String, trim: true },
  webAuthnPublicKeyHash:  { type: String, maxlength: 64 },
  livenessCheckPassed:    { type: Boolean, default: false },
  livenessScore:          { type: Number, min: 0, max: 1 },
  antiSpoofScore:         { type: Number, min: 0, max: 1 },
  biometricTemplateHash:  { type: String, maxlength: 64 },
  sessionSignature:       { type: String },
  verifiedAt:             { type: Date },
  verificationProvider:   { type: String, trim: true },
  verificationStatus:     { type: String, enum: ['pending', 'in_progress', 'verified', 'failed', 'expired'], default: 'pending' },
  failedAttempts:         { type: Number, default: 0, min: 0 },
  lastFailedAt:           { type: Date },
}, { _id: false });

const DigitalWorkerMetaSchema = new Schema<IDigitalWorkerMeta>({
  isDigitalWorker:       { type: Boolean, default: false },
  agentFramework:        { type: String, trim: true, lowercase: true },
  modelVersion:          { type: String, trim: true },
  parentRepositoryUrl:   { type: String, trim: true },
  humanSupervisorId:     { type: Schema.Types.ObjectId, ref: 'AdvancedEmployee' },
  tokenBudgetMonthly:    { type: Number, default: 1_000_000, min: 0 },
  tokenBudgetUsed:       { type: Number, default: 0, min: 0 },
  apiCostMtd:            { type: Number, default: 0, min: 0 },
  accessScopes:          [{ type: String, trim: true }],
  lastActiveAt:          { type: Date },
  deploymentEnvironment: { type: String, enum: ['production', 'staging', 'dev'], default: 'production' },
}, { _id: false });

// ─────────────────────────────────────────────────────────────────────────────
// § 2  Root Employee Schema
// ─────────────────────────────────────────────────────────────────────────────

const AdvancedEmployeeSchema = new Schema<IEmployee, IEmployeeModel>(
  {
    tenantId:      { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, immutable: true },
    subsidiaryId:  { type: Schema.Types.ObjectId, required: true },
    employeeCode:  { type: String, required: true, trim: true, uppercase: true },

    // ── AES-256-GCM Encrypted PII (Buffer — wire format) ──────────────────
    fullNameEnc:       { type: Buffer, required: true },
    emailEnc:          { type: Buffer, required: true },
    personalEmailEnc:  { type: Buffer },
    phoneEnc:          { type: Buffer },
    nationalIdEnc:     { type: Buffer },
    dateOfBirthEnc:    { type: Buffer },
    addressEnc:        { type: Buffer },
    passportEnc:       { type: Buffer },

    // ── AES-256-GCM Encrypted Compensation ────────────────────────────────
    baseSalaryEnc:     { type: Buffer, required: true },
    variableCompEnc:   { type: Buffer },
    bankAccountEnc:    { type: Buffer },
    bankRoutingEnc:    { type: Buffer },
    bankSwiftEnc:      { type: Buffer },
    equityValueEnc:    { type: Buffer },

    // ── HMAC Lookup Hashes (deterministic, tenant-scoped) ──────────────────
    emailHash:         { type: String, required: true, maxlength: 64 },
    nationalIdHash:    { type: String, maxlength: 64 },

    // ── Compensation Metadata (plaintext — needed for payroll aggregation) ─
    currencyCode:  { type: String, default: 'USD', uppercase: true, maxlength: 3 },
    salaryBand:    { type: String, trim: true },
    payFrequency:  { type: String, enum: ['weekly', 'biweekly', 'semi_monthly', 'monthly'], default: 'monthly' },

    // ── Operational Fields (denormalized — zero $lookup on hot reads) ──────
    departmentId:   { type: Schema.Types.ObjectId, required: true },
    departmentName: { type: String, required: true, trim: true },
    departmentCode: { type: String, required: true, trim: true, uppercase: true },
    costCenterCode: { type: String, trim: true },
    jobTitleId:     { type: Schema.Types.ObjectId, required: true },
    jobTitle:       { type: String, required: true, trim: true },
    managerId:      { type: Schema.Types.ObjectId, ref: 'AdvancedEmployee' },
    managerName:    { type: String, trim: true },
    countryCode:    { type: String, required: true, uppercase: true, maxlength: 2 },
    timezone:       { type: String, default: 'UTC' },
    locale:         { type: String, default: 'en-US' },

    // ── Date Milestones ────────────────────────────────────────────────────
    hireDate:          { type: Date, required: true },
    hireDateMonth:     { type: Number, min: 1, max: 12 },
    hireDateDay:       { type: Number, min: 1, max: 31 },
    dateOfBirth:       { type: Date },
    birthMonth:        { type: Number, min: 1, max: 12 },
    birthDay:          { type: Number, min: 1, max: 31 },
    probationEndDate:  { type: Date },
    lastWorkingDay:    { type: Date },
    nextReviewDate:    { type: Date },
    lastPromotionDate: { type: Date },

    // ── Lifecycle ──────────────────────────────────────────────────────────
    employeeStatus: {
      type:    String,
      enum:    ['pre_hire', 'active', 'on_leave', 'pip', 'suspended', 'terminated', 'retired'],
      default: 'pre_hire',
    },
    employmentType: {
      type:    String,
      enum:    ['full_time', 'part_time', 'contractor', 'intern', 'advisor', 'digital_worker'],
      default: 'full_time',
    },
    offboardInitiatedAt: { type: Date },
    offboardCompletedAt: { type: Date },

    // ── Embedded Sub-Documents (ADR-001: embed to eliminate $lookup) ───────
    statutoryProfiles: {
      type:     [StatutoryProfileSchema],
      default:  [],
      validate: {
        validator: (v: unknown[]) => v.length <= EMBED_LIMITS.STATUTORY,
        message:   `ADR-001: max ${EMBED_LIMITS.STATUTORY} statutory profiles`,
      },
    },
    skills: {
      type:     [SkillEntrySchema],
      default:  [],
      validate: {
        validator: (v: unknown[]) => v.length <= EMBED_LIMITS.SKILLS,
        message:   `ADR-001: max ${EMBED_LIMITS.SKILLS} skills`,
      },
    },
    provisionedAssets: {
      type:     [ProvisionedAssetRefSchema],
      default:  [],
      validate: {
        validator: (v: unknown[]) => v.length <= EMBED_LIMITS.ASSETS,
        message:   `ADR-001: max ${EMBED_LIMITS.ASSETS} asset refs`,
      },
    },
    vestingSchedules: {
      type:     [VestingScheduleEntrySchema],
      default:  [],
      validate: {
        validator: (v: unknown[]) => v.length <= EMBED_LIMITS.VESTING,
        message:   `ADR-001: max ${EMBED_LIMITS.VESTING} vesting grants`,
      },
    },
    immigrationRecords: {
      type:     [ImmigrationRecordSchema],
      default:  [],
      validate: {
        validator: (v: unknown[]) => v.length <= EMBED_LIMITS.IMMIGRATION,
        message:   `ADR-001: max ${EMBED_LIMITS.IMMIGRATION} immigration records`,
      },
    },
    deviceTrustState:     { type: DeviceTrustStateSchema, default: () => ({}) },
    identityVerification: { type: IdentityVerificationSchema, default: () => ({}) },
    digitalWorkerMeta:    { type: DigitalWorkerMetaSchema, default: () => ({ isDigitalWorker: false }) },

    // ── ML Risk Signals (written by inference worker only) ─────────────────
    burnoutRiskScore:   { type: Number, min: 0, max: 1, default: 0 },
    flightRiskScore:    { type: Number, min: 0, max: 1, default: 0 },
    engagementPct:      { type: Number, min: 0, max: 100 },
    riskComputedAt:     { type: Date },

    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    collection: 'employees_advanced',
    toJSON:     { virtuals: true, transform: (_doc, ret: Record<string, unknown>) => {
      // Strip all encrypted fields from JSON output — ciphertext never leaks
      for (const key of Object.keys(ret)) {
        if (key.endsWith('Enc')) delete ret[key];
      }
      return ret;
    }},
    toObject: { virtuals: true },
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// § 3  Compound Index Strategy — 21 indexes
// ─────────────────────────────────────────────────────────────────────────────

AdvancedEmployeeSchema.index({ tenantId: 1, employeeStatus: 1, isActive: 1 });
AdvancedEmployeeSchema.index({ tenantId: 1, emailHash: 1 },           { unique: true });
AdvancedEmployeeSchema.index({ tenantId: 1, employeeCode: 1 },        { unique: true });
AdvancedEmployeeSchema.index({ tenantId: 1, nationalIdHash: 1 },      { sparse: true });
AdvancedEmployeeSchema.index({ tenantId: 1, departmentId: 1, isActive: 1 });
AdvancedEmployeeSchema.index({ tenantId: 1, managerId: 1 });
AdvancedEmployeeSchema.index({ tenantId: 1, countryCode: 1, employeeStatus: 1 });
AdvancedEmployeeSchema.index({ tenantId: 1, employmentType: 1, isActive: 1 });
AdvancedEmployeeSchema.index(
  { tenantId: 1, flightRiskScore: -1 },
  { partialFilterExpression: { isActive: true } }
);
AdvancedEmployeeSchema.index(
  { tenantId: 1, burnoutRiskScore: -1 },
  { partialFilterExpression: { isActive: true } }
);
AdvancedEmployeeSchema.index({ tenantId: 1, 'skills.skillSlug': 1, 'skills.proficiency': 1 });
AdvancedEmployeeSchema.index(
  { tenantId: 1, 'vestingSchedules.cliffDate': 1 },
  { partialFilterExpression: { 'vestingSchedules.0': { $exists: true } } }
);
AdvancedEmployeeSchema.index(
  { tenantId: 1, 'immigrationRecords.expiresAt': 1 },
  { partialFilterExpression: { 'immigrationRecords.status': 'active' } }
);
AdvancedEmployeeSchema.index(
  { tenantId: 1, 'deviceTrustState.trustLevel': 1 },
  { partialFilterExpression: { 'deviceTrustState.trustLevel': { $in: ['non_compliant', 'revoked'] } } }
);
AdvancedEmployeeSchema.index({ tenantId: 1, hireDateMonth: 1, hireDateDay: 1, isActive: 1 });
AdvancedEmployeeSchema.index(
  { tenantId: 1, birthMonth: 1, birthDay: 1, isActive: 1 },
  { partialFilterExpression: { birthMonth: { $exists: true } } }
);
AdvancedEmployeeSchema.index(
  { tenantId: 1, 'identityVerification.verificationStatus': 1 },
  { partialFilterExpression: { 'identityVerification.verificationStatus': { $in: ['pending', 'failed'] } } }
);
AdvancedEmployeeSchema.index(
  { tenantId: 1, offboardInitiatedAt: 1 },
  { partialFilterExpression: { offboardInitiatedAt: { $exists: true }, offboardCompletedAt: { $exists: false } } }
);
AdvancedEmployeeSchema.index(
  { tenantId: 1, 'provisionedAssets.provider': 1, 'provisionedAssets.state': 1 },
  { partialFilterExpression: { 'provisionedAssets.0': { $exists: true } } }
);
AdvancedEmployeeSchema.index(
  { tenantId: 1, 'digitalWorkerMeta.isDigitalWorker': 1, isActive: 1 },
  { partialFilterExpression: { 'digitalWorkerMeta.isDigitalWorker': true } }
);
AdvancedEmployeeSchema.index({ tenantId: 1, hireDate: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// § 4  Guards & Pre-Hooks
// Using (schema as any).pre() to work around Mongoose v9 TypeScript overloads
// that restrict pre() to a narrow set of string literals via discriminated unions.
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const schemaAny = AdvancedEmployeeSchema as any;

// ── Date denormalization ──────────────────────────────────────────────────────
schemaAny.pre('save', function (this: HydratedDocument<IEmployee>, next: (err?: CallbackError) => void) {
  if (this.isModified('hireDate') && this.hireDate) {
    this.hireDateMonth = this.hireDate.getMonth() + 1;
    this.hireDateDay   = this.hireDate.getDate();
  }
  if (this.isModified('dateOfBirth') && this.dateOfBirth) {
    this.birthMonth = this.dateOfBirth.getMonth() + 1;
    this.birthDay   = this.dateOfBirth.getDate();
  }
  return next();
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
schemaAny.pre('findOneAndUpdate', function (this: any) {
  const update = this.getUpdate() as Record<string, unknown>;
  const $set   = (update['$set'] as Record<string, unknown>) ?? {};
  if ($set['hireDate']) {
    const d = new Date($set['hireDate'] as string | Date);
    $set['hireDateMonth'] = d.getMonth() + 1;
    $set['hireDateDay']   = d.getDate();
  }
  if ($set['dateOfBirth']) {
    const d = new Date($set['dateOfBirth'] as string | Date);
    $set['birthMonth'] = d.getMonth() + 1;
    $set['birthDay']   = d.getDate();
  }
});

// ── Compensation mutation guard ───────────────────────────────────────────────
const PROTECTED_COMP = new Set([
  'baseSalaryEnc', 'variableCompEnc', 'bankAccountEnc',
  'bankRoutingEnc', 'bankSwiftEnc', 'equityValueEnc', 'vestingSchedules',
]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function checkCompGuard(this: any, op: string) {
  if (this._compensationCtx) return;
  const update = this.getUpdate?.() as Record<string, unknown> | null;
  if (!update) return;
  const keys = [
    ...Object.keys((update['$set'] as object | undefined) ?? {}),
    ...Object.keys((update['$unset'] as object | undefined) ?? {}),
  ];
  const blocked = keys.filter((k) => PROTECTED_COMP.has(k.split('.')[0] ?? ''));
  if (blocked.length) {
    throw new Error(
      `COMPENSATION_MUTATION_BLOCKED [${op}]: [${blocked.join(', ')}] — ` +
      `use POST /api/v3/payroll/compensation-change`
    );
  }
}

schemaAny.pre('findOneAndUpdate', function (this: unknown) { checkCompGuard.call(this, 'findOneAndUpdate'); });
schemaAny.pre('updateOne',        function (this: unknown) { checkCompGuard.call(this, 'updateOne'); });
schemaAny.pre('updateMany',       function (this: unknown) { checkCompGuard.call(this, 'updateMany'); });

// ── Vesting units consistency ─────────────────────────────────────────────────
schemaAny.pre('save', function (this: HydratedDocument<IEmployee>, next: (err?: CallbackError) => void) {
  if (this.isModified('vestingSchedules')) {
    for (const g of this.vestingSchedules) {
      if (g.vestedUnits > g.totalUnits) {
        return next(new Error(`VESTING_ERROR: grant "${g.grantId}" vestedUnits > totalUnits`) as unknown as CallbackError);
      }
      g.unvestedUnits = g.totalUnits - g.vestedUnits;
    }
  }
  return next();
});

// ── Digital worker ↔ employment type consistency ──────────────────────────────
schemaAny.pre('save', function (this: HydratedDocument<IEmployee>, next: (err?: CallbackError) => void) {
  if (this.isModified('employmentType') || this.isModified('digitalWorkerMeta')) {
    const isTypeDW = this.employmentType === 'digital_worker';
    const isMetaDW = this.digitalWorkerMeta?.isDigitalWorker === true;
    if (isTypeDW && !isMetaDW) this.set('digitalWorkerMeta.isDigitalWorker', true);
    if (!isTypeDW && isMetaDW) {
      return next(new Error('SCHEMA_CONSISTENCY: isDigitalWorker=true requires employmentType="digital_worker"') as unknown as CallbackError);
    }
  }
  return next();
});

// ─────────────────────────────────────────────────────────────────────────────
// § 5  Static Methods
// ─────────────────────────────────────────────────────────────────────────────

AdvancedEmployeeSchema.statics.findByEmailHash = async function (
  email: string,
): Promise<HydratedDocument<IEmployee> | null> {
  const ctx  = TenantContext.requireStore('findByEmailHash');
  const hash = await computeLookupHash(ctx.tenantId.toString(), 'email', email);
  return this.findOne({ emailHash: hash }).exec();
};

AdvancedEmployeeSchema.statics.findByNationalIdHash = async function (
  nationalId: string,
): Promise<HydratedDocument<IEmployee> | null> {
  const ctx  = TenantContext.requireStore('findByNationalIdHash');
  const hash = await computeLookupHash(ctx.tenantId.toString(), 'national_id', nationalId);
  return this.findOne({ nationalIdHash: hash }).exec();
};

AdvancedEmployeeSchema.statics.getOrgTree = async function (
  rootId: string | Types.ObjectId,
): Promise<OrgTreeNode[]> {
  const ctx    = TenantContext.requireStore('getOrgTree');
  const rootOid = new mongoose.Types.ObjectId(String(rootId));

  const results = await this.aggregate<{ directReports: OrgTreeNode[] }>([
    { $match: { _id: rootOid } },
    {
      $graphLookup: {
        from:             'employees_advanced',
        startWith:        '$_id',
        connectFromField: '_id',
        connectToField:   'managerId',
        as:               'directReports',
        maxDepth:         6,
        depthField:       'depth',
        restrictSearchWithMatch: {
          tenantId:       ctx.tenantId,
          isActive:       true,
          employeeStatus: { $nin: ['terminated', 'retired'] },
        },
      },
    },
    {
      $project: {
        directReports: {
          _id: 1, employeeCode: 1, jobTitle: 1,
          departmentName: 1, departmentCode: 1, managerId: 1,
          employeeStatus: 1, hireDate: 1, countryCode: 1,
          burnoutRiskScore: 1, flightRiskScore: 1, depth: 1,
          // Encrypted fields explicitly excluded
          fullNameEnc: 0, emailEnc: 0, nationalIdEnc: 0, baseSalaryEnc: 0,
        },
      },
    },
  ]).exec();

  return results[0]?.directReports ?? [];
};

AdvancedEmployeeSchema.statics.matchBySkills = async function (
  required: Array<{ skillSlug: string; minimumProficiency: SkillProficiency }>,
  opts: { maxResults?: number; countryCodesFilter?: string[] } = {},
): Promise<SkillMatchCandidate[]> {
  const { maxResults = 20, countryCodesFilter = [] } = opts;
  const slugs = required.map((r) => r.skillSlug);

  const baseMatch: Record<string, unknown> = {
    isActive: true, employeeStatus: 'active', 'skills.0': { $exists: true },
  };
  if (countryCodesFilter.length) {
    baseMatch['countryCode'] = { $in: countryCodesFilter.map((c) => c.toUpperCase()) };
  }

  return this.aggregate<SkillMatchCandidate>([
    { $match: baseMatch },
    { $unwind: '$skills' },
    { $match: { 'skills.skillSlug': { $in: slugs } } },
    {
      $group: {
        _id:             '$_id',
        employeeCode:    { $first: '$employeeCode' },
        jobTitle:        { $first: '$jobTitle' },
        departmentName:  { $first: '$departmentName' },
        countryCode:     { $first: '$countryCode' },
        hireDate:        { $first: '$hireDate' },
        flightRiskScore: { $first: '$flightRiskScore' },
        matchedSkills:   { $push: '$skills' },
        matchedCount:    { $sum: 1 },
      },
    },
    {
      $addFields: {
        tenureYears: { $round: [{ $divide: [{ $subtract: [new Date(), '$hireDate'] }, 31_557_600_000] }, 1] },
        matchScore:  { $round: [{ $divide: ['$matchedCount', required.length] }, 3] },
      },
    },
    { $match: { matchedCount: { $gte: 1 } } },
    { $sort: { matchScore: -1, tenureYears: -1 } },
    { $limit: maxResults },
    {
      $project: {
        _id: 1, employeeCode: 1, jobTitle: 1, departmentName: 1,
        countryCode: 1, tenureYears: 1, matchScore: 1, flightRiskScore: 1,
        matchedSkills: 1,
        fullNameEnc: 0, emailEnc: 0, baseSalaryEnc: 0,
      },
    },
  ]).exec();
};

AdvancedEmployeeSchema.statics.createWithEncryption = async function (params: {
  plain: PlainEmployeeFields;
  meta:  Partial<IEmployee>;
}): Promise<HydratedDocument<IEmployee>> {
  const ctx      = TenantContext.requireStore('createWithEncryption');
  const tenantId = ctx.tenantId.toString();
  const encrypted = await encryptEmployeeFields(tenantId, params.plain);
  const count     = await this.countDocuments({});
  const code      = `EMP-${String(count + 1).padStart(5, '0')}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (this as any).create({ ...params.meta, ...encrypted, employeeCode: code });
};

// ─────────────────────────────────────────────────────────────────────────────
// § 6  Virtual Properties
// ─────────────────────────────────────────────────────────────────────────────

AdvancedEmployeeSchema.virtual('provisionedSaasCount').get(function (this: HydratedDocument<IEmployee>) {
  return this.provisionedAssets.filter((a) => a.assetCategory === 'saas_identity' && a.state === 'provisioned').length;
});

AdvancedEmployeeSchema.virtual('totalUnvestedUnits').get(function (this: HydratedDocument<IEmployee>) {
  return this.vestingSchedules.filter((g) => g.status === 'active').reduce((s, g) => s + g.unvestedUnits, 0);
});

AdvancedEmployeeSchema.virtual('immigrationAlertCount').get(function (this: HydratedDocument<IEmployee>) {
  const cutoff = Date.now() + 90 * 24 * 60 * 60 * 1000;
  return this.immigrationRecords.filter((r) => r.status === 'active' && r.expiresAt.getTime() <= cutoff).length;
});

AdvancedEmployeeSchema.virtual('isDeviceWriteBlocked').get(function (this: HydratedDocument<IEmployee>) {
  return new Set<string>(['non_compliant', 'revoked']).has(this.deviceTrustState?.trustLevel ?? 'unknown');
});

AdvancedEmployeeSchema.virtual('tenureYears').get(function (this: HydratedDocument<IEmployee>) {
  return Math.round(((Date.now() - this.hireDate.getTime()) / 31_557_600_000) * 10) / 10;
});

// ─────────────────────────────────────────────────────────────────────────────
// § 7  TypeScript Interfaces
// ─────────────────────────────────────────────────────────────────────────────

export interface IEmployee extends Document {
  tenantId:      Types.ObjectId;
  subsidiaryId:  Types.ObjectId;
  employeeCode:  string;
  // Encrypted PII
  fullNameEnc:       Buffer;
  emailEnc:          Buffer;
  personalEmailEnc?: Buffer;
  phoneEnc?:         Buffer;
  nationalIdEnc?:    Buffer;
  dateOfBirthEnc?:   Buffer;
  addressEnc?:       Buffer;
  passportEnc?:      Buffer;
  // Encrypted compensation
  baseSalaryEnc:     Buffer;
  variableCompEnc?:  Buffer;
  bankAccountEnc?:   Buffer;
  bankRoutingEnc?:   Buffer;
  bankSwiftEnc?:     Buffer;
  equityValueEnc?:   Buffer;
  // Lookup hashes
  emailHash:       string;
  nationalIdHash?: string;
  // Compensation metadata
  currencyCode:  string;
  salaryBand?:   string;
  payFrequency:  string;
  // Operational
  departmentId:    Types.ObjectId;
  departmentName:  string;
  departmentCode:  string;
  costCenterCode?: string;
  jobTitleId:      Types.ObjectId;
  jobTitle:        string;
  managerId?:      Types.ObjectId;
  managerName?:    string;
  countryCode:     string;
  timezone:        string;
  locale:          string;
  // Date milestones
  hireDate:          Date;
  hireDateMonth:     number;
  hireDateDay:       number;
  dateOfBirth?:      Date;
  birthMonth?:       number;
  birthDay?:         number;
  probationEndDate?: Date;
  lastWorkingDay?:   Date;
  nextReviewDate?:   Date;
  lastPromotionDate?: Date;
  // Lifecycle
  employeeStatus:       EmployeeStatus;
  employmentType:       EmploymentType;
  offboardInitiatedAt?: Date;
  offboardCompletedAt?: Date;
  // Embedded sub-documents
  statutoryProfiles:    IStatutoryProfile[];
  skills:               ISkillEntry[];
  provisionedAssets:    IProvisionedAssetRef[];
  vestingSchedules:     IVestingScheduleEntry[];
  immigrationRecords:   IImmigrationRecord[];
  deviceTrustState:     IDeviceTrustState;
  identityVerification: IIdentityVerification;
  digitalWorkerMeta:    IDigitalWorkerMeta;
  // ML signals
  burnoutRiskScore:  number;
  flightRiskScore:   number;
  engagementPct?:    number;
  riskComputedAt?:   Date;
  isActive:          boolean;
  createdAt:         Date;
  updatedAt:         Date;
  // Virtuals
  provisionedSaasCount:  number;
  totalUnvestedUnits:    number;
  immigrationAlertCount: number;
  isDeviceWriteBlocked:  boolean;
  tenureYears:           number;
}

export interface IEmployeeModel extends Model<IEmployee> {
  findByEmailHash(email: string): Promise<HydratedDocument<IEmployee> | null>;
  findByNationalIdHash(nationalId: string): Promise<HydratedDocument<IEmployee> | null>;
  getOrgTree(rootId: string | Types.ObjectId): Promise<OrgTreeNode[]>;
  matchBySkills(
    required: Array<{ skillSlug: string; minimumProficiency: SkillProficiency }>,
    opts?: { maxResults?: number; countryCodesFilter?: string[] },
  ): Promise<SkillMatchCandidate[]>;
  createWithEncryption(params: { plain: PlainEmployeeFields; meta: Partial<IEmployee> }): Promise<HydratedDocument<IEmployee>>;
}

export const AdvancedEmployee: IEmployeeModel =
  (mongoose.models['AdvancedEmployee'] as IEmployeeModel | undefined) ??
  model<IEmployee, IEmployeeModel>('AdvancedEmployee', AdvancedEmployeeSchema);

export default AdvancedEmployee;
