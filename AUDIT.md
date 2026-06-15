# HRMS Codebase Audit

_Date: 2026-05-29 · Scope: full working tree (untracked) · Method: 4 parallel layer auditors + direct source verification of all high-impact claims._

## Verdict

This is a substantial, ~10k-line multi-tenant HRMS with **real** AES-256-GCM field-level
encryption, a working Mongoose tenant-isolation plugin, a genuine RBAC layer, multi-country
tax math, and ~30 mostly-wired API routes feeding three role-morphing cockpits. It typechecks
clean. The defects are concentrated in **key lifecycle, a handful of auth gaps, and "AI/ML"
features that are heuristics wearing marketing labels** — not in fake cryptography.

> **Correction to first-pass findings:** an early auditor claimed "zero routes enforce roles."
> This is **false** — ~20 routes enforce roles via the second argument to `withRoute`/`runWithSession`
> (`}, ['super_admin', 'hr_admin', ...])`), and `runWithSession` genuinely returns 403 on mismatch
> (`src/lib/withRoute.ts:72`). The real gaps are specific routes, listed below.

Severity legend: 🔴 Critical/High · 🟠 Medium · 🟡 Quality/Theater · 🟢 Solid

---

## 🔴 Critical / High

| # | Finding | Location | Status |
|---|---------|----------|--------|
| 1 | `/api/seed` is fully public (no auth, allow-listed in proxy) — anyone can wipe & reseed the DB. | `src/app/api/seed/route.ts:4`, `src/proxy.ts:8` | **fixed** |
| 2 | `/api/v3/onboarding/verify-liveness` — authenticated but no authz; trusts client `employeeId`; can flip `pre_hire → active` for any employee. HMAC skipped if signature field omitted. | `verify-liveness/route.ts:10,22` | **fixed** |
| 3 | `/api/v3/security/endpoint-heartbeat` — no authz; trusts client `employeeId`; any user can set any employee's device trust to `revoked`. Hardcoded `'dev-device-secret'` fallback; HMAC skipped if omitted. | `endpoint-heartbeat/route.ts:10,19,20` | **fixed** |
| 4 | DEK key Buffers are zero-filled while still referenced. LRU `dispose` zeroes `entry.key` but keys are returned **by reference**; `rotateTenantDEK`'s `_dekCache.delete()` zeroes the `oldEntry.key` it hands to the re-encryption worker → worker gets an all-zero old key. Also intermittent GCM failures on TTL expiry under load. | `multiTenantCore.ts:699,836` | **fixed** |
| 5 | Zero-trust enforcement is dead. The ZT write-gate is real but `withRoute.ts:54` hardcodes `deviceTrust: 'trusted'`; nothing feeds real device trust into the ALS store. `revoked` devices write freely. | `withRoute.ts:54`, `multiTenantCore.ts:1120` (`buildTenantStore` is dead) | **documented** — needs design decision (per-request trust lookup vs session-embedded). The *exploitable* half (heartbeat authz) is fixed in #3. |

## 🟠 Medium

| # | Finding | Location | Status |
|---|---------|----------|--------|
| 6 | Tenant-isolation gap from a typo: `TENANT_SCOPED` lists `ws_notif_logs` but the collection is `ws_notification_logs`. Plugin silently skips unregistered collections → notification logs had **no tenant scoping**. | `multiTenantCore.ts:102` vs `workspace.models.ts:846` | **fixed** |
| 7 | Cross-tenant aggregate silently mis-scoped: `ws/tenants` sets `_bypassTenantPlugin` but the `aggregate`/`insertMany` hooks never checked the flag, so the super-admin headcount-by-tenant view was restricted to the admin's own tenant. | `multiTenantCore.ts:522,553`; `ws/tenants/route.ts:27` | **fixed** |
| 8 | Silent audit-trail gaps: routes emit `EMPLOYEE_CREATED`, `LEAVE_REQUESTED`, `PAYROLL_RUN_CREATED` — not in the schema enum — and `auditEvent` swallows the validation error, so these compliance events never persisted. | `workspace.models.ts:903`, `withRoute.ts:135` | **fixed** (enum extended) |
| 9 | Under-gated read routes (any authenticated role, incl. `employee`): `/api/analytics` GET, legacy `/api/employees` GET + `/api/employees/[id]` GET, `/api/departments` GET, `/api/leaves` GET. Tenant isolation still holds (cross-*role* leak within a tenant, not cross-tenant). | respective `route.ts` GET handlers | **documented** |
| 10 | Mass-assignment: legacy `/api/employees` POST/PUT and `/api/departments` POST spread raw request body into Mongoose with no allow-list. The hardened `ws/employees` path does it correctly. | `employees/route.ts:48`, `employees/[id]/route.ts:25` | **documented** |
| 11 | `save` document hook ignores a bypass flag (no active caller; latent). | `multiTenantCore.ts:495` | **documented** |

