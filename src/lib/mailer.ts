/**
 * mailer.ts — nodemailer wrapper for all transactional emails.
 *
 * Configure via .env.local:
 *   SMTP_HOST=smtp.gmail.com
 *   SMTP_PORT=587
 *   SMTP_SECURE=false
 *   SMTP_USER=you@gmail.com
 *   SMTP_PASS=xxxx-xxxx-xxxx    ← Google App Password (not your login password)
 *   SMTP_FROM="HRMS Pro <you@gmail.com>"
 *   APP_URL=https://your-domain.com
 *
 * When SMTP_HOST / SMTP_USER / SMTP_PASS are absent, every call is a no-op
 * so dev environments work without configuration.
 */

import nodemailer from 'nodemailer';

// ── Transport singleton ───────────────────────────────────────────────────────

let _transport: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransport() {
  if (_transport) return _transport;

  const host = process.env['SMTP_HOST'];
  const user = process.env['SMTP_USER'];
  const pass = process.env['SMTP_PASS'];
  if (!host || !user || !pass) return null;

  _transport = nodemailer.createTransport({
    host,
    port:   parseInt(process.env['SMTP_PORT'] ?? '587'),
    secure: process.env['SMTP_SECURE'] === 'true',
    auth:   { user, pass },
  });
  return _transport;
}

const FROM    = () => process.env['SMTP_FROM']    ?? 'HRMS Pro <no-reply@hrms.local>';
const APP_URL = () => process.env['APP_URL']      ?? process.env['NEXTAUTH_URL'] ?? 'http://localhost:3000';

async function dispatch(to: string, subject: string, html: string) {
  const t = getTransport();
  if (!t) return; // no-op when SMTP not configured
  try {
    await t.sendMail({ from: FROM(), to, subject, html });
  } catch (err) {
    // Email failures must never break primary operations
    console.error('[mailer] send failed to', to, err instanceof Error ? err.message : err);
  }
}

// ── Shared layout ─────────────────────────────────────────────────────────────

function layout(companyName: string, brandColor: string, bodyHtml: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${companyName}</title></head>
<body style="margin:0;padding:0;background:#F4F6FA;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6FA;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr><td style="background:${brandColor};padding:24px 32px;">
          <p style="margin:0;color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">${companyName}</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px;">
          ${bodyHtml}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:16px 32px 24px;border-top:1px solid #E8EAF0;">
          <p style="margin:0;font-size:11px;color:#9AA1B0;">This is an automated message from ${companyName}'s HR system. Do not reply to this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function btn(url: string, label: string, color: string) {
  return `<a href="${url}" style="display:inline-block;margin-top:20px;padding:12px 28px;background:${color};color:#fff;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">${label}</a>`;
}

function kv(label: string, value: string) {
  return `<tr>
    <td style="padding:6px 0;font-size:13px;color:#6B7280;width:140px;vertical-align:top;">${label}</td>
    <td style="padding:6px 0;font-size:13px;color:#111827;font-weight:600;">${value}</td>
  </tr>`;
}

// ── Email functions ───────────────────────────────────────────────────────────

interface CompanyCtx {
  companyName: string;
  brandColor?: string;
}

/**
 * Sent when HR adds a new employee. Contains login credentials.
 */
export async function sendWelcomeEmail(params: {
  to:           string;
  employeeName: string;
  tempPassword: string;
  companyName:  string;
  brandColor?:  string;
}) {
  const color   = params.brandColor ?? '#1C509D';
  const loginUrl = `${APP_URL()}/login`;

  const body = `
    <h2 style="margin:0 0 8px;font-size:22px;color:#111827;">Welcome to ${params.companyName}! 👋</h2>
    <p style="margin:0 0 24px;color:#374151;font-size:15px;">Hi ${params.employeeName}, your HR workspace account has been created. Use the credentials below to sign in.</p>
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
      ${kv('Login URL',   loginUrl)}
      ${kv('Email',       params.to)}
      ${kv('Password',    params.tempPassword)}
    </table>
    <div style="margin-top:16px;padding:12px 16px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;font-size:13px;color:#92400E;">
      This is a temporary password. You will be prompted to change it after your first login.
    </div>
    ${btn(loginUrl, 'Sign in now', color)}`;

  await dispatch(
    params.to,
    `Welcome to ${params.companyName} — your account is ready`,
    layout(params.companyName, color, body),
  );
}

/**
 * Sent to the manager when an employee submits a leave request.
 */
