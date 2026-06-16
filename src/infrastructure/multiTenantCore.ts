/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  HRMS PRO v14.0 — Multi-Tenant Security & Core Infrastructure            ║
 * ║  src/infrastructure/multiTenantCore.ts                                   ║
 * ║                                                                          ║
 * ║  ADR-001  AES-256-GCM field-level encryption (CSFLE) + LRU DEK cache     ║
 * ║  ADR-002  Pulse Telemetry Bucket Pattern (~200 responses/doc)            ║
 * ║  ADR-003  Absolute tenant isolation via AsyncLocalStorage + Mongoose plugin
 * ║  ADR-004  Attendance Time-Series via MongoDB native time-series collection
 * ║  ADR-005  Zero-trust device-compliance write-gate                        ║
 * ║  ADR-006  HMAC-keyed audit chain with INSERT-only enforcement            ║
 * ║  ADR-007  Regulatory retention TTL (2yr notifications, 7yr audit)        ║
 * ║                                                                          ║
 * ║  v14.0 Frontier additions:                                               ║
 * ║    • Versioned wire format for forward-compat algorithm migration         ║
 * ║    • DEK rotation pipeline with safe re-encryption                       ║
 * ║    • Per-tenant cache stat exposer for ops dashboards                    ║
 * ║    • Audit-key derivation from DEK via HMAC                              ║
 * ║    • Request-ID propagation through ALS for correlation tracing          ║
 * ║    • BSON Binary normalization for Mongoose .lean() compatibility        ║
 * ║    • Dual-source recipient resolution (legacy User + WorkspaceUser)      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * CRITICAL ORDERING — registerGlobalTenantPlugin() MUST run as the first
 * statement in src/instrumentation.ts.  Node.js module evaluation order
 * means the plugin must be applied to the Schema prototype before any
 * Schema instance is compiled into a Model.
 */

import { AsyncLocalStorage }       from 'node:async_hooks';
import {
  randomBytes,
  randomUUID,
  createCipheriv,
  createDecipheriv,
  createHmac,
  timingSafeEqual,
}                                   from 'node:crypto';
import mongoose, {
  type Document,
  type Model,
  type Schema,
  type Types,
}                                   from 'mongoose';
import { LRUCache }                 from 'lru-cache';

// ═════════════════════════════════════════════════════════════════════════════
// § 1  CONSTANTS, COLLECTION REGISTRIES & ENUMS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * GLOBAL_COLLECTIONS — collections that are tenant-agnostic and must bypass
 * the isolation plugin entirely.  The 'users' collection is intentionally
 * here so /api/auth/login can find a User document without ALS context.
 */
export const GLOBAL_COLLECTIONS = new Set<string>([
  'tenants',
  'users',                       // login / bootstrap — see ADR-003 §3.1
  'system.users',
  'system.roles',
  'system.version',
  'system.profile',
]);

/**
 * TENANT_SCOPED — collections that MUST receive automatic tenantId scoping.
 * Every new workspace collection MUST be added here, otherwise the plugin
 * will silently skip it.  Order does not matter; lookup is O(1).
 */
export const TENANT_SCOPED = new Set<string>([
  // Legacy collections (kept for migration compatibility)
  'employees',
  'employees_advanced',
  'attendance_logs',
  'pulse_telemetry',
  'payroll_runs',
  'payroll_line_items',
  'immutable_audit_trail',
  'provisioned_assets',
  'notification_logs',
  'communication_templates',
  'departments',
  'job_titles',
  'leave_requests',
  'leave_balances',
  'shifts',
  'equity_grants',
  'immigration_records',
  'endpoint_telemetry',
  'device_compliance_logs',
  'liveness_sessions',
  'gl_sync_logs',
  'digital_worker_logs',

  // Canonical Workspace collections (ws_* prefix)
  'ws_departments',
  'ws_employees',
  'ws_leave_requests',
  'ws_leave_balances',
  'ws_payroll_runs',
  'ws_comms_templates',
  'ws_notification_logs',
  'ws_audit_trail',
  'ws_users',

  // Simple attendance collection
  'attendance_logs_simple',

  // ADR-002 Pulse Telemetry — Bucket Pattern
  'ws_pulse_telemetry_buckets',

  // ADR-004 Attendance — MongoDB native Time-Series
  'ws_attendance_timeseries',

  // §13 In-app notifications (per-user inbox)
  'ws_inapp_notifications',

  // §14 Per-user settings
  'ws_user_settings',

  // §15 Performance reviews (PMS)
  'ws_performance_reviews',
  'ws_compensation_history',
  'ws_goals',

  // §16 Appraisal / PMS v2 collections
  'ws_appraisal_cycles',
  'ws_pms_reviews',
  'ws_pips',
  'ws_org_nodes',
  'ws_peer_nominations',
  'ws_feedback_events',
  'ws_increment_matrices',

  // §12b Attendance regularization requests
  'ws_attendance_regularizations',
]);

/** Device-trust levels that hard-block ALL write operations (ZT enforcement). */
const ZT_WRITES_BLOCKED = new Set<DeviceTrustLevel>(['revoked', 'non_compliant']);

/** Roles allowed to issue deleteOne / deleteMany. */
const DELETE_ALLOWED_ROLES = new Set<UserRole>(['super_admin', 'hr_admin']);

// ═════════════════════════════════════════════════════════════════════════════
// § 2  DOMAIN TYPE SYSTEM
// ═════════════════════════════════════════════════════════════════════════════

export type DeviceTrustLevel =
  | 'trusted'
  | 'conditional'
  | 'non_compliant'
  | 'revoked'
  | 'unknown';