## 🟡 "AI / ML / Agentic" reality check (the brief's flagship features)

Honest in code comments, oversold in names:

- **Burnout & turnover** = deterministic weighted heuristics, no model. `turnover.confidence: 0.92`
  and `horizon90DayPct = composite × 0.85` are arbitrary constants with statistical-sounding names. — `turnoverPredictor.ts:303-318`
- **"Agentic payroll auditor"** = a solid 15-rule deterministic engine, zero LLM. Useful — but
  `checkNewHireFullMonth` has an inverted guard and can essentially never fire. — `payrollAgenticAuditor.ts:337`
- **Nexus "predictive projection" is fabricated math**: `ratePerDay = daysInWindow / 90` hardcodes
  90 days regardless of window type (breaks Japan's 365-day rule); `windowStart` is dead input; the
  documented SPT / India multi-year rules are labels only. — `nexusCalculator.ts:135`
- **AI-worker dashboard** mixes real `digital_worker` records with 3 hardcoded stub agents. — `ws/ai-workers/route.ts:13`
- **India tax engine** mislabeled "AY 2025-26" but uses FY2024-25 slabs; wrong ₹50k standard
  deduction (new regime should be ₹75k); stale ₹25k/₹7L rebate. (US/UK/SG tables are accurate.) — `lib/taxEngines/india.ts`

## 🟢 Genuinely solid (do not rewrite)

- AES-256-GCM encrypt/decrypt with per-call random IVs + auth tags, HMAC blind-index lookups,
  envelope key wrapping. Correct. — `multiTenantCore.ts`
- Tenant-isolation plugin validates **and rejects** client-supplied `tenantId` mismatches; no
  cross-tenant route found.
- RBAC on the `ws/*`, payroll, leaves/employees **write** paths.
- US (TY2024), UK (24-25), Singapore (YA2024) tax tables accurate.
- `proxy.ts` / `instrumentation.ts` correct for Next 16; all design-system tokens present in `globals.css`.

## Cleanup (dead code / cosmetic)

- Redundant model files: `Employee.ts`, `employee.advanced.model.ts`, legacy `Leave/Department/Payroll/AuditLog`
  (routes use `workspace.models.ts`). Legacy ones carry non-tenant-scoped unique indexes — divergence risk.
- Dead components: `components/layout/Sidebar.tsx`, `components/layout/Header.tsx`; unused `lib/api-client.ts`
  (so its 401-redirect/retry never runs); unwired `lib/mustache.ts`.
- Sidebar "Audit" links point to `/audit`, which has no page (404s). — `shell/Sidebar.tsx:48,65`
- `var(--color-semantics-orange-1)` referenced 3× but undefined in `globals.css`. — `shell/Sidebar.tsx:205`, `admin/dek-rotation/page.tsx:106,169`
- Mock data masquerading as config: `AdminControlRoom` tenant config + integrations; Settings `InviteUserForm` (fake `setTimeout`).

---

## Fixes applied in this pass

1. **`/api/seed`** — gated: allowed freely in non-production; in production requires an `x-seed-secret`
   header matching `process.env.SEED_SECRET` (refuses if unset).
2. **`verify-liveness`** — caller must be self (`session.employeeId === employeeId`) or an HR role;
   HMAC signature is now **mandatory** whenever a provider secret is configured.
3. **`endpoint-heartbeat`** — same self-or-HR authz; signature mandatory when `DEVICE_HMAC_SECRET`
   is set; the insecure `'dev-device-secret'` fallback is now refused in production.
4. **DEK lifecycle** — removed the `dispose`/rotate key-zeroing that corrupted in-flight and
   rotation key Buffers.
5. **Tenant plugin** — fixed the `ws_notif_logs` → `ws_notification_logs` registry typo; `aggregate`
   and `insertMany` hooks now honor `_bypassTenantPlugin`.
6. **Audit enum** — added `EMPLOYEE_CREATED`, `LEAVE_REQUESTED`, `PAYROLL_RUN_CREATED`.

## Recommended follow-ups (not done this pass)

- Decide ZT enforcement model and wire real `deviceTrust` into the request store (#5).
- Add role gates to the under-gated read routes and allow-lists to the legacy mass-assignment
  routes (#9, #10) — or delete the legacy routes in favor of the `ws/*` equivalents.
- Correct the India FY2025-26 tax constants and the nexus projection math; rename or implement
  the "ML/agentic" features honestly.
- Delete the dead model/component files and fix the `/audit` 404 + undefined CSS token.
