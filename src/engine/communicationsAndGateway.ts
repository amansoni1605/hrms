/**
 * FILE 3 OF 3 — Event-Driven Communication & API Gateway Engine
 *
 * Implements:
 *   § 1   CommunicationTemplate Schema & Model
 *   § 2   NotificationLog Schema & Model  (2-year TTL — ADR-007)
 *   § 3   Mustache {{handleKey}} Renderer  (LRU-cached, sanitized)
 *   § 4   BullMQ Queue Setup & Worker
 *   § 5   API Handler: trigger-milestone
 *   § 6   API Handler: endpoint-heartbeat
 *   § 7   API Handler: verify-liveness
 *   § 8   Next.js withTenantRoute helper
 */

import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse }  from 'next/server';
import mongoose, { Schema, model, type Model, type Document, type Types } from 'mongoose';
import { LRUCache }                   from 'lru-cache';
import { Queue, Worker, type Job }    from 'bullmq';

import {
  TenantContext,
  buildTenantStore,
  decryptField,
  encryptField,
  computeLookupHash,
  getTenantDEK,
  type DeviceTrustLevel,
  type UserRole,
  type TenantContextStore,
}                                     from '../infrastructure/multiTenantCore';

import { AdvancedEmployee }           from '../models/employee.advanced.model';
import { getSession }                 from '../lib/auth';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const HANDLE_PATTERN          = /\{\{(\w+)\}\}/g;
const UNRESOLVED_HANDLE_TEST  = /\{\{[\w]+\}\}/;
const NOTIFICATION_LOG_TTL_S  = 60 * 60 * 24 * 365 * 2;   // 2 years — ADR-007
const REDIS_CONNECTION        = {
  host: process.env['REDIS_HOST'] ?? 'localhost',
  port: Number(process.env['REDIS_PORT'] ?? 6379),
} as const;

const COMPLIANCE_WEIGHTS = Object.freeze({
  diskEncrypted:    30,
  mdmProfileActive: 25,
  osPatchCurrent:   20,
  edrAgentActive:   15,
  firewallEnabled:   5,
  antivirusActive:   5,
} as const);
type ComplianceKey = keyof typeof COMPLIANCE_WEIGHTS;

const LIVENESS = Object.freeze({
  MIN_SCORE:         0.90,
  MIN_ANTI_SPOOF:    0.85,
  MAX_FAILED:        5,
});

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type DeliveryStatus =
  | 'queued' | 'rendering' | 'dispatched' | 'delivered'
  | 'opened' | 'clicked' | 'bounced' | 'spam_flagged'
  | 'failed' | 'cancelled';

export type TemplateType =
  | 'onboarding_welcome' | 'onboarding_doc_request' | 'offboarding_checklist'
  | 'payslip_ready' | 'leave_approved' | 'leave_rejected' | 'leave_reminder'
  | 'it_credentials_dispatched' | 'liveness_verification_invite'
  | 'liveness_verified' | 'liveness_failed'
  | 'equity_vest_notification' | 'equity_exercise_window'
  | 'device_compliance_warning' | 'device_access_revoked' | 'device_access_restored'
  | 'immigration_nexus_triggered'
  | 'work_anniversary' | 'birthday_greeting' | 'probation_completion'
  | 'year_end_tax_declaration' | 'visa_expiry_alert' | 'nexus_risk_alert'
  | 'performance_review_open' | 'pulse_survey_invite' | 'open_enrollment_reminder'
  | 'salary_revision_notification' | 'custom';

interface ITemplateLocale {
  locale:     string;
  subject:    string;
  bodyHtml:   string;
  bodyText?:  string;
  preheader?: string;
}

interface ISupportedHandle { key: string; description: string; required: boolean; }

export interface ICommunicationTemplate extends Document {
  tenantId:          Types.ObjectId;
  templateKey:       string;
  templateType:      TemplateType;
  channel:           string;
  supportedHandles:  ISupportedHandle[];
  locales:           ITemplateLocale[];
  defaultLocale:     string;
  schedulingConfig?: {
    triggerType:        string;
    offsetDays?:        number;
    cronExpression?:    string;
    evaluationTimeUtc?: string;
  };
  version:    number;
  isActive:   boolean;
  createdBy?: Types.ObjectId;
  createdAt:  Date;
  updatedAt:  Date;
}