export type UserRole =
  | 'super_admin'
  | 'hr_admin'
  | 'hr_manager'
  | 'payroll_officer'
  | 'finance_auditor'
  | 'compliance_officer'
  | 'employee'
  | 'digital_worker'
  | 'readonly';

/** Shape held in AsyncLocalStorage for every authenticated request. */
export interface TenantContextStore {
  tenantId:    mongoose.Types.ObjectId;
  userId:      mongoose.Types.ObjectId;
  userRole:    UserRole;
  employeeId:  mongoose.Types.ObjectId | null;
  deviceTrust: DeviceTrustLevel;
  requestId:   string;
  createdAt:   Date;
  /** Optional correlation tag — used for distributed-tracing context. */
  traceId?:    string;
}

// ═════════════════════════════════════════════════════════════════════════════
// § 3  INFRASTRUCTURE ERROR HIERARCHY
// ═════════════════════════════════════════════════════════════════════════════

export class InfrastructureError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name  = 'InfrastructureError';
    this.code  = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class TenantContextMissingError extends InfrastructureError {
  constructor(operation?: string) {
    super(
      'TENANT_CTX_MISSING',
      `[TenantIsolation] No active ALS context${operation ? ` during "${operation}"` : ''}. ` +
      `Wrap this route with TenantContext.run() or withTenantContext().`,
    );
    this.name = 'TenantContextMissingError';
  }
}

export class TenantIsolationViolationError extends InfrastructureError {
  constructor(queried: string, session: string, operation: string) {
    super(
      'TENANT_ISOLATION_VIOLATION',
      `[TenantIsolation] Cross-tenant access blocked. ` +
      `operation="${operation}" filter.tenantId="${queried}" session.tenantId="${session}"`,
    );
    this.name = 'TenantIsolationViolationError';
  }
}

export class ZeroTrustViolationError extends InfrastructureError {
  constructor(trustLevel: DeviceTrustLevel, operation: string) {
    super(
      'ZT_WRITE_BLOCKED',
      `[ZeroTrust] Write blocked for device trust level "${trustLevel}" on operation "${operation}". ` +
      `Device must be trusted or conditional to perform writes.`,
    );
    this.name = 'ZeroTrustViolationError';
  }
}

export class DeletePermissionDeniedError extends InfrastructureError {
  constructor(role: string) {
    super(
      'DELETE_PERMISSION_DENIED',
      `[RBAC] Delete operations are restricted to super_admin and hr_admin. Current role: "${role}".`,
    );
    this.name = 'DeletePermissionDeniedError';
  }
}

export class DEKProvisioningError extends InfrastructureError {
  constructor(tenantId: string, cause: unknown) {
    super(
      'DEK_PROVISIONING_FAILED',
      `[Encryption] DEK provisioning failed for tenant="${tenantId}": ` +
      (cause instanceof Error ? cause.message : String(cause)),
    );
    this.name = 'DEKProvisioningError';
  }
}

