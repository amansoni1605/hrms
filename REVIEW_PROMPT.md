# HRMS Full Codebase Review & Gap Fix Prompt

Use this prompt to systematically audit and fix every module in this Next.js 16 + MongoDB multi-tenant HRMS.

---

## Context

- Stack: Next.js 16.2.6 App Router, MongoDB/Mongoose, ALS-based multi-tenant isolation (`TenantContext`), `withRoute` / `runWithSession` for auth, bcrypt passwords, AES-256-GCM PII encryption on `*Enc` fields.
- Role hierarchy: `super_admin` > `hr_admin` > `hr_manager` > `payroll_officer` > `manager` > `employee`
- Central role list lives in `src/lib/withRoute.ts` (`UserRole` type).
- Models: `src/models/workspace.models.ts` — all `ws_*` collections.
- Every API must: check tenantId isolation, validate input, return `{ data }` or `{ error }` shape, log audit events for mutations.

---

## Priority 1 — Security & Broken Flows (Fix First)

### 1.1 Expenses — Missing PATCH endpoint
**File:** `src/app/api/expenses/`  
**Bug:** No `PATCH /api/expenses/[id]` route exists. The UI calls it for approve/reject. Every expense action silently fails.  
**Fix:**
- Create `src/app/api/expenses/[id]/route.ts`
- `PATCH` accepts `{ action: 'approve' | 'reject' | 'cancel', rejectionReason?: string }`
- Role guard: approve/reject → `['super_admin','hr_admin','hr_manager']`; cancel → own expense only
- On approve: set `status = 'approved'`, `approvedById`, `approvedAt`
- On reject: set `status = 'rejected'`, `rejectionReason`, `rejectedAt`
- Audit log every state change

### 1.2 Leaves GET — No role-based filtering
**File:** `src/app/api/leaves/route.ts` line 15  
**Bug:** GET returns all leaves to all roles. Employees should only see their own. HR sees all.  
**Fix:**
```ts
const isHR = ['super_admin','hr_admin','hr_manager'].includes(session.role);
if (!isHR) query['employeeId'] = session.employeeId;  // employee sees own only
```

### 1.3 Departments GET — No tenantId filter
**File:** `src/app/api/departments/route.ts` line 6  
**Bug:** Multi-tenant leak — query has no `tenantId` filter.  
**Fix:** Confirm `TenantContext` ALS plugin adds it automatically via `pre('find')` hook. If not, add explicit `tenantId: ctx.tenantId` to query.

### 1.4 Burnout — No role guard
**File:** `src/app/api/ws/burnout/` (or equivalent)  
**Bug:** Burnout API accessible to all authenticated users including employees.  
**Fix:** Add `['super_admin','hr_admin','hr_manager']` role guard. Burnout/flight-risk data is sensitive.

### 1.5 Analytics — No role guard
**File:** `src/app/api/analytics/route.ts` line 5  
**Bug:** `withFeature('analytics')` but no role restriction. Aggregate headcount, salary, risk data exposed to employees.  
**Fix:** Add `['super_admin','hr_admin','hr_manager','payroll_officer']` to `withRoute`.

---

## Priority 2 — Broken UI ↔ API Connections

### 2.1 Settings — Invite user sends no email
**File:** `src/app/(workspace)/settings/page.tsx` lines 573–611  
**Bug:** Invite user flow shows success toast after a timeout but never calls an API. Invited users never receive an email.  
**Fix:**
- Wire to `POST /api/auth/invite` (create if missing): generate a time-limited token, store hash in DB, send email via existing `sendWelcomeEmail` helper
- On success: show the invite link / temp password in the toast

### 2.2 Settings — MFA enrollment is a stub
**File:** `src/app/(workspace)/settings/page.tsx` lines 334–339  
**Bug:** MFA enable button shows a toast but does nothing. No TOTP setup flow.  
**Fix (minimal):** Either implement TOTP (`otplib`) or mark the button clearly as "Coming soon" and disable it. Do not leave a broken flow silently.

