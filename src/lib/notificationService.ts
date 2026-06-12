/**
 * notificationService.ts
 *
 * Central helper for firing in-app notifications from API routes.
 *
 * Every public function follows the same contract:
 *   1. Runs a targeted query to resolve recipient user IDs.
 *   2. Bulk-inserts one WorkspaceInAppNotification document per recipient.
 *   3. Never throws — notification failures must never break the primary operation.
 *
 * Caller pattern (inside any withRoute / runWithSession handler):
 *
 *   import { notify } from '@/lib/notificationService';
 *
 *   await notify.leaveApproved({
 *     tenantId:   ctx.tenantId.toString(),
 *     employeeId: leave.employeeId.toString(),
 *     leaveType:  leave.leaveType,
 *     totalDays:  leave.totalDays,
 *   });
 */

import mongoose from 'mongoose';
import {
  WorkspaceInAppNotification,
  WorkspaceUser,
  type InAppNotifType,
} from '@/models/workspace.models';
// Also check legacy users collection for seeded accounts
import User from '@/models/User';

// ── helpers ──────────────────────────────────────────────────────────────────

type Payload = {
  tenantId:    string;
  userId?:     string;                 // single recipient user _id
  userIds?:    string[];               // multiple recipients
  roles?:      string[];               // all users with these roles in the tenant
  employeeId?: string;                 // resolve to the user linked to this employeeId
  type:        InAppNotifType;
  title:       string;
  body?:       string;
  actionUrl?:  string;
  priority?:   'low' | 'normal' | 'high' | 'critical';
  metadata?:   Record<string, unknown>;
};

async function resolveRecipients(p: Payload): Promise<string[]> {
  const ids = new Set<string>();

  if (p.userId)  ids.add(p.userId);
  if (p.userIds) p.userIds.forEach((id) => ids.add(id));

  const tenantOid = new mongoose.Types.ObjectId(p.tenantId);

  // ── Look up by employeeId ──────────────────────────────────────────────────
  // Check both ws_users and the legacy users collection so seeded accounts work.
  if (p.employeeId) {
    const empOid = new mongoose.Types.ObjectId(p.employeeId);

    // ws_users (created via POST /api/ws/employees)
    const wsQ = (WorkspaceUser as any).findOne({ tenantId: tenantOid, employeeId: empOid, isActive: true }).select('_id');
    wsQ._bypassTenantPlugin = true;
    const wsUser = await wsQ.lean() as { _id: mongoose.Types.ObjectId } | null;
    if (wsUser) ids.add(wsUser._id.toString());

    // legacy users (created by seed)
    const legacyUser = await User.findOne({ tenantId: tenantOid, employeeId: empOid, isActive: true }).select('_id').lean();
    if (legacyUser) ids.add((legacyUser as { _id: mongoose.Types.ObjectId })._id.toString());
  }

  // ── Look up by role (all users in tenant with those roles) ─────────────────
  if (p.roles?.length) {
    // ws_users
    const wsQ = (WorkspaceUser as any).find({ tenantId: tenantOid, role: { $in: p.roles }, isActive: true }).select('_id');
    wsQ._bypassTenantPlugin = true;
    const wsUsers = await wsQ.lean() as Array<{ _id: mongoose.Types.ObjectId }>;
    wsUsers.forEach((u) => ids.add(u._id.toString()));

    // legacy users — use untyped query to avoid strict UserRole enum overload
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const legacyUsers = await (User as any).find(
      { tenantId: tenantOid, role: { $in: p.roles }, isActive: true },
      '_id',
    ).lean() as Array<{ _id: mongoose.Types.ObjectId }>;
    legacyUsers.forEach((u) => ids.add(u._id.toString()));
  }

  return Array.from(ids);
}