export class CryptographicVersionError extends InfrastructureError {
  constructor(version: number) {
    super(
      'CRYPTO_VERSION_UNSUPPORTED',
      `[CSFLE] Unsupported encryption wire-format version: 0x${version.toString(16).padStart(2, '0')}. ` +
      `Re-run migrations or upgrade the platform.`,
    );
    this.name = 'CryptographicVersionError';
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// § 4  ASYNC LOCAL STORAGE — TENANT CONTEXT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Module-level globals can be duplicated by Next.js's module federation and
 * hot-reload mechanisms.  We pin a single ALS instance to globalThis via a
 * Symbol so that every dynamic-import and server-component code path shares
 * the same context store.
 */
declare global {
  // eslint-disable-next-line no-var
  var __hrms_tenant_als: AsyncLocalStorage<TenantContextStore> | undefined;
}

if (!global.__hrms_tenant_als) {
  global.__hrms_tenant_als = new AsyncLocalStorage<TenantContextStore>();
}

const _GLOBAL_ALS = global.__hrms_tenant_als!;

/**
 * TenantContext — public API for entering and reading the per-request store.
 *
 * @example
 *   await TenantContext.run(store, async () => {
 *     // all Mongoose ops inside here are automatically tenant-scoped
 *     await WorkspaceEmployee.find({ isActive: true });
 *   });
 */
export class TenantContext {
  private static get _als() { return _GLOBAL_ALS; }

  /**
   * Run `fn` inside an ALS continuation where every `await` inherits the
   * same tenant store.
   */
  static run<T>(store: TenantContextStore, fn: () => Promise<T>): Promise<T> {
    return this._als.run(store, fn);
  }

  /** Returns the active store or throws TenantContextMissingError. */
  static requireStore(operation?: string): TenantContextStore {
    const store = this._als.getStore();
    if (!store) throw new TenantContextMissingError(operation);
    return store;
  }

  /** Returns the active store or `undefined` (never throws). */
  static getStore(): TenantContextStore | undefined {
    return this._als.getStore();
  }

  static get tenantId(): mongoose.Types.ObjectId {
    return this.requireStore('TenantContext.tenantId').tenantId;
  }

  static get userRole(): UserRole {
    return this.requireStore('TenantContext.userRole').userRole;
  }

  static get requestId(): string {
    return this.requireStore('TenantContext.requestId').requestId;
  }
}

/** Alias for older import paths. */
export const withTenantContext = TenantContext.run.bind(TenantContext);

// ═════════════════════════════════════════════════════════════════════════════
// § 5  MONGOOSE GLOBAL TENANT ISOLATION PLUGIN
// ═════════════════════════════════════════════════════════════════════════════

/**
 * tenantIsolationPlugin — applied globally via mongoose.plugin().
 *
 * Per-hook behaviour:
 *   • find / findOne / countDocuments / exists / distinct
 *       → injects  { tenantId } into the query filter, OR validates the
 *         caller-supplied tenantId against the ALS session value.
 *   • findOneAndUpdate / findOneAndReplace / findOneAndDelete
 *       → same injection + ZT write-gate.
 *   • updateOne / updateMany
 *       → injects { tenantId } via .where(); ZT write-gate.
 *   • deleteOne / deleteMany
 *       → injects { tenantId }; enforces DELETE_ALLOWED_ROLES.
 *   • save (document middleware)
 *       → stamps tenantId on new documents; validates existing docs.
 *   • insertMany
 *       → stamps tenantId on every doc in the batch.
 *   • aggregate
 *       → prepends  { $match: { tenantId } } OR validates/stamps the
 *         first $match stage.  Mongoose v9 uses throw-to-abort (no next).
 *
 * Collection routing:
 *   At plugin-registration time (schema compilation), collection name is
 *   often '' because Mongoose derives it from the model name later.
 *   shouldApply() therefore re-resolves the name at hook-execution time
 *   from the live query/document object and cross-checks against
 *   TENANT_SCOPED and GLOBAL_COLLECTIONS.
 *
 * Bypass mechanism:
 *   Setting `query._bypassTenantPlugin = true` on a query object skips all
 *   tenant injection.  Used by:
 *     • Login (User.findOne before session exists)
 *     • DEK bootstrap (Tenant updateOne before any tenant context)
 *     • Notification recipient resolution (cross-tenant lookups by role)
 */
export function tenantIsolationPlugin(
  schema: mongoose.Schema,
  options?: { collection?: string },
): void {
  const collectionName = (
    options?.collection ?? (schema as unknown as { get(k: string): string }).get?.('collection') ?? ''
  ) as string;

  // Explicitly global at registration time → skip entirely.
  if (GLOBAL_COLLECTIONS.has(collectionName)) return;

  const isExplicitlyScoped   = collectionName !== '' && TENANT_SCOPED.has(collectionName);
  const isExplicitlyExcluded =
    collectionName !== '' &&
    !TENANT_SCOPED.has(collectionName) &&
    !GLOBAL_COLLECTIONS.has(collectionName);

  // Named but in neither list → skip (e.g. test fixtures).
  if (isExplicitlyExcluded) return;

  // ── Runtime collection-name guard ──────────────────────────────────────────
  // Called inside EVERY hook before touching the ALS context. Resolves the
  // collection name from whichever live object Mongoose hands us.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function shouldApply(queryOrDoc?: any): boolean {
    if (isExplicitlyScoped) return true;

    const runtimeColl: string =
      queryOrDoc?.mongooseCollection?.name ??
      queryOrDoc?.collection?.name ??
      queryOrDoc?.constructor?.collection?.name ??
      // Aggregate objects expose the model
      queryOrDoc?._model?.collection?.name ??
      '';

    if (!runtimeColl)                          return true;  // unknown → apply conservatively
    if (GLOBAL_COLLECTIONS.has(runtimeColl))   return false; // explicitly global
    if (!TENANT_SCOPED.has(runtimeColl))       return false; // not in scope registry
    return true;
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  function requireCtx(op: string): TenantContextStore {
    return TenantContext.requireStore(op);
  }

  function requireWriteCtx(op: string): TenantContextStore {
    const ctx = requireCtx(op);
    if (ZT_WRITES_BLOCKED.has(ctx.deviceTrust)) {
      throw new ZeroTrustViolationError(ctx.deviceTrust, op);
    }
    return ctx;
  }

  /**
   * Injects tenantId into a query filter OR validates a caller-supplied value.
   * Prevents spoofed tenantId values from bypassing row-level isolation.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function injectOrValidateTenant(query: any, ctx: TenantContextStore, op: string): void {
    if (query._bypassTenantPlugin) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter = query.getFilter?.() as Record<string, any> | undefined;
    if (!filter) { query.where?.({ tenantId: ctx.tenantId }); return; }

    if (filter['tenantId'] !== undefined) {
      let queried: string;
      try {
        queried = new mongoose.Types.ObjectId(filter['tenantId'] as string).toString();
      } catch {
        throw new TenantIsolationViolationError(String(filter['tenantId']), ctx.tenantId.toString(), op);
      }
      if (queried !== ctx.tenantId.toString()) {
        throw new TenantIsolationViolationError(queried, ctx.tenantId.toString(), op);
      }
    } else {
      query.where({ tenantId: ctx.tenantId });
    }
  }

  /**
   * Mongoose v9 ships strict TypeScript overloads that reject string literals
   * from variables as valid pre-hook event names. Using (schema as any).pre()
   * is the recommended workaround for programmatic hook registration.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pre = (schema as any).pre.bind(schema) as (
    event: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fn: (...args: any[]) => any,
  ) => void;

  // ── READ hooks ─────────────────────────────────────────────────────────────

  for (const op of ['find', 'findOne', 'countDocuments', 'exists', 'distinct'] as const) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pre(op, function (this: any) {
      if (this._bypassTenantPlugin) return;
      if (!shouldApply(this)) return;
      injectOrValidateTenant(this, requireCtx(op), op);
    });
  }

  // ── findOneAnd* hooks ──────────────────────────────────────────────────────

  for (const op of ['findOneAndUpdate', 'findOneAndReplace', 'findOneAndDelete'] as const) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pre(op, function (this: any) {
      if (this._bypassTenantPlugin) return;
      if (!shouldApply(this)) return;
      injectOrValidateTenant(this, requireWriteCtx(op), op);
    });
  }

  // ── updateOne / updateMany ─────────────────────────────────────────────────

  for (const op of ['updateOne', 'updateMany'] as const) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pre(op, function (this: any) {
      if (this._bypassTenantPlugin) return;
      if (!shouldApply(this)) return;
      const ctx = requireWriteCtx(op);
      this.where({ tenantId: ctx.tenantId });
    });
  }

  // ── deleteOne / deleteMany (with RBAC gate) ────────────────────────────────

  for (const op of ['deleteOne', 'deleteMany'] as const) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pre(op, function (this: any) {
      if (this._bypassTenantPlugin) return;
      if (!shouldApply(this)) return;
      const ctx = requireWriteCtx(op);
      if (!DELETE_ALLOWED_ROLES.has(ctx.userRole)) {
        throw new DeletePermissionDeniedError(ctx.userRole);
      }
      this.where({ tenantId: ctx.tenantId });
    });
  }

  // ── save (document middleware) ─────────────────────────────────────────────
  // Mongoose v9: save hooks use throw-to-abort, return-to-proceed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pre('save', function (this: any) {
    if (!shouldApply(this)) return;
    const ctx = TenantContext.getStore();
    if (!ctx) throw new TenantContextMissingError('save');
    if (ZT_WRITES_BLOCKED.has(ctx.deviceTrust)) {
      throw new ZeroTrustViolationError(ctx.deviceTrust, 'save');
    }

    if (this.isNew) {
      const existing = this.get('tenantId') as mongoose.Types.ObjectId | undefined;
      if (!existing) {
        this.set('tenantId', ctx.tenantId);
      } else if (!existing.equals(ctx.tenantId)) {
        throw new TenantIsolationViolationError(
          existing.toString(), ctx.tenantId.toString(), 'save',
        );
      }
    }
  });

  // ── insertMany (Mongoose v9: throw-to-abort) ───────────────────────────────

  pre('insertMany', function (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this: any,
    docs: Array<Record<string, unknown>>,
  ) {
    if (this._bypassTenantPlugin) return;
    if (!shouldApply(this)) return;
    const ctx = TenantContext.getStore();
    if (!ctx) throw new TenantContextMissingError('insertMany');
    if (ZT_WRITES_BLOCKED.has(ctx.deviceTrust)) {
      throw new ZeroTrustViolationError(ctx.deviceTrust, 'insertMany');
    }

    for (const doc of docs) {
      if (!doc['tenantId']) {
        doc['tenantId'] = ctx.tenantId;
      } else {
        let docTid: string;
        try {
          docTid = new mongoose.Types.ObjectId(doc['tenantId'] as string).toString();
        } catch {
          throw new TenantIsolationViolationError(
            String(doc['tenantId']), ctx.tenantId.toString(), 'insertMany',
          );
        }
        if (docTid !== ctx.tenantId.toString()) {
          throw new TenantIsolationViolationError(
            docTid, ctx.tenantId.toString(), 'insertMany',
          );
        }
      }
    }
  });

  // ── aggregate (Mongoose v9: NO next() callback, throw-to-abort) ────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pre('aggregate', function (this: any) {
    if (this._bypassTenantPlugin) return;
    if (!shouldApply(this)) return;
    const ctx = TenantContext.getStore();
    if (!ctx) throw new TenantContextMissingError('aggregate');

    const pipeline = this.pipeline() as Array<Record<string, unknown>>;
    const first    = pipeline[0];

    // No $match stage at all → prepend one
    if (!first || !('$match' in first)) {
      pipeline.unshift({ $match: { tenantId: ctx.tenantId } });
      return;
    }

    const matchStage = first['$match'] as Record<string, unknown>;

    // $match present but no tenantId → inject
    if (!matchStage['tenantId']) {
      matchStage['tenantId'] = ctx.tenantId;
      return;
    }

    // $match has tenantId → validate against session
    let pipelineTid: string;
    try {
      pipelineTid = new mongoose.Types.ObjectId(matchStage['tenantId'] as string).toString();
    } catch {
      throw new TenantIsolationViolationError(
        String(matchStage['tenantId']), ctx.tenantId.toString(), 'aggregate',
      );
    }
    if (pipelineTid !== ctx.tenantId.toString()) {
      throw new TenantIsolationViolationError(
        pipelineTid, ctx.tenantId.toString(), 'aggregate',
      );
    }
  });
}

/**
 * Registers tenantIsolationPlugin as a Mongoose GLOBAL plugin.
 *
 * ⚠  CRITICAL: Call this as the FIRST statement in instrumentation.ts,
 *    before any model() call.  Safe to call multiple times (Mongoose ≥ 7
 *    deduplicates global plugins by reference).
 *
 * @example
 *   // src/instrumentation.ts
 *   import { registerGlobalTenantPlugin } from '@/infrastructure/multiTenantCore';
 *   registerGlobalTenantPlugin();
 */
export function registerGlobalTenantPlugin(): void {
  mongoose.plugin(tenantIsolationPlugin);
  if (process.env['NODE_ENV'] !== 'test') {
    console.info('[TenantPlugin] ✓ Global tenant isolation plugin registered.');
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// § 6  KMS PROVIDER ABSTRACTION LAYER
// ═════════════════════════════════════════════════════════════════════════════

/** Contract all KMS provider implementations must satisfy. */
export interface KMSProvider {
  /** Encrypts (wraps) a 32-byte plaintext DEK → returns the ciphertext blob. */
  wrapDEK(plaintextDEK: Buffer, masterKeyId: string): Promise<Buffer>;
  /** Decrypts (unwraps) the ciphertext blob → returns the 32-byte plaintext DEK. */
  unwrapDEK(wrappedDEK: Buffer, masterKeyId: string): Promise<Buffer>;
}

/**
 * LocalKMSProvider — development / CI use only.
 *
 * Master key is read from LOCAL_MASTER_KEY_B64 (must be 32 bytes base64).
 * Generate one with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */
class LocalKMSProvider implements KMSProvider {
  private get masterKey(): Buffer {
    const b64 = process.env['LOCAL_MASTER_KEY_B64'];
    if (!b64) {
      // Deterministic but insecure dev key (clearly labelled)
      return createHmac('sha256', 'hrms-dev-master-key-DO-NOT-USE-IN-PROD')
        .update('local-dev-master-key-v1')
        .digest();
    }
    const key = Buffer.from(b64, 'base64');
    if (key.byteLength !== 32) {
      throw new Error('LOCAL_MASTER_KEY_B64 must decode to exactly 32 bytes');
    }
    return key;
  }

  async wrapDEK(plaintextDEK: Buffer): Promise<Buffer> {
    const iv     = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.masterKey, iv);
    const body   = Buffer.concat([cipher.update(plaintextDEK), cipher.final()]);
    const tag    = cipher.getAuthTag();
    // Layout: 0x01 | iv(12) | tag(16) | ciphertext(32)
    return Buffer.concat([Buffer.from([0x01]), iv, tag, body]);
  }

  async unwrapDEK(wrappedDEK: Buffer): Promise<Buffer> {
    if (wrappedDEK[0] !== 0x01) {
      throw new Error('[LocalKMS] Unknown DEK wrapper version: 0x' + wrappedDEK[0]!.toString(16));
    }
    const iv         = wrappedDEK.subarray(1,  13);
    const tag        = wrappedDEK.subarray(13, 29);
    const ciphertext = wrappedDEK.subarray(29);
    const decipher   = createDecipheriv('aes-256-gcm', this.masterKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }
}

function buildKMSProvider(): KMSProvider {
  // Phase 2: dispatch on process.env.KMS_PROVIDER (aws_kms / gcp_kms / azure_kv).
  return new LocalKMSProvider();
}

const _kmsProvider = buildKMSProvider();

// ═════════════════════════════════════════════════════════════════════════════
// § 7  DEK CACHE — LRU, 100 slots, 10-min TTL, zero-fill dispose hook
// ═════════════════════════════════════════════════════════════════════════════

export interface DEKEntry {
  key:            Buffer;     // 32-byte AES-256 key (plaintext, in-process only)
  masterKeyId:    string;
  wrappedDEK:     Buffer;     // persisted wrapped form for re-generation
  generatedAt:    Date;
  rotationCycle:  number;
}

/**
 * 100-slot LRU cache with 10-minute TTL.
 * dispose hook zeros key material before eviction to prevent heap leaks.
 *
 * Stats (hits / misses / size) are exported via getDEKCacheStats() for the
 * Admin Control Room's System Health Cockpit.
 */
const _dekCache = new LRUCache<string, DEKEntry>({
  max:        100,
  ttl:        10 * 60 * 1000,        // 10 minutes
  allowStale: false,
  // NOTE: do NOT zero entry.key on dispose. getTenantDEK() returns the cached
  // DEKEntry by reference, so a concurrent request (or rotateTenantDEK's
  // re-encryption worker) may still hold and use the same Buffer when eviction
  // fires. Zeroing here corrupts in-flight crypto (GCM auth-tag failures) and
  // hands an all-zero "old key" to the rotation pipeline. The key is GC'd
  // normally; if zeroing is required, hand callers a copy instead.
});

// Hit/miss counters — for ops dashboards
const _dekCacheStats = { hits: 0, misses: 0, provisions: 0 };

/** Returns LRU cache metrics for the System Health Cockpit. */
export function getDEKCacheStats() {
  return {
    size:       _dekCache.size,
    maxSize:    _dekCache.max,
    ttlMs:      _dekCache.ttl,
    hits:       _dekCacheStats.hits,
    misses:     _dekCacheStats.misses,
    provisions: _dekCacheStats.provisions,
    hitRate:    (_dekCacheStats.hits + _dekCacheStats.misses) > 0
                  ? _dekCacheStats.hits / (_dekCacheStats.hits + _dekCacheStats.misses)
                  : 0,
  };
}

/** Tenant-keyed mutex map to prevent concurrent DEK provisioning stampedes. */
const _dekInitLocks = new Map<string, Promise<DEKEntry>>();

/** Minimal duck-type for the Tenant document; avoids circular import. */
interface TenantDocument {
  _id:       Types.ObjectId;
  kmsConfig: {
    provider:        string;
    masterKeyId:     string;
    keyAltName:      string;
    /** Schema persists this as 'wrappedDek' (lowercase d) — both forms accepted. */
    wrappedDek?:     Buffer;
    wrappedDEK?:     Buffer;
    rotationCycle?:  number;
  };
}

/**
 * Retrieves or provisions the Data Encryption Key for a tenant.
 * All CSFLE operations must obtain their key through this function.
 *
 * Concurrency: tenant-keyed mutex prevents the thundering-herd problem.
 *
 * @param tenantId   Tenant ObjectId string (from session)
 * @returns          DEKEntry { key, wrappedDEK, masterKeyId, ... }
 */
export async function getTenantDEK(tenantId: string): Promise<DEKEntry> {
  const cached = _dekCache.get(tenantId);
  if (cached) { _dekCacheStats.hits++; return cached; }
  _dekCacheStats.misses++;

  // Deduplicate concurrent provisioning for the same tenant
  const existing = _dekInitLocks.get(tenantId);
  if (existing) return existing;

  const lock = _provisionDEK(tenantId);
  _dekInitLocks.set(tenantId, lock);
  try {
    const entry = await lock;
    _dekCache.set(tenantId, entry);
    return entry;
  } catch (err) {
    throw new DEKProvisioningError(tenantId, err);
  } finally {
    _dekInitLocks.delete(tenantId);
  }
}

async function _provisionDEK(tenantId: string): Promise<DEKEntry> {
  _dekCacheStats.provisions++;

  // Dynamic import avoids circular dep — Tenant model lives in workspace.models.ts
  const { Tenant } = await import('@/models/workspace.models');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenant = await (Tenant as Model<TenantDocument>).findById(tenantId).lean() as TenantDocument | null;
  if (!tenant) throw new Error(`Tenant ${tenantId} not found`);

  // Accept both casing variants — schema persists 'wrappedDek', legacy used 'wrappedDEK'
  const existingWrapped: Buffer | undefined =
    _normalizeBuffer(tenant.kmsConfig.wrappedDek) ??
    _normalizeBuffer(tenant.kmsConfig.wrappedDEK);
  const { masterKeyId, rotationCycle = 0 } = tenant.kmsConfig;

  if (existingWrapped && existingWrapped.byteLength > 0) {
    // Unwrap existing DEK
    const key = await _kmsProvider.unwrapDEK(existingWrapped, masterKeyId);
    return { key, masterKeyId, wrappedDEK: existingWrapped, generatedAt: new Date(), rotationCycle };
  }

  // First-time bootstrap — generate, wrap, and persist
  const plaintextDEK = randomBytes(32);
  const wrappedDEK   = await _kmsProvider.wrapDEK(plaintextDEK, masterKeyId);

  // Persist the wrapped DEK using the canonical schema field name
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateQuery = (Tenant as Model<TenantDocument>).updateOne(
    { _id: tenant._id },
    { $set: { 'kmsConfig.wrappedDek': wrappedDEK, 'kmsConfig.rotationCycle': rotationCycle } },
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (updateQuery as any)._bypassTenantPlugin = true;
  await updateQuery;

  return { key: plaintextDEK, masterKeyId, wrappedDEK, generatedAt: new Date(), rotationCycle };
}

/**
 * Rotate a tenant's DEK.  Generates a fresh DEK, wraps it, and persists.
 * The OLD DEK key Buffer is returned so callers can re-encrypt all existing
 * fields during the rotation pipeline (handled by workers/dekRotator.ts).
 *
 * @returns { oldEntry: DEKEntry; newEntry: DEKEntry }
 */
export async function rotateTenantDEK(tenantId: string): Promise<{
  oldEntry: DEKEntry;
  newEntry: DEKEntry;
}> {
  const oldEntry  = await getTenantDEK(tenantId);
  const { Tenant } = await import('@/models/workspace.models');

  const newPlaintext = randomBytes(32);
  const newWrapped   = await _kmsProvider.wrapDEK(newPlaintext, oldEntry.masterKeyId);
  const newCycle     = oldEntry.rotationCycle + 1;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upd = (Tenant as Model<TenantDocument>).updateOne(
    { _id: new mongoose.Types.ObjectId(tenantId) },
    { $set: { 'kmsConfig.wrappedDek': newWrapped, 'kmsConfig.rotationCycle': newCycle } },
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (upd as any)._bypassTenantPlugin = true;
  await upd;

  // Invalidate the cache so subsequent calls fetch the new DEK
  _dekCache.delete(tenantId);

  const newEntry: DEKEntry = {
    key:           newPlaintext,
    masterKeyId:   oldEntry.masterKeyId,
    wrappedDEK:    newWrapped,
    generatedAt:   new Date(),
    rotationCycle: newCycle,
  };

  return { oldEntry, newEntry };
}

/** Explicitly invalidate a tenant's cached DEK (e.g. after admin action). */
export function invalidateTenantDEK(tenantId: string): void {
  _dekCache.delete(tenantId);
}

// ═════════════════════════════════════════════════════════════════════════════
// § 8  AES-256-GCM FIELD-LEVEL ENCRYPTION (CSFLE)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Wire format: VERSION_BYTE | iv(12) | authTag(16) | ciphertext(N)
 *
 * 0x01 — AES-256-GCM, IV=12B, TAG=16B (current)
 * 0x02 — reserved for future XChaCha20-Poly1305 migration
 */
const VERSION_BYTE_V1 = 0x01;
const SUPPORTED_VERSIONS = new Set([VERSION_BYTE_V1]);

/**
 * Normalises a possibly-BSON-Binary input to a Node.js Buffer.
 * Mongoose .lean() returns BSON Binary objects, not Buffers.
 */
function _normalizeBuffer(
  input: Buffer | Uint8Array | { buffer?: Buffer; value?: () => Buffer } | undefined | null,
): Buffer | undefined {
  if (input === undefined || input === null) return undefined;
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof Uint8Array) return Buffer.from(input);
  // BSON Binary v0/v4
  if (typeof (input as { buffer?: unknown }).buffer !== 'undefined' && Buffer.isBuffer((input as { buffer: Buffer }).buffer)) {
    return Buffer.from((input as { buffer: Buffer }).buffer);
  }
  // BSON Binary with value() method
  if (typeof (input as { value?: () => Buffer }).value === 'function') {
    try { return Buffer.from((input as { value: () => Buffer }).value()); }
    catch { return undefined; }
  }
  return undefined;
}

/**
 * Encrypts a UTF-8 string field using AES-256-GCM with the tenant's DEK.
 *
 * @param tenantId  Tenant ObjectId string
 * @param plaintext UTF-8 string to encrypt
 * @returns         Encrypted Buffer in wire format
 */
export async function encryptField(tenantId: string, plaintext: string): Promise<Buffer> {
  const { key } = await getTenantDEK(tenantId);
  const iv      = randomBytes(12);
  const cipher  = createCipheriv('aes-256-gcm', key, iv);
  const body    = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag     = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([VERSION_BYTE_V1]), iv, tag, body]);
}

/**
 * Decrypts a Buffer field encrypted by encryptField().
 *
 * Accepts BSON Binary inputs from Mongoose .lean() and normalises them
 * transparently — no need for callers to convert.
 *
 * @throws CryptographicVersionError if the wire-format version is not supported
 */
export async function decryptField(
  tenantId: string,
  encrypted: Buffer | Uint8Array | { buffer?: Buffer; value?: () => Buffer },
): Promise<string> {
  const buf = _normalizeBuffer(encrypted);
  if (!buf) {
    throw new Error('[CSFLE] Invalid encrypted field: unrecognised type ' + typeof encrypted);
  }
  if (buf.byteLength < 29) {
    throw new Error('[CSFLE] Invalid encrypted field: too short (' + buf.byteLength + ' bytes)');
  }

  const version = buf[0]!;
  if (!SUPPORTED_VERSIONS.has(version)) {
    throw new CryptographicVersionError(version);
  }

  const { key } = await getTenantDEK(tenantId);
  const iv         = buf.subarray(1,  13);
  const tag        = buf.subarray(13, 29);
  const ciphertext = buf.subarray(29);

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/**
 * Encrypts a numeric value as its decimal string representation.
 * Preserves exact precision (no floating-point coercion through JSON).
 */
export async function encryptNumber(tenantId: string, value: number): Promise<Buffer> {
  return encryptField(tenantId, String(value));
}

/** Decrypts a Buffer containing an encrypted number → float. */
export async function decryptNumber(
  tenantId: string,
  encrypted: Buffer | Uint8Array | { buffer?: Buffer; value?: () => Buffer },
): Promise<number> {
  return parseFloat(await decryptField(tenantId, encrypted));
}

/**
 * Derives a deterministic HMAC-SHA256 lookup hash for a plaintext value.
 *
 * Use case: build indexed lookup fields (emailHash, nationalIdHash) without
 * storing plaintext.  Same input → same hash, enabling exact-match queries
 * on encrypted columns.
 *
 * @param tenantId  Tenant ObjectId — provides per-tenant key-derivation isolation
 * @param value     Plaintext to hash
 * @returns         64-char lowercase hex string
 */
export async function hashFieldForLookup(tenantId: string, value: string): Promise<string> {
  const { key } = await getTenantDEK(tenantId);
  const lookupKey = createHmac('sha256', key).update('lookup-hash-v1').digest();
  return createHmac('sha256', lookupKey).update(value.toLowerCase().trim()).digest('hex');
}

/**
 * Legacy 3-arg form: computeLookupHash(tenantId, fieldType, value).
 * The fieldType is mixed into the HMAC-key derivation so different field
 * types (e.g. 'email' vs 'nationalId') produce distinct hashes even for
 * the same plaintext.
 *
 * @deprecated Prefer hashFieldForLookup(tenantId, value) for new code.
 */
export async function computeLookupHash(
  tenantId:  string,
  fieldType: string,
  value:     string,
): Promise<string> {
  const { key } = await getTenantDEK(tenantId);
  const lookupKey = createHmac('sha256', key)
    .update(`lookup-hash-v1:${fieldType}`)
    .digest();
  return createHmac('sha256', lookupKey).update(value.toLowerCase().trim()).digest('hex');
}

/**
 * Derives the audit-chain HMAC key from the tenant's DEK.
 *
 * The audit trail uses HMAC-SHA256 to sign each entry's digitalSignature:
 *   sig = HMAC(auditKey, currentHash + previousHash + tenantId)
 *
 * Returning a derived key (instead of using the DEK directly) provides
 * cryptographic domain separation between encryption and signing.
 */
export async function deriveAuditChainKey(tenantId: string): Promise<string> {
  const { key } = await getTenantDEK(tenantId);
  return createHmac('sha256', key).update('audit-chain-key-v1').digest('hex');
}

/**
 * Constant-time string comparison.  Use for comparing any user-controlled
 * secret against an expected value (tokens, signatures, hashes).
 */
export function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

// ═════════════════════════════════════════════════════════════════════════════
// § 9  EMPLOYEE BULK ENCRYPTION HELPER
// ═════════════════════════════════════════════════════════════════════════════

export interface EmployeeEncryptedFields {
  fullNameEnc?:      Buffer;
  emailEnc?:         Buffer;
  personalEmailEnc?: Buffer;
  phoneEnc?:         Buffer;
  nationalIdEnc?:    Buffer;
  dateOfBirthEnc?:   Buffer;
  addressEnc?:       Buffer;
  passportEnc?:      Buffer;
  baseSalaryEnc?:    Buffer;
  variableCompEnc?:  Buffer;
  bankAccountEnc?:   Buffer;
  bankRoutingEnc?:   Buffer;
  bankSwiftEnc?:     Buffer;
  equityValueEnc?:   Buffer;
  emailHash?:        string;
  nationalIdHash?:   string;
}

export interface EmployeePlaintextInput {
  fullName?:      string;
  email?:         string;
  personalEmail?: string;
  phone?:         string;
  nationalId?:    string;
  dateOfBirth?:   string;
  address?:       string;
  passport?:      string;
  baseSalary?:    number;
  variableComp?:  number;
  bankAccount?:   string;
  bankRouting?:   string;
  bankSwift?:     string;
  equityValue?:   number;
}

/**
 * Bulk-encrypts all PII + financial fields for an Employee document.
 * Returns a partial object ready to spread into the Mongoose doc.
 *
 * Internally parallelises each Promise.all batch so a 14-field encrypt
 * completes in roughly 14× single-field latency / 14 = O(1) cost.
 */
export async function encryptEmployeeFields(
  tenantId: string,
  input:    EmployeePlaintextInput,
): Promise<EmployeeEncryptedFields> {
  const enc: EmployeeEncryptedFields = {};

  const maybeStr = async (v: string | undefined, k: keyof EmployeeEncryptedFields) => {
    if (v === undefined) return;
    (enc as Record<string, unknown>)[k] = await encryptField(tenantId, v);
  };
  const maybeNum = async (v: number | undefined, k: keyof EmployeeEncryptedFields) => {
    if (v === undefined) return;
    (enc as Record<string, unknown>)[k] = await encryptNumber(tenantId, v);
  };

  await Promise.all([
    maybeStr(input.fullName,      'fullNameEnc'),
    maybeStr(input.email,         'emailEnc'),
    maybeStr(input.personalEmail, 'personalEmailEnc'),
    maybeStr(input.phone,         'phoneEnc'),
    maybeStr(input.nationalId,    'nationalIdEnc'),
    maybeStr(input.dateOfBirth,   'dateOfBirthEnc'),
    maybeStr(input.address,       'addressEnc'),
    maybeStr(input.passport,      'passportEnc'),
    maybeNum(input.baseSalary,    'baseSalaryEnc'),
    maybeNum(input.variableComp,  'variableCompEnc'),
    maybeStr(input.bankAccount,   'bankAccountEnc'),
    maybeStr(input.bankRouting,   'bankRoutingEnc'),
    maybeStr(input.bankSwift,     'bankSwiftEnc'),
    maybeNum(input.equityValue,   'equityValueEnc'),
  ]);

  // Derive lookup hashes for indexed fields
  if (input.email)      enc.emailHash      = await hashFieldForLookup(tenantId, input.email);
  if (input.nationalId) enc.nationalIdHash = await hashFieldForLookup(tenantId, input.nationalId);

  return enc;
}

// ═════════════════════════════════════════════════════════════════════════════
// § 10  TENANT CONTEXT BOOTSTRAP HELPERS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Builds a TenantContextStore from session fields with validated ObjectIds.
 * Used inside withRoute() / runWithSession() to construct the ALS store.
 *
 * @example
 *   const store = buildTenantStore({
 *     tenantId:   session.tenantId,
 *     userId:     session.userId,
 *     role:       session.role,
 *     employeeId: session.employeeId,
 *     requestId:  req.headers.get('x-request-id') ?? undefined,
 *   });
 *   return TenantContext.run(store, () => handler(req));
 */
export function buildTenantStore(session: {
  tenantId:     string;
  userId:       string;
  role:         string;
  employeeId?:  string | null | undefined;
  requestId?:   string;
  deviceTrust?: DeviceTrustLevel;
  traceId?:     string;
}): TenantContextStore {
  return {
    tenantId:    new mongoose.Types.ObjectId(session.tenantId),
    userId:      new mongoose.Types.ObjectId(session.userId),
    userRole:    session.role as UserRole,
    employeeId:  session.employeeId ? new mongoose.Types.ObjectId(session.employeeId) : null,
    deviceTrust: session.deviceTrust ?? 'trusted',
    requestId:   session.requestId  ?? `req_${randomUUID()}`,
    createdAt:   new Date(),
    traceId:     session.traceId,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// § 11  BACKWARD-COMPATIBLE ALIASES & TYPE EXPORTS
// ═════════════════════════════════════════════════════════════════════════════

/** @deprecated Use EmployeePlaintextInput */
export type PlainEmployeeFields = EmployeePlaintextInput;

/** @deprecated Use EmployeeEncryptedFields */
export type EncryptedEmployeeFields = EmployeeEncryptedFields;

// ═════════════════════════════════════════════════════════════════════════════
// § 12  PUBLIC OPS UTILITIES (for System Health Cockpit)
// ═════════════════════════════════════════════════════════════════════════════

/** Returns runtime telemetry for the Admin System Health Cockpit. */
export function getInfrastructureHealth() {
  return {
    dekCache: getDEKCacheStats(),
    plugin:   {
      // mongoose.plugins is runtime-only and not typed in the public d.ts —
      // cast through unknown for a safe introspection.
      registered:        ((mongoose as unknown as { plugins?: Array<[unknown, unknown]> }).plugins ?? [])
                          .some(([fn]) => fn === tenantIsolationPlugin),
      globalCollections: GLOBAL_COLLECTIONS.size,
      tenantScoped:      TENANT_SCOPED.size,
    },
    crypto: {
      supportedVersions: Array.from(SUPPORTED_VERSIONS),
      kmsProvider:       _kmsProvider.constructor.name,
    },
  };
}