### 2.3 Separation — Employee lookup requires MongoDB `_id`
**File:** `src/app/(workspace)/separation/page.tsx` line 46  
**Bug:** HR must paste a raw MongoDB ObjectId to start separation. Unusable in production.  
**Fix:** Replace the raw input with an employee search — fetch `GET /api/ws/employees?search=` and show a dropdown. Use the selected employee's `_id` internally.

### 2.4 Payroll — POST has no role guard
**File:** `src/app/api/payroll/route.ts`  
**Bug:** Any authenticated user can trigger a payroll run.  
**Fix:** Add `['super_admin','hr_admin','payroll_officer']` to the POST handler.

### 2.5 Onboarding — Start Onboarding requires MongoDB `_id`
**File:** `src/app/(workspace)/onboarding/page.tsx` line 103  
**Bug:** Same UX problem as separation — raw ObjectId input.  
**Fix:** Same pattern — employee search dropdown using `GET /api/ws/employees?search=`.

---

## Priority 3 — Data Integrity & State Machine Gaps

### 3.1 Leave date range filter is wrong
**File:** `src/app/api/leaves/route.ts` lines 29–34  
**Bug:** Filter only checks `startDate >= from`. Leaves that start before `from` but end within the range are excluded.  
**Fix:**
```ts
// A leave overlaps [from, to] if: startDate <= to AND endDate >= from
if (from) query['endDate'] = { ...query['endDate'], $gte: new Date(from) };
if (to)   query['startDate'] = { ...query['startDate'], $lte: new Date(to) };
```