async function send(p: Payload): Promise<void> {
  try {
    const recipientIds = await resolveRecipients(p);
    if (recipientIds.length === 0) return;

    const tenantOid    = new mongoose.Types.ObjectId(p.tenantId);
    const employeeOid  = p.employeeId ? new mongoose.Types.ObjectId(p.employeeId) : undefined;

    const docs = recipientIds.map((userId) => ({
      tenantId:   tenantOid,
      userId:     new mongoose.Types.ObjectId(userId),
      employeeId: employeeOid,
      type:       p.type,
      title:      p.title,
      body:       p.body,
      actionUrl:  p.actionUrl,
      priority:   p.priority ?? 'normal',
      metadata:   p.metadata ?? {},
      // Include Mongoose schema defaults explicitly since we bypass the model
      isRead:     false,
      createdAt:  new Date(),
      updatedAt:  new Date(),
    }));

    // Direct collection insert bypasses the tenant isolation plugin
    const col = mongoose.connection.collection('ws_inapp_notifications');
    await col.insertMany(docs);
  } catch {
    // Never let notification failures break the primary request
  }
}

// ── Public trigger surface ────────────────────────────────────────────────────

export const notify = {

  /** Employee submitted a leave request → notify their direct manager (or HR if no manager) */
  async leaveSubmitted(p: {
    tenantId:   string;
    employeeCode: string;
    employeeId:   string;
    leaveType:  string;
    totalDays:  number;
    startDate:  string;
    leaveId:    string;
    managerId?: string;
  }) {
    if (p.managerId) {
      // Route to the specific manager first
      await send({
        tenantId:   p.tenantId,
        employeeId: p.managerId,
        type:       'leave_request',
        priority:   'normal',
        title:      `Leave request from ${p.employeeCode} — needs your approval`,
        body:       `${p.leaveType.replace(/_/g, ' ')} · ${p.totalDays} day${p.totalDays !== 1 ? 's' : ''} starting ${p.startDate}`,
        actionUrl:  `/leaves`,
        metadata:   { leaveId: p.leaveId, employeeId: p.employeeId },
      });
    } else {
      // No manager — go straight to HR
      await send({
        tenantId:  p.tenantId,
        roles:     ['hr_admin', 'hr_manager'],
        type:      'leave_request',
        priority:  'normal',
        title:     `Leave request from ${p.employeeCode}`,
        body:      `${p.leaveType.replace(/_/g, ' ')} · ${p.totalDays} day${p.totalDays !== 1 ? 's' : ''} starting ${p.startDate}`,
        actionUrl: `/leaves`,
        metadata:  { leaveId: p.leaveId, employeeId: p.employeeId },
      });
    }
  },

  /** Manager approved a leave → notify HR for final sign-off */
  async leaveForwardedToHR(p: {
    tenantId:     string;
    employeeCode: string;
    employeeId:   string;
    leaveType:    string;
    totalDays:    number;
    startDate:    string;
    leaveId:      string;
  }) {
    await send({
      tenantId:  p.tenantId,
      roles:     ['hr_admin'],
      type:      'leave_request',
      priority:  'normal',
      title:     `Leave approved by manager — HR sign-off needed for ${p.employeeCode}`,
      body:      `${p.leaveType.replace(/_/g, ' ')} · ${p.totalDays} day${p.totalDays !== 1 ? 's' : ''} starting ${p.startDate}`,
      actionUrl: `/leaves`,
      metadata:  { leaveId: p.leaveId, employeeId: p.employeeId },
    });
  },

  /** HR approved a leave → notify the employee */
  async leaveApproved(p: {
    tenantId:   string;
    employeeId: string;
    leaveType:  string;
    totalDays:  number;
    startDate:  string;
    approvedBy: string;
    leaveId:    string;
  }) {
    await send({
      tenantId:   p.tenantId,
      employeeId: p.employeeId,
      type:       'leave_approved',
      priority:   'normal',
      title:      'Your leave request was approved',
      body:       `${p.leaveType.replace(/_/g, ' ')} · ${p.totalDays} day${p.totalDays !== 1 ? 's' : ''} starting ${p.startDate}`,
      actionUrl:  '/my/leaves',
      metadata:   { leaveId: p.leaveId, approvedBy: p.approvedBy },
    });
  },

  /** HR rejected a leave → notify the employee */
  async leaveRejected(p: {
    tenantId:        string;
    employeeId:      string;
    leaveType:       string;
    totalDays:       number;
    rejectionReason: string;
    leaveId:         string;
  }) {
    await send({
      tenantId:   p.tenantId,
      employeeId: p.employeeId,
      type:       'leave_rejected',
      priority:   'high',
      title:      'Your leave request was not approved',
      body:       p.rejectionReason || `${p.leaveType.replace(/_/g, ' ')} · ${p.totalDays} day${p.totalDays !== 1 ? 's' : ''}`,
      actionUrl:  '/my/leaves',
      metadata:   { leaveId: p.leaveId },
    });
  },

  /** HR created a new employee → welcome the employee + notify hr_admin */
  async employeeCreated(p: {
    tenantId:     string;
    employeeId:   string;
    employeeCode: string;
    jobTitle:     string;
    createdByUserId: string;
  }) {
    // Welcome notification for the new employee
    await send({
      tenantId:   p.tenantId,
      employeeId: p.employeeId,
      type:       'system_message',
      priority:   'normal',
      title:      `Welcome to HRMS Pro, ${p.employeeCode}!`,
      body:       `Your account has been set up as ${p.jobTitle}. Complete your profile to get started.`,
      actionUrl:  '/dashboard',
      metadata:   { employeeCode: p.employeeCode },
    });
    // Notify HR admins that a new employee was added
    await send({
      tenantId:  p.tenantId,
      roles:     ['hr_admin'],
      type:      'system_message',
      priority:  'low',
      title:     `New employee onboarded: ${p.employeeCode}`,
      body:      `${p.jobTitle} was added to the workforce.`,
      actionUrl: `/employees/${p.employeeId}`,
      metadata:  { employeeId: p.employeeId, createdBy: p.createdByUserId },
    });
  },

  /** Payroll run created → notify payroll officers + hr_admin */
  async payrollRunCreated(p: {
    tenantId:       string;
    runCode:        string;
    runId:          string;
    payPeriodMonth: number;
    payPeriodYear:  number;
    employeeCount:  number;
  }) {
    const MONTHS = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    await send({
      tenantId: p.tenantId,
      roles:    ['hr_admin', 'payroll_officer'],
      type:     'payroll_ready',
      priority: 'normal',
      title:    `Payroll run created: ${MONTHS[p.payPeriodMonth]} ${p.payPeriodYear}`,
      body:     `${p.runCode} · ${p.employeeCount} employees · Status: Draft`,
      actionUrl:`/payroll`,
      metadata: { runId: p.runId, runCode: p.runCode },
    });
  },

  /** Payroll approved → notify all employees that payslips are ready */
  async payrollApproved(p: {
    tenantId:       string;
    runCode:        string;
    runId:          string;
    payPeriodMonth: number;
    payPeriodYear:  number;
  }) {
    const MONTHS = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    // Notify all active employees in the tenant
    await send({
      tenantId: p.tenantId,
      roles:    ['employee', 'hr_manager', 'hr_admin', 'payroll_officer', 'finance_auditor'],
      type:     'payroll_ready',
      priority: 'normal',
      title:    `Payslips ready for ${MONTHS[p.payPeriodMonth]} ${p.payPeriodYear}`,
      body:     `Payroll run ${p.runCode} has been approved. Your payslip is now available.`,
      actionUrl:'/my/leaves',
      metadata: { runId: p.runId },
    });
  },

  /** Payroll reversed → notify HR and payroll team */
  async payrollReversed(p: {
    tenantId:  string;
    runCode:   string;
    runId:     string;
    reversedBy: string;
  }) {
    await send({
      tenantId:  p.tenantId,
      roles:     ['hr_admin', 'payroll_officer', 'finance_auditor'],
      type:      'payroll_reversed',
      priority:  'high',
      title:     `Payroll run reversed: ${p.runCode}`,
      body:      `The payroll run has been reversed and must be re-processed.`,
      actionUrl: `/payroll`,
      metadata:  { runId: p.runId, reversedBy: p.reversedBy },
    });
  },

  /** Device compliance breach → notify the employee */
  async deviceNonCompliant(p: {
    tenantId:    string;
    employeeId:  string;
    trustLevel:  string;
    deviceId?:   string;
  }) {
    await send({
      tenantId:   p.tenantId,
      employeeId: p.employeeId,
      type:       'device_warning',
      priority:   'critical',
      title:      'Your device is non-compliant',
      body:       `Device trust level is now "${p.trustLevel}". Your access may be restricted until resolved.`,
      actionUrl:  '/dashboard',
      metadata:   { trustLevel: p.trustLevel, deviceId: p.deviceId },
    });
  },

  /** Visa/immigration record expiring soon → notify the employee and HR */
  async visaExpiringSoon(p: {
    tenantId:     string;
    employeeId:   string;
    employeeCode: string;
    documentType: string;
    hostCountry:  string;
    daysUntil:    number;
    expiresAt:    string;
  }) {
    const urgency = p.daysUntil <= 30 ? 'critical' : p.daysUntil <= 60 ? 'high' : 'normal';
    // Notify the employee
    await send({
      tenantId:   p.tenantId,
      employeeId: p.employeeId,
      type:       'visa_expiry',
      priority:   urgency,
      title:      `Your ${p.documentType.replace(/_/g, ' ')} expires in ${p.daysUntil} days`,
      body:       `${p.hostCountry} work authorisation expires ${p.expiresAt}. Contact HR to begin renewal.`,
      actionUrl:  '/my/leaves',
      metadata:   { documentType: p.documentType, daysUntil: p.daysUntil },
    });
    // Also notify HR compliance team
    await send({
      tenantId:  p.tenantId,
      roles:     ['hr_admin', 'compliance_officer'],
      type:      'immigration_alert',
      priority:  urgency,
      title:     `Visa expiry alert: ${p.employeeCode}`,
      body:      `${p.documentType.replace(/_/g, ' ')} for ${p.hostCountry} expires in ${p.daysUntil} days (${p.expiresAt})`,
      actionUrl: `/immigration`,
      metadata:  { employeeId: p.employeeId, daysUntil: p.daysUntil },
    });
  },

  /** Equity grant vested → notify the employee */
  async equityVested(p: {
    tenantId:   string;
    employeeId: string;
    grantId:    string;
    grantType:  string;
    units:      number;
    currency:   string;
  }) {
    await send({
      tenantId:   p.tenantId,
      employeeId: p.employeeId,
      type:       'equity_vest',
      priority:   'high',
      title:      `${p.units.toLocaleString()} ${p.grantType.toUpperCase()} units have vested`,
      body:       `Grant ${p.grantId} — your vested units are now available. View in My Equity.`,
      actionUrl:  '/my/equity',
      metadata:   { grantId: p.grantId, units: p.units },
    });
  },

  /** HR opened a review for self-assessment → notify the employee */
  async reviewOpened(p: {
    tenantId:   string;
    employeeId: string;
    cycleLabel: string;
    reviewId:   string;
  }) {
    await send({
      tenantId:   p.tenantId,
      employeeId: p.employeeId,
      type:       'review_opened',
      priority:   'normal',
      title:      `Your ${p.cycleLabel} performance review is open`,
      body:       'Complete your self-assessment to get started. Open My Reviews.',
      actionUrl:  `/my/performance/${p.reviewId}`,
      metadata:   { reviewId: p.reviewId },
    });
  },

  /** Employee submitted self-assessment → notify HR managers + admins */
  async reviewSubmitted(p: {
    tenantId:     string;
    employeeCode: string;
    cycleLabel:   string;
    reviewId:     string;
  }) {
    await send({
      tenantId:  p.tenantId,
      roles:     ['hr_admin', 'hr_manager'],
      type:      'review_submitted',
      priority:  'normal',
      title:     `${p.employeeCode} submitted their self-assessment`,
      body:      `${p.cycleLabel} review is ready for your manager evaluation.`,
      actionUrl: `/performance/${p.reviewId}`,
      metadata:  { reviewId: p.reviewId },
    });
  },

  /** HR finalized a review → notify the employee to acknowledge */
  async reviewFinalized(p: {
    tenantId:      string;
    employeeId:    string;
    cycleLabel:    string;
    overallRating: number;
    reviewId:      string;
  }) {
    await send({
      tenantId:   p.tenantId,
      employeeId: p.employeeId,
      type:       'review_finalized',
      priority:   'high',
      title:      `Your ${p.cycleLabel} review has been finalized`,
      body:       `Overall rating: ${p.overallRating}/5. Review the details and acknowledge.`,
      actionUrl:  `/my/performance/${p.reviewId}`,
      metadata:   { reviewId: p.reviewId, overallRating: p.overallRating },
    });
  },

  /** Manager attached a compensation recommendation → notify HR approvers */
  async compRecommended(p: {
    tenantId:     string;
    employeeCode: string;
    cycleLabel:   string;
    incrementPct: number;
    promotion:    boolean;
    reviewId:     string;
  }) {
    const bits = [`${p.incrementPct}% increment`, p.promotion ? 'promotion' : null].filter(Boolean).join(' + ');
    await send({
      tenantId:  p.tenantId,
      roles:     ['hr_admin', 'super_admin'],
      type:      'comp_recommended',
      priority:  'high',
      title:     `Compensation recommendation for ${p.employeeCode}`,
      body:      `${p.cycleLabel}: ${bits}. Awaiting your approval.`,
      actionUrl: `/performance/approvals`,
      metadata:  { reviewId: p.reviewId },
    });
  },

  /** Two-step: skip-level manager must endorse before HR → notify that manager */
  async compEndorsementNeeded(p: {
    tenantId:     string;
    employeeId:   string;   // skip-level manager's employee record
    employeeCode: string;
    cycleLabel:   string;
    incrementPct: number;
    promotion:    boolean;
    reviewId:     string;
  }) {
    const bits = [`${p.incrementPct}% increment`, p.promotion ? 'promotion' : null].filter(Boolean).join(' + ');
    await send({
      tenantId:   p.tenantId,
      employeeId: p.employeeId,
      type:       'comp_recommended',
      priority:   'high',
      title:      `Endorsement needed for ${p.employeeCode}`,
      body:       `${p.cycleLabel}: ${bits}. As skip-level manager, your endorsement is required before HR sign-off.`,
      actionUrl:  `/performance/approvals`,
      metadata:   { reviewId: p.reviewId, step: 'skip_level' },
    });
  },

  /** Two-step: skip-level endorsed → notify HR approvers for final sign-off */
  async compReadyForSignoff(p: {
    tenantId:     string;
    employeeCode: string;
    cycleLabel:   string;
    incrementPct: number;
    promotion:    boolean;
    reviewId:     string;
  }) {
    const bits = [`${p.incrementPct}% increment`, p.promotion ? 'promotion' : null].filter(Boolean).join(' + ');
    await send({
      tenantId:  p.tenantId,
      roles:     ['hr_admin', 'super_admin'],
      type:      'comp_recommended',
      priority:  'high',
      title:     `Ready for HR sign-off: ${p.employeeCode}`,
      body:      `${p.cycleLabel}: ${bits}. Skip-level manager endorsed — final HR approval required.`,
      actionUrl: `/performance/approvals`,
      metadata:  { reviewId: p.reviewId, step: 'hr' },
    });
  },

  /** HR accepted the recommendation & applied the revision → notify employee */
  async compApproved(p: {
    tenantId:      string;
    employeeId:    string;
    cycleLabel:    string;
    incrementPct:  number;
    promotion:     boolean;
    effectiveDate: string;
    reviewId:      string;
  }) {
    const bits = [`${p.incrementPct}% increment`, p.promotion ? 'a promotion' : null].filter(Boolean).join(' and ');
    await send({
      tenantId:   p.tenantId,
      employeeId: p.employeeId,
      type:       'comp_approved',
      priority:   'high',
      title:      'Your compensation has been revised',
      body:       `You have been awarded ${bits}, effective ${p.effectiveDate}. It will reflect in your next payroll.`,
      actionUrl:  `/my/performance/${p.reviewId}`,
      metadata:   { reviewId: p.reviewId },
    });
  },

  /** HR rejected the recommendation → notify the recommending manager */
  async compRejected(p: {
    tenantId:     string;
    managerId:    string;       // user id of the recommender
    employeeCode: string;
    cycleLabel:   string;
    note:         string;
    reviewId:     string;
  }) {
    await send({
      tenantId: p.tenantId,
      userId:   p.managerId,
      type:     'comp_rejected',
      priority: 'normal',
      title:    `Compensation recommendation for ${p.employeeCode} was declined`,
      body:     p.note || `Your ${p.cycleLabel} compensation recommendation was not approved.`,
      actionUrl:`/performance/${p.reviewId}`,
      metadata: { reviewId: p.reviewId },
    });
  },
};