export async function sendLeaveSubmittedEmail(params: {
  to:           string;   // manager's email
  managerName:  string;
  employeeName: string;
  leaveType:    string;
  startDate:    string;
  endDate:      string;
  totalDays:    number;
  reason:       string;
  leaveId:      string;
} & CompanyCtx) {
  const color      = params.brandColor ?? '#1C509D';
  const approveUrl = `${APP_URL()}/my/team`;

  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#111827;">Leave request awaiting your approval</h2>
    <p style="margin:0 0 24px;color:#374151;font-size:15px;">Hi ${params.managerName}, <strong>${params.employeeName}</strong> has submitted a leave request.</p>
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
      ${kv('Employee',   params.employeeName)}
      ${kv('Leave type', params.leaveType.charAt(0).toUpperCase() + params.leaveType.slice(1))}
      ${kv('From',       params.startDate)}
      ${kv('To',         params.endDate)}
      ${kv('Days',       String(params.totalDays))}
      ${kv('Reason',     params.reason)}
    </table>
    ${btn(approveUrl, 'Review & approve', color)}`;

  await dispatch(
    params.to,
    `${params.employeeName} has requested ${params.totalDays} day(s) of ${params.leaveType} leave`,
    layout(params.companyName, color, body),
  );
}

/**
 * Sent to the employee when their leave is approved.
 */
export async function sendLeaveApprovedEmail(params: {
  to:           string;   // employee's email
  employeeName: string;
  leaveType:    string;
  startDate:    string;
  endDate:      string;
  totalDays:    number;
} & CompanyCtx) {
  const color = params.brandColor ?? '#1C509D';

  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#16A34A;">Your leave request has been approved ✓</h2>
    <p style="margin:0 0 24px;color:#374151;font-size:15px;">Hi ${params.employeeName}, your leave request has been approved.</p>
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
      ${kv('Leave type', params.leaveType.charAt(0).toUpperCase() + params.leaveType.slice(1))}
      ${kv('From',       params.startDate)}
      ${kv('To',         params.endDate)}
      ${kv('Days',       String(params.totalDays))}
    </table>
    ${btn(`${APP_URL()}/my/leaves`, 'View my leaves', color)}`;

  await dispatch(
    params.to,
    `Leave approved: ${params.totalDays} day(s) of ${params.leaveType} leave`,
    layout(params.companyName, color, body),
  );
}

/**
 * Sent to the employee when their leave is rejected.
 */
export async function sendLeaveRejectedEmail(params: {
  to:             string;
  employeeName:   string;
  leaveType:      string;
  startDate:      string;
  endDate:        string;
  rejectionReason?: string;
} & CompanyCtx) {
  const color = params.brandColor ?? '#1C509D';

  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#DC2626;">Your leave request has been declined</h2>
    <p style="margin:0 0 24px;color:#374151;font-size:15px;">Hi ${params.employeeName}, unfortunately your leave request could not be approved.</p>
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
      ${kv('Leave type', params.leaveType.charAt(0).toUpperCase() + params.leaveType.slice(1))}
      ${kv('From',       params.startDate)}
      ${kv('To',         params.endDate)}
      ${kv('Reason',     params.rejectionReason ?? 'No reason provided')}
    </table>
    <p style="margin-top:16px;font-size:13px;color:#6B7280;">Please contact your manager or HR if you have questions.</p>
    ${btn(`${APP_URL()}/my/leaves`, 'View my leaves', color)}`;

  await dispatch(
    params.to,
    `Leave request declined: ${params.leaveType} leave`,
    layout(params.companyName, color, body),
  );
}

/**
 * Sent from the setup wizard invite step or HR bulk invite.
 */
export async function sendInviteEmail(params: {
  to:           string;
  inviteeName:  string;
  tempPassword: string;
  companyName:  string;
  brandColor?:  string;
}) {
  const color    = params.brandColor ?? '#1C509D';
  const loginUrl = `${APP_URL()}/login`;

  const body = `
    <h2 style="margin:0 0 8px;font-size:22px;color:#111827;">You've been invited to ${params.companyName}</h2>
    <p style="margin:0 0 24px;color:#374151;font-size:15px;">Hi ${params.inviteeName || 'there'}, your team at ${params.companyName} has set up an HR workspace for you.</p>
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
      ${kv('Login URL', loginUrl)}
      ${kv('Email',     params.to)}
      ${kv('Password',  params.tempPassword)}
    </table>
    <div style="margin-top:16px;padding:12px 16px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;font-size:13px;color:#92400E;">
      Change your password after your first sign-in.
    </div>
    ${btn(loginUrl, 'Accept invitation', color)}`;

  await dispatch(
    params.to,
    `You've been invited to ${params.companyName}'s HR workspace`,
    layout(params.companyName, color, body),
  );
}

export async function sendPasswordResetEmail(params: {
  to:          string;
  name:        string;
  resetUrl:    string;
  companyName: string;
  brandColor?: string;
  expiresInMinutes?: number;
}) {
  const color   = params.brandColor ?? '#1C509D';
  const expires = params.expiresInMinutes ?? 60;

  const body = `
    <h2 style="margin:0 0 8px;font-size:22px;color:#111827;">Reset your password</h2>
    <p style="margin:0 0 20px;color:#374151;font-size:15px;">Hi ${params.name}, we received a request to reset the password for your ${params.companyName} account.</p>
    <p style="margin:0 0 4px;color:#374151;font-size:14px;">Click the button below to choose a new password. This link expires in <strong>${expires} minutes</strong>.</p>
    ${btn(params.resetUrl, 'Reset my password', color)}
    <div style="margin-top:24px;padding:12px 16px;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;font-size:12px;color:#6B7280;">
      If you didn't request a password reset, you can safely ignore this email. Your password will not change.
    </div>
    <p style="margin:20px 0 0;font-size:12px;color:#9CA3AF;">Or copy this link into your browser:<br/><span style="color:${color};word-break:break-all;">${params.resetUrl}</span></p>`;

  await dispatch(params.to, 'Reset your HRMS password', layout(params.companyName, color, body));
}