### 3.2 Performance — No duplicate cycle guard
**File:** `src/app/api/performance/route.ts` lines 59–61  
**Bug:** An employee can have multiple reviews created for the same cycle.  
**Fix:** Add unique index `{ tenantId, employeeId, cycleLabel }` to `WPerfReviewSchema` (already defined — confirm it's enforced). In the POST handler, wrap create in try/catch for duplicate key error and return `409`.

### 3.3 Payroll — Silent audit queue failure
**File:** `src/app/api/payroll/route.ts` lines 127–131  
**Bug:** Audit queue error is silently caught. A failed audit means the run stays in `draft` state with no recovery path.  
**Fix:** If audit fails, still complete the run (set status → `completed`) but log the audit failure separately. Don't block payroll on audit.

### 3.4 Attendance thresholds — Hardcoded, not configurable
**File:** `src/app/api/attendance/route.ts` lines 72–75  
**Current:** `absent < 2h`, `half_day < 4h`, `present >= 4h` — hardcoded.  
**Fix:** Read from `WorkspaceHRSettings` (`attendance.halfDayThresholdHours`, `attendance.absentThresholdHours`). Fall back to current values if not configured.

---

## Priority 4 — Role Consistency (One-Pass Fix)

**Problem:** `HR_ROLES` is defined differently in at least 5 files. Some include `payroll_officer`, some don't. Some include `compliance_officer`.

**Files to fix:**
- `src/app/(workspace)/dashboard/page.tsx` line 22
- `src/app/(workspace)/analytics/page.tsx`  
- `src/app/(workspace)/settings/page.tsx` line 159
- `src/app/api/ws/employees/[id]/route.ts` line 40
- Any file with a local `HR_ROLES` or `ADMIN_ROLES` constant

**Fix:** Delete all local `HR_ROLES` constants. Export a single source of truth from `src/lib/roles.ts`:
```ts
export const HR_ROLES   = ['super_admin','hr_admin','hr_manager'] as const;
export const ADMIN_ROLES = ['super_admin','hr_admin'] as const;
export const PAYROLL_ROLES = ['super_admin','hr_admin','payroll_officer'] as const;
export const isHR = (role: string) => HR_ROLES.includes(role as typeof HR_ROLES[number]);
```
Import and use everywhere.

---

## Priority 5 — UX / Empty States

### 5.1 Dashboard — No loading skeleton
**File:** `src/app/(workspace)/dashboard/page.tsx`  
**Fix:** Add a skeleton loader (use existing `.hrms-kpi-card` with animated shimmer) while session resolves and RoleGate mounts.

### 5.2 Analytics — Null check on department metrics
**File:** `src/app/(workspace)/analytics/page.tsx` lines 41–46  
**Bug:** Scatter chart crashes if `avgBurnoutRisk` or `flightRisk` is null/undefined.  
**Fix:** `d.avgBurnoutRisk ?? 0` and `d.flightRisk ?? 0` in the data mapping.

### 5.3 Analytics — Hardcoded payroll estimate
**File:** `src/app/api/analytics/route.ts` line 94  
**Bug:** `latestPayrollTotal = employeeCount * 80000` — not real data.  
**Fix:** Query the latest completed payroll run's `totalGross` from `ws_payroll_runs`. Fall back to estimate only if no run exists, and label it clearly as estimated.

### 5.4 Burnout — No drill-down from heatmap
**File:** `src/app/(workspace)/burnout/page.tsx` lines 141–183  
**Fix:** Make each department card clickable — filter the employee risk table below to that department. No new API needed; filter client-side.

### 5.5 Expenses — Local total doesn't match API status
**File:** `src/app/(workspace)/expenses/page.tsx` line 67  
**Bug:** `totalPending` is computed locally by filtering `status === 'pending'` but the API may return `'submitted'` as the pending status.  
**Fix:** Align status terminology: use `'submitted'` consistently, or update the local filter to match the DB enum value.

---

## Priority 6 — Missing Pagination

All of these pages load unlimited records. Add `?page=&limit=` support:

| Module | File | Current limit |
|---|---|---|
| Leaves | `src/app/api/leaves/route.ts` | None |
| Performance reviews | `src/app/api/performance/route.ts` | hardcoded 60 |
| Payroll runs | `src/app/api/payroll/route.ts` | None |
| Employees list | `src/app/api/ws/employees/route.ts` | Check |

**Pattern for each:**
```ts
const page  = Math.max(1, Number(searchParams.get('page') ?? 1));
const limit = Math.min(100, Number(searchParams.get('limit') ?? 25));
const data  = await Model.find(query).sort(...).skip((page-1)*limit).limit(limit).lean();
const total = await Model.countDocuments(query);
return NextResponse.json({ data, meta: { page, limit, total, pages: Math.ceil(total/limit) } });
```

---

## Priority 7 — Hardcoded Business Rules → HR Settings

All of these should be readable from `WorkspaceHRSettings` with these fallbacks:

| Hardcoded value | Location | Setting key |
|---|---|---|
| Gratuity: 5yr threshold, 15 days, 26 work days | `src/app/api/separation/` | `gratuity.*` |
| Risk buckets: 0.7/0.4 | `src/app/(workspace)/analytics/` | `burnout.highRiskThreshold` |
| Leave types enum | `src/app/api/leaves/route.ts` | `leave.allowedTypes` |
| Attendance half-day threshold | `src/app/api/attendance/route.ts` | `attendance.halfDayHours` |
| Immigration alert: 90 days | `src/app/api/ws/employees/[id]/route.ts` | `immigration.alertDays` |

---

## How to Execute This Review

Work module by module in this order:

1. **Security fixes first** (Priority 1) — no skipping
2. **Broken flows** (Priority 2) — each is a user-visible dead end
3. **Data integrity** (Priority 3) — silent corruption
4. **Role consistency** (Priority 4) — one-pass, touch all files
5. **UX polish** (Priority 5)
6. **Pagination** (Priority 6) — add to API + UI together per module
7. **Config extraction** (Priority 7) — lowest risk, do last

For each fix:
- Run `npx tsc --noEmit` after each module
- Commit per module: `fix(module): description`
- Do not introduce new dependencies unless essential

---

## Verification Checklist

After all fixes, confirm:
- [ ] `npm run build` passes with zero errors
- [ ] `npx tsc --noEmit` clean
- [ ] Employee can: view own leaves, own expenses, own payslip, own training — cannot see others'
- [ ] HR can: approve leaves, approve expenses, run payroll, view all employees
- [ ] `GET /api/departments` returns only current tenant's departments
- [ ] `GET /api/analytics` blocked for employee role
- [ ] Expense approve/reject works end-to-end
- [ ] Separation search finds employee by name (not ObjectId)
- [ ] Onboarding start search finds employee by name (not ObjectId)