export interface INotificationLog extends Document {
  tenantId:               Types.ObjectId;
  employeeId?:            Types.ObjectId;
  recipientEmailHash?:    string;
  recipientEmailEnc?:     Buffer;
  channel:                string;
  templateId?:            Types.ObjectId;
  templateKey:            string;
  templateType:           string;
  locale:                 string;
  triggerEvent:           string;
  triggerPayload?:        Record<string, unknown>;
  deliveryStatus:         DeliveryStatus;
  deliveryStatusHistory:  Array<{ status: string; timestamp: Date; metadata?: unknown }>;
  providerMessageId?:     string;
  errorCode?:             string;
  errorMessage?:          string;
  retryCount:             number;
  nextRetryAt?:           Date;
  maxRetries:             number;
  queuedAt:               Date;
  dispatchedAt?:          Date;
  deliveredAt?:           Date;
  bullJobId?:             string;
  kafkaEventId?:          string;
  createdAt:              Date;
  updatedAt:              Date;
}

interface CommDispatchJobData {
  tenantId:          string;
  employeeId:        string;
  notificationLogId: string;
  templateKey:       string;
  locale:            string;
  triggerEvent:      string;
  extraVars:         Record<string, string>;
}

interface RenderedTemplate {
  subject:   string;
  bodyHtml:  string;
  bodyText:  string;
  preheader: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// § 1  CommunicationTemplate Schema & Model
// ─────────────────────────────────────────────────────────────────────────────

const CommunicationTemplateSchema = new Schema<ICommunicationTemplate>(
  {
    tenantId:      { type: Schema.Types.ObjectId, required: true, immutable: true },
    templateKey:   { type: String, required: true, trim: true, lowercase: true },
    templateType:  {
      type: String,
      enum: [
        'onboarding_welcome', 'onboarding_doc_request', 'offboarding_checklist',
        'payslip_ready', 'leave_approved', 'leave_rejected', 'leave_reminder',
        'it_credentials_dispatched', 'liveness_verification_invite',
        'liveness_verified', 'liveness_failed',
        'equity_vest_notification', 'equity_exercise_window',
        'device_compliance_warning', 'device_access_revoked', 'device_access_restored',
        'immigration_nexus_triggered',
        'work_anniversary', 'birthday_greeting', 'probation_completion',
        'year_end_tax_declaration', 'visa_expiry_alert', 'nexus_risk_alert',
        'performance_review_open', 'pulse_survey_invite', 'open_enrollment_reminder',
        'salary_revision_notification', 'custom',
      ],
      required: true,
    },
    channel:          { type: String, enum: ['email', 'slack', 'teams', 'sms', 'in_app'], default: 'email' },
    supportedHandles: [{
      key:         { type: String, required: true, trim: true },
      description: { type: String, default: '' },
      required:    { type: Boolean, default: false },
    }],
    locales: {
      type:     [new Schema<ITemplateLocale>({
        locale:    { type: String, required: true, trim: true },
        subject:   { type: String, required: true, trim: true },
        bodyHtml:  { type: String, required: true },
        bodyText:  { type: String },
        preheader: { type: String, trim: true },
      }, { _id: false })],
      required: true,
      validate: { validator: (v: unknown[]) => v.length >= 1, message: 'At least one locale required' },
    },
    defaultLocale:   { type: String, default: 'en-US', trim: true },
    schedulingConfig: {
      type: new Schema({
        triggerType:        { type: String, enum: ['date_offset', 'event_driven', 'recurring_cron'], required: true },
        offsetDays:         { type: Number },
        cronExpression:     { type: String },
        evaluationTimeUtc:  { type: String, match: /^\d{2}:\d{2}$/ },
      }, { _id: false }),
    },
    version:     { type: Number, default: 1, min: 1 },
    isActive:    { type: Boolean, default: true },
    createdBy:   { type: Schema.Types.ObjectId, ref: 'AdvancedEmployee' },
  },
  { timestamps: true, collection: 'communication_templates' }
);

CommunicationTemplateSchema.index({ tenantId: 1, templateKey: 1 }, { unique: true });
CommunicationTemplateSchema.index({ tenantId: 1, templateType: 1, isActive: 1 });

export const CommunicationTemplate: Model<ICommunicationTemplate> =
  (mongoose.models['CommunicationTemplate'] as Model<ICommunicationTemplate>) ??
  model<ICommunicationTemplate>('CommunicationTemplate', CommunicationTemplateSchema);

// ─────────────────────────────────────────────────────────────────────────────
// § 2  NotificationLog Schema & Model — 2-year TTL (ADR-007)
// ─────────────────────────────────────────────────────────────────────────────

const NotificationLogSchema = new Schema<INotificationLog>(
  {
    tenantId:            { type: Schema.Types.ObjectId, required: true, immutable: true },
    employeeId:          { type: Schema.Types.ObjectId, ref: 'AdvancedEmployee' },
    recipientEmailEnc:   { type: Buffer },
    recipientEmailHash:  { type: String, maxlength: 64 },
    channel:             { type: String, enum: ['email', 'slack', 'teams', 'sms', 'in_app'], required: true },
    templateId:          { type: Schema.Types.ObjectId, ref: 'CommunicationTemplate' },
    templateKey:         { type: String, required: true, trim: true },
    templateType:        { type: String, required: true },
    locale:              { type: String, default: 'en-US', trim: true },
    triggerEvent:        { type: String, required: true },
    triggerPayload:      { type: Schema.Types.Mixed },
    deliveryStatus:      {
      type:    String,
      enum:    ['queued', 'rendering', 'dispatched', 'delivered', 'opened', 'clicked', 'bounced', 'spam_flagged', 'failed', 'cancelled'],
      default: 'queued',
    },
    deliveryStatusHistory: [{
      status:    { type: String, required: true },
      timestamp: { type: Date, default: Date.now },
      metadata:  { type: Schema.Types.Mixed },
    }],
    providerMessageId: { type: String, trim: true },
    errorCode:         { type: String, trim: true },
    errorMessage:      { type: String },
    retryCount:        { type: Number, default: 0, min: 0 },
    nextRetryAt:       { type: Date },
    maxRetries:        { type: Number, default: 3, min: 0 },
    queuedAt:          { type: Date, default: Date.now, immutable: true },
    dispatchedAt:      { type: Date },
    deliveredAt:       { type: Date },
    bullJobId:         { type: String, trim: true },
    kafkaEventId:      { type: String, trim: true },
  },
  { timestamps: true, collection: 'notification_logs' }
);

NotificationLogSchema.index({ tenantId: 1, employeeId: 1, queuedAt: -1 });
NotificationLogSchema.index({ tenantId: 1, deliveryStatus: 1, queuedAt: -1 });
NotificationLogSchema.index({ tenantId: 1, templateType: 1, queuedAt: -1 });
NotificationLogSchema.index({ tenantId: 1, triggerEvent: 1 });
NotificationLogSchema.index(
  { nextRetryAt: 1 },
  { partialFilterExpression: { deliveryStatus: 'failed', retryCount: { $lt: 3 } } }
);

/**
 * ADR-007: Automated 2-year TTL index.
 * MongoDB auto-deletes notification logs 2 years after queuedAt.
 */
NotificationLogSchema.index(
  { queuedAt: 1 },
  { name: 'idx_ttl_2yr_regulatory', expireAfterSeconds: NOTIFICATION_LOG_TTL_S }
);

export const NotificationLog: Model<INotificationLog> =
  (mongoose.models['NotificationLog'] as Model<INotificationLog>) ??
  model<INotificationLog>('NotificationLog', NotificationLogSchema);

// ─────────────────────────────────────────────────────────────────────────────
// § 3  Mustache {{handleKey}} Template Renderer — LRU-cached
// ─────────────────────────────────────────────────────────────────────────────

interface CachedTpl { template: ICommunicationTemplate; loadedAt: number; }

const _templateCache = new LRUCache<string, CachedTpl>({
  max:          500,
  ttl:          30 * 60 * 1000,
  ttlAutopurge: true,
});

function _resolveLocale(
  locales:       ITemplateLocale[],
  requested:     string,
  defaultLocale: string,
): ITemplateLocale | null {
  return (
    locales.find((l) => l.locale === requested) ??
    locales.find((l) => l.locale.startsWith(requested.split('-')[0] + '-') || l.locale === requested.split('-')[0]) ??
    locales.find((l) => l.locale === defaultLocale) ??
    locales[0] ??
    null
  );
}

function _substitute(
  tpl:      string,
  vars:     Record<string, string>,
  handles:  ISupportedHandle[],
  strict:   boolean,
): string {
  if (strict) {
    const missing = handles.filter((h) => h.required && !vars[h.key]?.trim()).map((h) => `{{${h.key}}}`);
    if (missing.length) throw new Error(`TEMPLATE_STRICT: Missing required handles: ${missing.join(', ')}`);
  }
  const result = tpl.replace(HANDLE_PATTERN, (_m, key: string) => {
    const v = vars[key];
    if (v === undefined) { if (strict) throw new Error(`TEMPLATE_STRICT: Unknown handle {{${key}}}`); return ''; }
    return String(v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
  });
  if (UNRESOLVED_HANDLE_TEST.test(result)) {
    console.warn('[TemplateRenderer] Unresolved handles remain after substitution.');
  }
  return result;
}

async function _loadTemplate(templateKey: string): Promise<ICommunicationTemplate> {
  const ctx      = TenantContext.requireStore('loadTemplate');
  const cacheKey = `${ctx.tenantId.toString()}:${templateKey}`;
  const hit      = _templateCache.get(cacheKey);
  if (hit) return hit.template;

  const tmpl = await CommunicationTemplate.findOne({ templateKey, isActive: true }).lean() as ICommunicationTemplate | null;
  if (!tmpl) throw new Error(`TEMPLATE_NOT_FOUND: key="${templateKey}"`);

  _templateCache.set(cacheKey, { template: tmpl, loadedAt: Date.now() });
  return tmpl;
}

/**
 * Renders a {{handleKey}} template for the given locale and variables.
 * Uses locale waterfall: exact → language → default → first available.
 */
export async function renderTemplate(
  templateKey: string,
  locale:      string,
  variables:   Record<string, string>,
  strict       = false,
): Promise<RenderedTemplate> {
  const tmpl   = await _loadTemplate(templateKey);
  const locale_ = _resolveLocale(tmpl.locales, locale, tmpl.defaultLocale);
  if (!locale_) throw new Error(`TEMPLATE_LOCALE_NOT_FOUND: key="${templateKey}" locale="${locale}"`);

  const { supportedHandles: handles } = tmpl;
  const subject   = _substitute(locale_.subject,  variables, handles, strict);
  const rawHtml   = _substitute(locale_.bodyHtml, variables, handles, strict);
  const bodyText  = locale_.bodyText
    ? _substitute(locale_.bodyText, variables, handles, strict)
    : rawHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const preheader = locale_.preheader
    ? _substitute(locale_.preheader, variables, handles, strict)
    : subject.slice(0, 150);

  return { subject, bodyHtml: rawHtml, bodyText, preheader };
}

export function invalidateTemplateCache(tenantId: string, templateKey: string): void {
  _templateCache.delete(`${tenantId}:${templateKey}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// § 4  BullMQ Queue Setup & Dispatch Worker
// ─────────────────────────────────────────────────────────────────────────────

export const commsDispatchQueue = new Queue<CommDispatchJobData>('comms-dispatch', {
  connection: REDIS_CONNECTION,
  defaultJobOptions: {
    attempts:         3,
    backoff:          { type: 'exponential', delay: 5_000 },
    removeOnComplete: { count: 500 },
    removeOnFail:     { count: 200 },
  },
});

async function _processDispatch(job: Job<CommDispatchJobData>): Promise<void> {
  const { tenantId, employeeId, notificationLogId, templateKey, locale, triggerEvent, extraVars } = job.data;

  await new Promise<void>((resolve, reject) => {
    TenantContext.run(
      buildTenantStore({ tenantId, userId: '000000000000000000000000', role: 'digital_worker' }),
      async () => {
        try {
          await NotificationLog.findByIdAndUpdate(notificationLogId, {
            $set:  { deliveryStatus: 'rendering' },
            $push: { deliveryStatusHistory: { status: 'rendering', timestamp: new Date() } },
          });

          const emp = await AdvancedEmployee.findById(employeeId)
            .select('emailEnc fullNameEnc locale')
            .lean() as { emailEnc: Buffer; fullNameEnc: Buffer; locale?: string } | null;

          if (!emp) throw new Error(`Employee ${employeeId} not found`);

          const email     = await decryptField(tenantId, emp.emailEnc);
          const fullName  = await decryptField(tenantId, emp.fullNameEnc);
          const firstName = fullName.split(' ')[0] ?? fullName;

          const rendered = await renderTemplate(
            templateKey,
            emp.locale ?? locale,
            { employeeName: firstName, triggerEvent, companyName: process.env['COMPANY_NAME'] ?? 'HRMS', ...extraVars },
          );

          // TODO: integrate SendGrid / SES dispatch here
          console.info(`[CommsWorker] Dispatching "${templateKey}" to ${email.replace(/(.{2}).+(@.+)/, '$1***$2')}`);

          await NotificationLog.findByIdAndUpdate(notificationLogId, {
            $set:  { deliveryStatus: 'dispatched', dispatchedAt: new Date(), providerMessageId: randomUUID() },
            $push: { deliveryStatusHistory: { status: 'dispatched', timestamp: new Date() } },
          });

          resolve();
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}

export function startCommunicationWorkers(): { stop: () => Promise<void> } {
  const worker = new Worker<CommDispatchJobData>('comms-dispatch', _processDispatch, {
    connection:  REDIS_CONNECTION,
    concurrency: 20,
  });

  worker.on('failed', async (job, err) => {
    if (!job) return;
    const isTerminal = (job.attemptsMade ?? 0) >= (job.opts.attempts ?? 3);
    await NotificationLog.findByIdAndUpdate(job.data.notificationLogId, {
      $set: {
        deliveryStatus: isTerminal ? 'failed' : 'queued',
        errorMessage:   err.message,
        retryCount:     job.attemptsMade ?? 0,
      },
      $push: { deliveryStatusHistory: { status: isTerminal ? 'failed' : 'queued', timestamp: new Date(), metadata: { error: err.message } } },
    }).catch(console.error);
  });

  return { stop: () => worker.close() };
}

// ─────────────────────────────────────────────────────────────────────────────
// § 5  API Handler: POST /api/v3/communications/trigger-milestone
// ─────────────────────────────────────────────────────────────────────────────

export async function handleTriggerMilestone(req: NextRequest): Promise<NextResponse> {
  const ctx = TenantContext.requireStore('trigger-milestone');
  const body = await req.json() as {
    milestoneType:  TemplateType;
    evaluationDate?: string;
    scope?:         { countryCodesFilter?: string[] };
    offsetWindows?: Array<{ offsetDays: number; templateKey: string }>;
    options?:       { dryRun?: boolean; batchSize?: number };
  };

  const evalDate    = body.evaluationDate ? new Date(body.evaluationDate) : new Date();
  const dryRun      = body.options?.dryRun ?? false;
  const batchSize   = body.options?.batchSize ?? 250;
  const batchId     = randomUUID();
  const windows     = body.offsetWindows ?? [{ offsetDays: 0, templateKey: body.milestoneType }];
  const results: Array<{ offsetDays: number; recipientsQueued: number }> = [];

  for (const win of windows) {
    const targetDate  = new Date(evalDate);
    targetDate.setUTCDate(targetDate.getUTCDate() + win.offsetDays);
    const targetMonth = targetDate.getUTCMonth() + 1;
    const targetDay   = targetDate.getUTCDate();

    const baseMatch: Record<string, unknown> = { isActive: true, employeeStatus: 'active' };
    if (body.milestoneType === 'work_anniversary') {
      baseMatch['hireDateMonth'] = targetMonth;
      baseMatch['hireDateDay']   = targetDay;
    } else if (body.milestoneType === 'birthday_greeting') {
      baseMatch['birthMonth'] = targetMonth;
      baseMatch['birthDay']   = targetDay;
    } else if (body.milestoneType === 'visa_expiry_alert') {
      baseMatch['immigrationRecords.expiresAt'] = { $gte: targetDate, $lt: new Date(targetDate.getTime() + 86_400_000) };
      baseMatch['immigrationRecords.status']    = 'active';
    }

    if (body.scope?.countryCodesFilter?.length) {
      baseMatch['countryCode'] = { $in: body.scope.countryCodesFilter.map((c) => c.toUpperCase()) };
    }

    // Zero-PII aggregation — encrypted fields explicitly projected out
    const cohort = await AdvancedEmployee.aggregate<{
      _id: Types.ObjectId; emailHash: string; emailEnc: Buffer; locale: string;
    }>([
      { $match: baseMatch },
      { $limit: 5_000 },
      { $project: { _id: 1, emailHash: 1, emailEnc: 1, locale: 1, fullNameEnc: 0, nationalIdEnc: 0, baseSalaryEnc: 0 } },
    ]).exec();

    if (dryRun) { results.push({ offsetDays: win.offsetDays, recipientsQueued: cohort.length }); continue; }

    let queued = 0;
    for (let i = 0; i < cohort.length; i += batchSize) {
      const batch = cohort.slice(i, i + batchSize);

      const logs = await NotificationLog.insertMany(batch.map((emp) => ({
        tenantId:             ctx.tenantId,
        employeeId:           emp._id,
        recipientEmailEnc:    emp.emailEnc,
        recipientEmailHash:   emp.emailHash,
        channel:              'email',
        templateKey:          win.templateKey,
        templateType:         body.milestoneType,
        locale:               emp.locale ?? 'en-US',
        triggerEvent:         body.milestoneType,
        triggerPayload:       { offsetDays: win.offsetDays, batchId },
        deliveryStatus:       'queued' as DeliveryStatus,
        deliveryStatusHistory: [{ status: 'queued', timestamp: new Date() }],
        retryCount: 0, maxRetries: 3, queuedAt: new Date(),
      })), { ordered: false });

      const jobs = await commsDispatchQueue.addBulk(logs.map((log, idx) => ({
        name: 'dispatch',
        data: { tenantId: ctx.tenantId.toString(), employeeId: batch[idx]!._id.toString(), notificationLogId: log._id.toString(), templateKey: win.templateKey, locale: batch[idx]!.locale ?? 'en-US', triggerEvent: body.milestoneType, extraVars: { batchId } } satisfies CommDispatchJobData,
      })));

      await Promise.all(logs.map((log, i) =>
        NotificationLog.findByIdAndUpdate(log._id, { $set: { bullJobId: String(jobs[i]?.id ?? '') } })
      ));
      queued += logs.length;
    }
    results.push({ offsetDays: win.offsetDays, recipientsQueued: queued });
  }

  return NextResponse.json({
    batchId,
    milestoneType:  body.milestoneType,
    evaluationDate: evalDate.toISOString(),
    status:         'accepted',
    totalQueued:    results.reduce((s, r) => s + r.recipientsQueued, 0),
    windows:        results,
    dryRun,
  }, { status: 202 });
}

// ─────────────────────────────────────────────────────────────────────────────
// § 6  API Handler: POST /api/v3/security/endpoint-heartbeat
// ─────────────────────────────────────────────────────────────────────────────

export async function handleEndpointHeartbeat(req: NextRequest): Promise<NextResponse> {
  const ctx  = TenantContext.requireStore('endpoint-heartbeat');
  const body = await req.json() as {
    employeeId:        string;
    deviceId:          string;
    deviceFingerprint: string;
    mdmEnrollmentId?:  string;
    mdmProvider?:      string;
    complianceMetrics: Record<ComplianceKey, boolean> & { jailbreakDetected: boolean; unauthorizedSoftware: boolean };
    clientTimestamp:   string;
    signaturePayload:  string;
  };

  // 1. Validate signature
  const secret = process.env['DEVICE_HMAC_SECRET'] ?? 'dev-device-secret';
  const expectedSig = createHmac('sha256', secret)
    .update(JSON.stringify({ employeeId: body.employeeId, deviceId: body.deviceId, metrics: body.complianceMetrics, timestamp: body.clientTimestamp }))
    .digest('base64');

  let sigOk = false;
  try { sigOk = timingSafeEqual(Buffer.from(body.signaturePayload, 'base64'), Buffer.from(expectedSig, 'base64')); } catch { sigOk = false; }
  if (!sigOk) return NextResponse.json({ error: { code: 'HEARTBEAT_SIGNATURE_INVALID' } }, { status: 401 });

  // 2. Compute compliance score
  const score = (Object.keys(COMPLIANCE_WEIGHTS) as ComplianceKey[])
    .reduce((s, k) => s + (body.complianceMetrics[k] ? COMPLIANCE_WEIGHTS[k] : 0), 0);

  let trustLevel: DeviceTrustLevel;
  let accessThrottle: number;

  if (body.complianceMetrics.jailbreakDetected || body.complianceMetrics.unauthorizedSoftware) {
    trustLevel = 'revoked';       accessThrottle = 0;
  } else if (score >= 90) {
    trustLevel = 'trusted';       accessThrottle = 1.00;
  } else if (score >= 70) {
    trustLevel = 'conditional';   accessThrottle = 0.75;
  } else if (score >= 50) {
    trustLevel = 'conditional';   accessThrottle = 0.50;
  } else {
    trustLevel = 'non_compliant'; accessThrottle = 0.10;
  }

  const now = new Date();

  // 3. Update employee deviceTrustState
  await AdvancedEmployee.findByIdAndUpdate(body.employeeId, {
    $set: {
      'deviceTrustState.deviceId':            body.deviceId,
      'deviceTrustState.deviceFingerprint':   body.deviceFingerprint,
      'deviceTrustState.mdmEnrollmentId':     body.mdmEnrollmentId,
      'deviceTrustState.mdmProvider':         body.mdmProvider,
      'deviceTrustState.lastHeartbeatAt':     now,
      'deviceTrustState.diskEncrypted':       body.complianceMetrics.diskEncrypted,
      'deviceTrustState.osPatchCurrent':      body.complianceMetrics.osPatchCurrent,
      'deviceTrustState.mdmProfileActive':    body.complianceMetrics.mdmProfileActive,
      'deviceTrustState.edrAgentActive':      body.complianceMetrics.edrAgentActive,
      'deviceTrustState.firewallEnabled':     body.complianceMetrics.firewallEnabled,
      'deviceTrustState.antivirusActive':     body.complianceMetrics.antivirusActive,
      'deviceTrustState.complianceScore':     score,
      'deviceTrustState.trustLevel':          trustLevel,
      'deviceTrustState.accessTokenThrottle': accessThrottle,
      ...(trustLevel === 'revoked' ? { 'deviceTrustState.autoRevokedAt': now } : {}),
    },
  });

  // 4. Queue device_access_revoked notification on revocation
  if (trustLevel === 'revoked') {
    const emp = await AdvancedEmployee.findById(body.employeeId).select('emailEnc emailHash locale').lean() as
      { emailEnc?: Buffer; emailHash?: string; locale?: string } | null;

    if (emp?.emailEnc) {
      const log = await NotificationLog.create({
        tenantId: ctx.tenantId, employeeId: body.employeeId,
        recipientEmailEnc: emp.emailEnc, recipientEmailHash: emp.emailHash,
        channel: 'email', templateKey: 'device_access_revoked', templateType: 'device_access_revoked',
        locale: emp.locale ?? 'en-US', triggerEvent: 'device_access_revoked',
        deliveryStatus: 'queued', deliveryStatusHistory: [{ status: 'queued', timestamp: new Date() }],
        retryCount: 0, maxRetries: 3, queuedAt: new Date(),
      });
      const job = await commsDispatchQueue.add('dispatch', {
        tenantId: ctx.tenantId.toString(), employeeId: body.employeeId,
        notificationLogId: log._id.toString(), templateKey: 'device_access_revoked',
        locale: emp.locale ?? 'en-US', triggerEvent: 'device_access_revoked',
        extraVars: { deviceId: body.deviceId, revokedAt: now.toISOString() },
      } satisfies CommDispatchJobData);
      await NotificationLog.findByIdAndUpdate(log._id, { $set: { bullJobId: String(job.id) } });
    }
  }

  return NextResponse.json({
    heartbeatId:    randomUUID(),
    receivedAt:     now.toISOString(),
    employeeId:     body.employeeId,
    timeDriftMs:    now.getTime() - new Date(body.clientTimestamp).getTime(),
    evaluation: {
      complianceScore: score, trustLevel, accessThrottle,
      accessRestricted: accessThrottle < 1,
      nextHeartbeatExpectedAt: new Date(now.getTime() + 300_000).toISOString(),
    },
    action: trustLevel === 'revoked' ? 'ACCESS_REVOKED' : 'NONE',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// § 7  API Handler: POST /api/v3/onboarding/verify-liveness
// ─────────────────────────────────────────────────────────────────────────────

export async function handleVerifyLiveness(req: NextRequest): Promise<NextResponse> {
  const ctx  = TenantContext.requireStore('verify-liveness');
  const body = await req.json() as {
    employeeId:             string;
    verificationSessionId:  string;
    provider:               string;
    webauthnPayload:        { authenticatorData: string; credentialId: string };
    livenessPayload:        { token: string; livenessScore: number; antiSpoofScore: number; verificationTimestamp: string };
    sessionSignature:       string;
  };

  // 1. Validate provider HMAC signature
  const secretKey     = `LIVENESS_HMAC_SECRET_${body.provider.toUpperCase()}`;
  const providerSecret = process.env[secretKey];
  if (!providerSecret) {
    return NextResponse.json({ error: { code: 'LIVENESS_PROVIDER_NOT_CONFIGURED', message: `Provider "${body.provider}" not configured` } }, { status: 400 });
  }

  const canon = JSON.stringify({
    sessionId: body.verificationSessionId, employeeId: body.employeeId,
    score: body.livenessPayload.livenessScore, antiSpoof: body.livenessPayload.antiSpoofScore,
    timestamp: body.livenessPayload.verificationTimestamp,
  });
  const expectedSig = createHmac('sha256', providerSecret).update(canon).digest('base64');

  let sigOk = false;
  try { sigOk = timingSafeEqual(Buffer.from(body.sessionSignature, 'base64'), Buffer.from(expectedSig, 'base64')); } catch { sigOk = false; }
  if (!sigOk) return NextResponse.json({ error: { code: 'LIVENESS_SIGNATURE_INVALID' } }, { status: 401 });

  // 2. Fetch employee
  const emp = await AdvancedEmployee.findById(body.employeeId)
    .select('identityVerification employeeStatus emailEnc emailHash locale')
    .lean() as { identityVerification?: { failedAttempts?: number }; employeeStatus?: string; emailEnc?: Buffer; emailHash?: string; locale?: string } | null;

  if (!emp) return NextResponse.json({ error: { code: 'EMPLOYEE_NOT_FOUND' } }, { status: 404 });

  const attempts = emp.identityVerification?.failedAttempts ?? 0;
  if (attempts >= LIVENESS.MAX_FAILED) {
    return NextResponse.json({ error: { code: 'LIVENESS_MAX_ATTEMPTS_EXCEEDED', failedAttempts: attempts } }, { status: 429 });
  }

  // 3. Evaluate scores
  const livenessOk  = body.livenessPayload.livenessScore  >= LIVENESS.MIN_SCORE;
  const antiSpoofOk = body.livenessPayload.antiSpoofScore >= LIVENESS.MIN_ANTI_SPOOF;
  const passed      = livenessOk && antiSpoofOk;

  // 4. Hash biometric data — NEVER store raw data
  const biometricTemplateHash = createHash('sha256')
    .update(`${body.verificationSessionId}:${ctx.tenantId.toString()}:${body.livenessPayload.token}`)
    .digest('hex');

  const webAuthnPublicKeyHash = createHash('sha256')
    .update(Buffer.from(body.webauthnPayload.authenticatorData, 'base64url'))
    .digest('hex');

  const now = new Date();

  // 5. Update employee
  await AdvancedEmployee.findByIdAndUpdate(body.employeeId, {
    $set: {
      'identityVerification.verificationSessionId':  body.verificationSessionId,
      'identityVerification.webAuthnCredentialId':   body.webauthnPayload.credentialId,
      'identityVerification.webAuthnPublicKeyHash':  webAuthnPublicKeyHash,
      'identityVerification.livenessCheckPassed':    passed,
      'identityVerification.livenessScore':           body.livenessPayload.livenessScore,
      'identityVerification.antiSpoofScore':          body.livenessPayload.antiSpoofScore,
      'identityVerification.biometricTemplateHash':   biometricTemplateHash,
      'identityVerification.verificationProvider':    body.provider,
      'identityVerification.verificationStatus':      passed ? 'verified' : 'failed',
      'identityVerification.verifiedAt':              passed ? now : undefined,
      'identityVerification.lastFailedAt':            passed ? undefined : now,
      'identityVerification.failedAttempts':          passed ? 0 : attempts + 1,
      ...(passed && emp.employeeStatus === 'pre_hire' ? { employeeStatus: 'active' } : {}),
    },
  });

  // 6. Trigger welcome email on first successful verification
  if (passed && emp.employeeStatus === 'pre_hire' && emp.emailEnc) {
    const log = await NotificationLog.create({
      tenantId: ctx.tenantId, employeeId: body.employeeId,
      recipientEmailEnc: emp.emailEnc, recipientEmailHash: emp.emailHash,
      channel: 'email', templateKey: 'onboarding_welcome', templateType: 'onboarding_welcome',
      locale: emp.locale ?? 'en-US', triggerEvent: 'liveness_verified',
      deliveryStatus: 'queued', deliveryStatusHistory: [{ status: 'queued', timestamp: now }],
      retryCount: 0, maxRetries: 3, queuedAt: now,
    });
    const job = await commsDispatchQueue.add('dispatch', {
      tenantId: ctx.tenantId.toString(), employeeId: body.employeeId,
      notificationLogId: log._id.toString(), templateKey: 'onboarding_welcome',
      locale: emp.locale ?? 'en-US', triggerEvent: 'liveness_verified', extraVars: {},
    } satisfies CommDispatchJobData);
    await NotificationLog.findByIdAndUpdate(log._id, { $set: { bullJobId: String(job.id) } });
  }

  if (!passed) {
    return NextResponse.json({
      verificationStatus: 'failed',
      failureReasons: [
        ...(!livenessOk  ? [{ check: 'liveness_score',   actual: body.livenessPayload.livenessScore,  threshold: LIVENESS.MIN_SCORE }] : []),
        ...(!antiSpoofOk ? [{ check: 'anti_spoof_score', actual: body.livenessPayload.antiSpoofScore, threshold: LIVENESS.MIN_ANTI_SPOOF }] : []),
      ],
      retryAllowed:      LIVENESS.MAX_FAILED - (attempts + 1) > 0,
      attemptsRemaining: Math.max(0, LIVENESS.MAX_FAILED - (attempts + 1)),
    }, { status: 422 });
  }

  return NextResponse.json({
    verificationId:         randomUUID(),
    employeeId:             body.employeeId,
    verificationStatus:     'verified',
    verifiedAt:             now.toISOString(),
    scores:                 { livenessScore: body.livenessPayload.livenessScore, antiSpoofScore: body.livenessPayload.antiSpoofScore },
    biometric:              { templateHashRecorded: true, rawBiometricStored: false },
    employeeStatusUpdated:  emp.employeeStatus === 'pre_hire' ? 'active' : emp.employeeStatus,
    welcomeEmailQueued:     emp.employeeStatus === 'pre_hire',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// § 8  Next.js Route Wrapper — withTenantRoute
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wraps a Next.js App Router handler in a validated TenantContext.
 * Reads the session cookie, validates it, and runs the handler inside ALS.
 *
 * @example
 * // src/app/api/v3/communications/trigger-milestone/route.ts
 * import { withTenantRoute, handleTriggerMilestone } from '@/engine/communicationsAndGateway';
 * export const POST = withTenantRoute(handleTriggerMilestone);
 */
export function withTenantRoute(
  handler: (req: NextRequest) => Promise<NextResponse>,
): (req: NextRequest) => Promise<NextResponse> {
  return async (req: NextRequest): Promise<NextResponse> => {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    }

    const store = buildTenantStore({
      userId:     session.userId,
      tenantId:   session.tenantId ?? '',
      role:       session.role,
      employeeId: session.employeeId ?? null,
      requestId:  req.headers.get('x-request-id') ?? randomUUID(),
    });

    return TenantContext.run(store, () => handler(req));
  };
}
