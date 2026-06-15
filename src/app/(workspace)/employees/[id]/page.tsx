'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter }             from 'next/navigation';
import {
  ArrowLeft, User, Building2, Globe, DollarSign,
  TrendingUp, Laptop, Shield, Calendar, Loader2,
  Mail, Phone, MapPin, Edit2, Save, X, Plus,
  Trash2, CheckCircle, AlertTriangle, Clock,
  UserCheck, FileText, Activity, ChevronDown,
  SlidersHorizontal, Eye, EyeOff, Receipt,
} from 'lucide-react';
import { Tabs }                      from '@/components/ui/Tabs';
import { Badge, StatusBadge }        from '@/components/ui/Badge';
import { RiskBar }                   from '@/components/ui/RiskBar';
import { Avatar }                    from '@/components/ui/Avatar';
import { StatCard }                  from '@/components/ui/StatCard';
import { Modal }                     from '@/components/ui/Modal';
import { Skeleton, SkeletonRows }    from '@/components/ui/Skeleton';
import { EmptyState }                from '@/components/ui/EmptyState';
import { EquityVestingTimeline }     from '@/components/widgets/EquityVestingTimeline';
import { AssetsRegistry }            from '@/components/widgets/AssetsRegistry';
import { ImmigrationNexusTracker }   from '@/components/widgets/ImmigrationNexusTracker';
import { useToast }                  from '@/components/ui/Toast';
import { useSession }               from '@/hooks/useSession';
import { formatDate, formatRelativeTime, formatCurrency } from '@/lib/format';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface EmployeeDetail {
  _id: string; employeeCode: string;
  jobTitle: string; departmentId: string; departmentName: string; departmentCode: string;
  countryCode: string; timezone: string; locale: string;
  currencyCode: string; salaryBand?: string; payFrequency: string;
  hireDate: string; probationEndDate?: string; nextReviewDate?: string; lastPromotionDate?: string;
  employeeStatus: string; employmentType: string; isActive: boolean;
  burnoutRiskScore: number; flightRiskScore: number; engagementPct?: number; riskComputedAt?: string;
  managerName?: string; managerId?: string; costCenterCode?: string;
  skills: Array<{ skillSlug: string; skillName: string; category: string; proficiency: string; verifiedVia: string; endorsementCount: number }>;
  vestingSchedules: Array<{ grantId: string; grantType: string; grantDate: string; cliffDate: string; fullyVestedDate: string; totalUnits: number; vestedUnits: number; unvestedUnits: number; strikePrice?: number; currencyCode: string; vestingScheduleType: string; vestingPeriodMonths: number; status: string }>;
  provisionedAssets: Array<{ assetId: string; assetCategory: string; provider?: string; state: string; syncedAt?: string; name?: string; serialNumber?: string; model?: string }>;
  immigrationRecords: Array<{ documentType: string; documentNumber?: string; issuingCountry: string; hostCountry: string; validFrom: string; expiresAt: string; visaCategory?: string; physicalDaysInCountry: number; nexusTriggerDays: number; nexusRiskLevel: string; status: string }>;
  deviceTrustState: { trustLevel: string; complianceScore: number; lastHeartbeatAt?: string; accessTokenThrottle: number; diskEncrypted: boolean; osPatchCurrent: boolean; mdmProfileActive: boolean; edrAgentActive: boolean; firewallEnabled: boolean };
  identityVerification: { verificationStatus: string; livenessCheckPassed: boolean; failedAttempts: number; verifiedAt?: string };
  digitalWorkerMeta: { isDigitalWorker: boolean; agentFramework?: string; modelVersion?: string; tokenBudgetMonthly: number; tokenBudgetUsed: number; apiCostMtd: number; humanSupervisorId?: string };
  createdAt: string; updatedAt: string;
  reveal: { fullName: string | null; email: string | null; phone: string | null; bankAccount: string | null; baseSalary: string | null };
  immigrationAlerts: Array<{ documentType: string; hostCountry: string; expiresAt: string; daysUntilExpiry: number; nexusRiskLevel: string }>;
  hiddenTabs: string[];
}

interface LeaveRecord { _id: string; leaveType: string; startDate: string; endDate: string; totalDays: number; status: string; reason: string; approvedAt?: string }
interface EmergencyContact { name: string; relationship: string; phone: string; email?: string }
interface PayslipStub {
  _id: string; runCode: string; month: number; year: number;
  currencyCode: string; status: string; payDate: string | null;
  baseSalary: number | null; grossSalary: number | null; netSalary: number | null;
  attendanceDays: number | null; overtimeHours: number; leaveDaysDeducted: number;
  varianceFlag: boolean;
}

const BASE_TABS = [
  { key: 'overview',    label: 'Overview',    icon: User },
  { key: 'employment',  label: 'Employment',  icon: Building2 },
  { key: 'skills',      label: 'Skills',      icon: TrendingUp },
  { key: 'equity',      label: 'Equity',      icon: DollarSign },
  { key: 'assets',      label: 'Assets',      icon: Laptop },
  { key: 'immigration', label: 'Immigration', icon: Globe },
  { key: 'leaves',      label: 'Leaves',      icon: Calendar },
  { key: 'security',    label: 'Security',    icon: Shield },
  { key: 'audit',       label: 'Activity',    icon: Activity },
];

// Access Control tab injected at position 2 for HR roles so it's always visible without scrolling
const ACCESS_TAB    = { key: 'access',    label: 'Access Control', icon: SlidersHorizontal };
const PAYSLIPS_TAB  = { key: 'payslips',  label: 'Payslips',       icon: Receipt };

function buildTabs(isHR: boolean) {
  if (!isHR) return BASE_TABS;
  // Insert Payslips after Leaves
  const base = [...BASE_TABS];
  const leavesIdx = base.findIndex((t) => t.key === 'leaves');
  base.splice(leavesIdx + 1, 0, PAYSLIPS_TAB);
  return [base[0], ACCESS_TAB, ...base.slice(1)];
}

// All employee-role nav items that HR can individually hide
const HIDEABLE_NAV = [
  { href: '/my/profile',     label: 'My Profile' },
  { href: '/my/attendance',  label: 'My Attendance' },
  { href: '/my/leaves',      label: 'My Leaves' },
  { href: '/my/expenses',    label: 'My Expenses' },
  { href: '/payroll',        label: 'My Payslips' },
  { href: '/my/performance', label: 'My Reviews' },
  { href: '/my/goals',       label: 'My Goals' },
  { href: '/my/assets',      label: 'My Assets' },
  { href: '/my/equity',      label: 'My Equity' },
  { href: '/my/tax',         label: 'Tax Studio' },
];

const EMPLOYMENT_TYPES = ['full_time','part_time','contractor','intern','advisor','digital_worker'];
const EMPLOYEE_STATUSES = ['pre_hire','active','on_leave','pip','suspended','terminated','retired'];
const TIMEZONES = ['UTC','Asia/Kolkata','Asia/Singapore','Asia/Tokyo','Asia/Hong_Kong','Australia/Sydney','Europe/London','Europe/Berlin','Europe/Amsterdam','America/New_York','America/Chicago','America/Los_Angeles','America/Toronto','America/Sao_Paulo'];
const COUNTRIES: { code: string; label: string }[] = [
  { code: 'IN', label: 'India' }, { code: 'US', label: 'United States' },
  { code: 'GB', label: 'United Kingdom' }, { code: 'SG', label: 'Singapore' },
  { code: 'AE', label: 'UAE' }, { code: 'AU', label: 'Australia' },
  { code: 'CA', label: 'Canada' }, { code: 'DE', label: 'Germany' },
  { code: 'FR', label: 'France' }, { code: 'NL', label: 'Netherlands' },
  { code: 'JP', label: 'Japan' }, { code: 'HK', label: 'Hong Kong' },
  { code: 'NZ', label: 'New Zealand' }, { code: 'ZA', label: 'South Africa' },
];
const SKILL_PROFICIENCIES = ['awareness','working','practitioner','expert','authority'];
const SKILL_VERIFIED_VIA  = ['self_assessment','peer_review_360','project_delivery','certification','manager_eval','open_source_contribution'];

// ─────────────────────────────────────────────────────────────────────────────
// Emergency Contact inline card
// ─────────────────────────────────────────────────────────────────────────────

function EmergencyContactCard({
  employeeId,
  initialContact,
  onSaved,
}: {
  employeeId: string;
  initialContact?: EmergencyContact;
  onSaved: () => void;
}) {
  const toast    = useToast();
  const [editing, setEditing] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [contact, setContact] = useState<EmergencyContact>(
    initialContact ?? { name: '', relationship: '', phone: '', email: '' }
  );

  const save = async () => {
    if (!contact.name || !contact.relationship || !contact.phone) {
      toast.push({ kind: 'error', title: 'Name, relationship, and phone are required' }); return;
    }
    setSaving(true);
    const res = await fetch(`/api/ws/employees/${employeeId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emergencyContact: contact }),
    });
    setSaving(false);
    if (res.ok) {
      toast.push({ kind: 'success', title: 'Emergency contact saved' });
      setEditing(false); onSaved();
    } else {
      const j = await res.json();
      toast.push({ kind: 'error', title: j.error ?? 'Save failed' });
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '0.5rem 0.8rem',
    borderRadius: '0.6rem', border: '1px solid var(--color-stroke)',
    background: 'var(--color-neutral-2)', fontSize: 'var(--text-fs-12)',
    fontFamily: 'inherit', outline: 'none',
  };

  return (
    <div className="hrms-card" style={{ padding: '1.6rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.2rem', paddingBottom: '0.8rem', borderBottom: '1px solid var(--color-stroke)' }}>
        <Phone size={14} style={{ color: 'var(--color-vr-blue-6)' }} />
        <h3 style={{ margin: 0, color: 'var(--color-neutral-10)', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-14)' }}>
          Emergency Contact
        </h3>
        {!editing && (
          <button onClick={() => setEditing(true)} className="hrms-btn-ghost" style={{ marginLeft: 'auto', padding: '0.3rem 0.7rem', fontSize: 11 }}>
            <Edit2 size={11} /> Edit
          </button>
        )}
      </div>

      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--color-neutral-7)', marginBottom: '0.3rem' }}>Full Name *</label>
              <input style={inputStyle} value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} placeholder="e.g. Priya Sharma" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--color-neutral-7)', marginBottom: '0.3rem' }}>Relationship *</label>
              <input style={inputStyle} value={contact.relationship} onChange={(e) => setContact({ ...contact, relationship: e.target.value })} placeholder="e.g. Spouse, Parent" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--color-neutral-7)', marginBottom: '0.3rem' }}>Phone *</label>
              <input style={inputStyle} value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} placeholder="+91-XXXXX-XXXXX" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--color-neutral-7)', marginBottom: '0.3rem' }}>Email (optional)</label>
              <input style={inputStyle} value={contact.email ?? ''} onChange={(e) => setContact({ ...contact, email: e.target.value })} placeholder="contact@example.com" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
            <button onClick={() => setEditing(false)} className="hrms-btn-ghost">Cancel</button>
            <button onClick={save} disabled={saving} className="hrms-btn-primary">
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save
            </button>
          </div>
        </div>
      ) : initialContact?.name ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <p style={{ margin: 0, fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-10)', fontSize: 'var(--text-fs-13)' }}>{initialContact.name}</p>
          <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>{initialContact.relationship}</p>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-7)' }}>
              <Phone size={12} /> {initialContact.phone}
            </span>
            {initialContact.email && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-7)' }}>
                <Mail size={12} /> {initialContact.email}
              </span>
            )}
          </div>
        </div>
      ) : (
        <p style={{ margin: 0, color: 'var(--color-neutral-6)', fontSize: 'var(--text-fs-12)' }}>
          No emergency contact on file. Click Edit to add one.
        </p>
      )}
    </div>
  );
}

const HR_ROLES = new Set(['super_admin', 'hr_admin', 'hr_manager', 'payroll_officer', 'finance_auditor', 'compliance_officer']);

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const toast   = useToast();
  const { session: currentSession } = useSession();
  const isHR = !!currentSession && HR_ROLES.has(currentSession.role);

  const [emp,     setEmp]    = useState<EmployeeDetail | null>(null);
  const [leaves,  setLeaves] = useState<LeaveRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]    = useState('overview');

  // Edit state
  const [editing, setEditing] = useState(false);
  const [edits,   setEdits]   = useState<Record<string, string>>({});
  const [saving,  setSaving]  = useState(false);

  // Add skill modal
  const [skillModal,  setSkillModal]  = useState(false);
  const [newSkill,    setNewSkill]    = useState({ skillSlug: '', skillName: '', category: '', proficiency: 'working', verifiedVia: 'self_assessment' });
  const [savingSkill, setSavingSkill] = useState(false);

  // Leave approval for HR
  const [actingLeave, setActingLeave] = useState<string | null>(null);

  // Access control — per-employee nav visibility
  const [hiddenTabs,     setHiddenTabs]     = useState<string[]>([]);
  const [savingAccess,   setSavingAccess]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/ws/employees/${id}`);
      const json = await res.json();
      if (res.ok) {
        setEmp(json.data);
        setLeaves(json.leaves ?? []);
        setHiddenTabs(json.data?.hiddenTabs ?? []);
      } else {
        toast.push({ kind: 'error', title: json.error ?? 'Failed to load' });
      }
    } finally { setLoading(false); }
  }, [id, toast]);

  useEffect(() => { load(); }, [load]);

  const toggleTab = (href: string) => {
    setHiddenTabs((prev) =>
      prev.includes(href) ? prev.filter((h) => h !== href) : [...prev, href],
    );
  };

  const saveAccessControl = async () => {
    if (!isHR) return;
    setSavingAccess(true);
    const res = await fetch(`/api/ws/employees/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hiddenTabs }),
    });
    setSavingAccess(false);
    if (res.ok) {
      toast.push({ kind: 'success', title: 'Access control saved' });
    } else {
      const j = await res.json().catch(() => ({}));
      toast.push({ kind: 'error', title: j.error ?? 'Failed to save' });
    }
  };

  const startEdit = () => {
    if (!emp) return;
    setEdits({
      jobTitle:       emp.jobTitle,
      employeeStatus: emp.employeeStatus,
      employmentType: emp.employmentType,
      salaryBand:     emp.salaryBand ?? '',
      timezone:       emp.timezone,
      countryCode:    emp.countryCode,
      managerName:    emp.managerName ?? '',
      nextReviewDate: emp.nextReviewDate?.slice(0, 10) ?? '',
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    setSaving(true);
    const res  = await fetch(`/api/ws/employees/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(edits),
    });
    setSaving(false);
    if (res.ok) {
      toast.push({ kind: 'success', title: 'Employee updated' });
      setEditing(false); await load();
    } else {
      const j = await res.json();
      toast.push({ kind: 'error', title: j.error ?? 'Update failed' });
    }
  };

  const addSkill = async () => {
    if (!newSkill.skillSlug || !newSkill.skillName || !newSkill.category) {
      toast.push({ kind: 'error', title: 'Fill slug, name, and category' }); return;
    }
    setSavingSkill(true);
    const res = await fetch(`/api/ws/employees/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skills: [...(emp?.skills ?? []), newSkill] }),
    });
    setSavingSkill(false);
    if (res.ok) {
      toast.push({ kind: 'success', title: 'Skill added' });
      setSkillModal(false); setNewSkill({ skillSlug: '', skillName: '', category: '', proficiency: 'working', verifiedVia: 'self_assessment' });
      await load();
    } else toast.push({ kind: 'error', title: 'Failed to add skill' });
  };

  const removeSkill = async (slugToRemove: string) => {
    const updated = (emp?.skills ?? []).filter((s) => s.skillSlug !== slugToRemove);
    const res = await fetch(`/api/ws/employees/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skills: updated }),
    });
    if (res.ok) { toast.push({ kind: 'success', title: 'Skill removed' }); await load(); }
    else toast.push({ kind: 'error', title: 'Failed to remove skill' });
  };

  const actOnLeave = async (leaveId: string, action: 'approve' | 'reject') => {
    setActingLeave(leaveId + action);
    await fetch(`/api/leaves/${leaveId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, rejectionReason: action === 'reject' ? 'Rejected by HR' : undefined }),
    });
    setActingLeave(null);
    toast.push({ kind: 'success', title: `Leave ${action}d` });
    await load();
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ padding: '2rem', maxWidth: 1200 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.6rem', marginBottom: '2rem' }}>
          <Skeleton width={64} height={64} circle />
          <div style={{ flex: 1 }}>
            <Skeleton width={240} height={22} style={{ marginBottom: 8 }} />
            <Skeleton width={160} height={14} />
          </div>
        </div>
        <SkeletonRows rows={6} gap={12} />
      </div>
    );
  }

  if (!emp) {
    return (
      <div style={{ padding: '2rem' }}>
        <EmptyState icon={User} title="Employee not found"
                    action={<button onClick={() => router.back()} className="hrms-btn-ghost">← Go back</button>} />
      </div>
    );
  }

  const displayName = emp.reveal.fullName ?? emp.employeeCode;
  const tenureYears = Math.round(((Date.now() - new Date(emp.hireDate).getTime()) / 31_557_600_000) * 10) / 10;

  return (
    <div style={{ padding: '2rem 2.4rem 6rem 2.4rem', maxWidth: 1400, minHeight: 'calc(100vh - 56px)' }}>
      {/* Back */}
      <button onClick={() => router.back()} style={{
        display: 'flex', alignItems: 'center', gap: '0.4rem',
        background: 'transparent', border: 'none', cursor: 'pointer',
        color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)',
        marginBottom: '1.4rem', padding: 0,
      }}>
        <ArrowLeft size={14} /> Back to employees
      </button>

      {/* ── Hero header card ─────────────────────────────────────────── */}
      <div
        className="hrms-card"
        style={{
          padding: '2.4rem',
          marginBottom: '1.6rem',
          background: 'linear-gradient(135deg, var(--color-vr-blue-1) 0%, var(--color-neutral-1) 60%)',
          border: '1px solid var(--color-vr-blue-2)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Decorative background circle */}
        <div aria-hidden style={{
          position: 'absolute', top: -60, right: -60,
          width: 240, height: 240, borderRadius: '50%',
          background: 'radial-gradient(closest-side, rgba(28,80,157,0.08), transparent)',
          pointerEvents: 'none',
        }} />

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '2rem', flexWrap: 'wrap', position: 'relative' }}>

          {/* Avatar */}
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            background: 'var(--color-vr-blue-6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--color-neutral-1)',
            fontFamily: 'var(--font-jk-bd)', fontWeight: 700,
            fontSize: 'var(--text-fs-28)', flexShrink: 0,
            boxShadow: '0 4px 12px rgba(28,80,157,0.25)',
            border: '3px solid var(--color-neutral-1)',
          }}>
            {displayName.charAt(0).toUpperCase()}
          </div>

          {/* Main info */}
          <div style={{ flex: 1, minWidth: 260 }}>
            {/* Name + badges */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
              <h1 style={{
                margin: 0, color: 'var(--color-neutral-10)',
                fontFamily: 'var(--font-jk-bd)', fontWeight: 700,
                fontSize: 'var(--text-fs-24)', lineHeight: 1.2,
              }}>
                {displayName}
              </h1>
              <StatusBadge status={emp.employeeStatus} />
              {emp.immigrationAlerts.length > 0 && (
                <Badge variant="danger" dot>{emp.immigrationAlerts.length} visa alert{emp.immigrationAlerts.length > 1 ? 's' : ''}</Badge>
              )}
              {emp.digitalWorkerMeta.isDigitalWorker && (
                <Badge variant="cyan">AI Agent</Badge>
              )}
            </div>

            {/* Title + dept */}
            <p style={{
              margin: 0, marginBottom: '1rem',
              color: 'var(--color-vr-blue-7)',
              fontFamily: 'var(--font-in-sb)', fontWeight: 600,
              fontSize: 'var(--text-fs-16)',
            }}>
              {emp.jobTitle}
              <span style={{ color: 'var(--color-neutral-7)', fontFamily: 'var(--font-in-rg)', fontWeight: 400 }}>
                {' '}·{' '}{emp.departmentName}
              </span>
            </p>

            {/* Contact row */}
            <div style={{ display: 'flex', gap: '1.4rem', flexWrap: 'wrap', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
              {emp.reveal.email && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Mail size={13} style={{ color: 'var(--color-vr-blue-5)' }} />
                  {emp.reveal.email}
                </span>
              )}
              {emp.reveal.phone && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Phone size={13} style={{ color: 'var(--color-vr-blue-5)' }} />
                  {emp.reveal.phone}
                </span>
              )}
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <MapPin size={13} style={{ color: 'var(--color-vr-blue-5)' }} />
                {emp.countryCode} · {emp.timezone}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Building2 size={13} style={{ color: 'var(--color-vr-blue-5)' }} />
                {emp.departmentCode}
              </span>
              <span style={{ fontFamily: 'monospace', color: 'var(--color-neutral-6)', fontSize: 11 }}>
                {emp.employeeCode}
              </span>
            </div>
          </div>

          {/* Quick stats */}
          <div style={{
            display: 'flex', gap: '0',
            background: 'var(--color-neutral-1)',
            borderRadius: '1rem', border: '1px solid var(--color-stroke)',
            boxShadow: 'var(--shadow-card)',
            overflow: 'hidden',
            alignSelf: 'flex-start',
          }}>
            {[
              { label: 'Tenure',        value: `${tenureYears}y` },
              { label: 'Skills',        value: emp.skills.length },
              { label: 'Active Grants', value: emp.vestingSchedules.filter((g) => g.status === 'active').length },
              { label: 'Leaves',        value: leaves.length },
            ].map(({ label, value }, i, arr) => (
              <div key={label} style={{
                padding: '1.2rem 1.8rem', textAlign: 'center',
                borderRight: i < arr.length - 1 ? '1px solid var(--color-stroke)' : 'none',
              }}>
                <p style={{
                  margin: 0,
                  fontFamily: 'var(--font-jk-bd)', fontWeight: 700,
                  fontSize: 'var(--text-fs-22)',
                  color: 'var(--color-vr-blue-7)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {value}
                </p>
                <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 10, marginTop: 2 }}>{label}</p>
              </div>
            ))}
          </div>

          {/* Edit actions */}
          <div style={{ display: 'flex', gap: '0.6rem', alignSelf: 'flex-start', flexShrink: 0 }}>
            {editing ? (
              <>
                <button onClick={saveEdit} disabled={saving} className="hrms-btn-primary">
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save
                </button>
                <button onClick={() => setEditing(false)} className="hrms-btn-ghost">
                  <X size={13} /> Cancel
                </button>
              </>
            ) : (
              <button onClick={startEdit} className="hrms-btn-ghost">
                <Edit2 size={13} /> Edit Profile
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Risk / trust strip ──────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1rem', marginBottom: '1.4rem' }}>
        <StatCard title="Burnout Risk"   value={`${Math.round(emp.burnoutRiskScore * 100)}%`} icon={AlertTriangle}
                  accent={emp.burnoutRiskScore >= 0.7 ? 'red' : emp.burnoutRiskScore >= 0.4 ? 'amber' : 'green'} />
        <StatCard title="Flight Risk"    value={`${Math.round(emp.flightRiskScore * 100)}%`} icon={TrendingUp}
                  accent={emp.flightRiskScore >= 0.7 ? 'red' : emp.flightRiskScore >= 0.4 ? 'amber' : 'green'} />
        <StatCard title="Device Trust"   value={emp.deviceTrustState.trustLevel.replace(/_/g, ' ')} icon={Laptop}
                  accent={emp.deviceTrustState.trustLevel === 'trusted' ? 'green' : emp.deviceTrustState.trustLevel === 'conditional' ? 'amber' : 'red'} />
        <StatCard title="Tenure"         value={`${tenureYears}y`} icon={Clock} accent="blue"
                  subtitle={`Hired ${formatDate(emp.hireDate)}`} />
        {emp.engagementPct !== undefined && (
          <StatCard title="Engagement" value={`${Math.round(emp.engagementPct)}%`} icon={UserCheck} accent="green" />
        )}
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────── */}
      <Tabs
        tabs={buildTabs(isHR).map((t) => ({
          ...t,
          count: t.key === 'skills'      ? emp.skills.length
               : t.key === 'equity'      ? emp.vestingSchedules.length
               : t.key === 'assets'      ? emp.provisionedAssets.length
               : t.key === 'immigration' ? emp.immigrationRecords.filter((r) => r.status === 'active').length
               : t.key === 'leaves'      ? leaves.length
               : undefined,
        }))}
        active={tab}
        onChange={setTab}
      />

      <div style={{ marginTop: '1.6rem', minHeight: 480 }}>

        {/* ── OVERVIEW ────────────────────────────────────────────────── */}
        {tab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.4rem' }}>
            <Sect title="Contact Details" icon={<User size={14} />}>
              <FR label="Full Name"    value={emp.reveal.fullName ?? '— (role limited)'}  />
              <FR label="Work Email"   value={emp.reveal.email    ?? '— (role limited)'}  />
              <FR label="Phone"        value={emp.reveal.phone    ?? '—'}                 />
              <FR label="Country"      value={emp.countryCode}                            />
              <FR label="Timezone"     value={emp.timezone}                               />
              {emp.reveal.bankAccount && (
                <FR label="Bank Account" value={emp.reveal.bankAccount} mono />
              )}
            </Sect>

            <Sect title="Risk Signals" icon={<Shield size={14} />}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <RiskBar score={emp.burnoutRiskScore} label="Burnout" />
                <RiskBar score={emp.flightRiskScore}  label="Flight risk" />
              </div>
              {emp.riskComputedAt && (
                <p style={{ margin: '0.8rem 0 0', color: 'var(--color-neutral-6)', fontSize: 10 }}>
                  Computed {formatRelativeTime(emp.riskComputedAt)}
                </p>
              )}
            </Sect>

            <Sect title="Milestones" icon={<Calendar size={14} />}>
              <FR label="Hire date"       value={formatDate(emp.hireDate)}                                    />
              <FR label="Tenure"          value={`${tenureYears} years`}                                      />
              {emp.probationEndDate &&   <FR label="Probation end"  value={formatDate(emp.probationEndDate)} />}
              {emp.nextReviewDate   &&   <FR label="Next review"    value={formatDate(emp.nextReviewDate)}   />}
              {emp.lastPromotionDate &&  <FR label="Last promotion" value={formatDate(emp.lastPromotionDate)} />}
              <FR label="Last updated"   value={formatRelativeTime(emp.updatedAt)}                            />
            </Sect>

            <EmergencyContactCard
              employeeId={emp._id}
              initialContact={(emp as EmployeeDetail & { emergencyContact?: EmergencyContact }).emergencyContact}
              onSaved={load}
            />

            {/* HR-only: sidebar visibility shortcut */}
            {isHR && (
              <div className="hrms-card" style={{ padding: '1.2rem 1.4rem', cursor: 'pointer' }} onClick={() => setTab('access')}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <SlidersHorizontal size={14} style={{ color: 'var(--color-vr-blue-6)' }} />
                    <div>
                      <p style={{ margin: 0, fontFamily: 'var(--font-in-sb)', fontWeight: 600, fontSize: 'var(--text-fs-13)', color: 'var(--color-neutral-10)' }}>
                        Sidebar Visibility
                      </p>
                      <p style={{ margin: 0, fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-6)' }}>
                        {hiddenTabs.length === 0
                          ? 'All navigation items visible'
                          : `${hiddenTabs.length} item${hiddenTabs.length !== 1 ? 's' : ''} hidden`}
                      </p>
                    </div>
                  </div>
                  <span style={{ fontSize: 11, fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-vr-blue-6)' }}>
                    Manage →
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── EMPLOYMENT ──────────────────────────────────────────────── */}
        {tab === 'employment' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
            {/* Edit banner */}
            {editing && (
              <div style={{
                padding: '0.8rem 1.2rem', borderRadius: '0.8rem',
                background: 'var(--color-vr-blue-1)', border: '1px solid var(--color-vr-blue-2)',
                display: 'flex', alignItems: 'center', gap: '0.8rem',
                fontSize: 'var(--text-fs-12)', color: 'var(--color-vr-blue-8)',
                fontFamily: 'var(--font-in-sb)', fontWeight: 600,
              }}>
                <Edit2 size={13} />
                Editing mode — modify fields below and click Save to apply changes.
              </div>
            )}

            {/* Two-column grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '1.4rem' }}>

              {/* Position & Role */}
              <div className="hrms-card" style={{ padding: '1.8rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.4rem', paddingBottom: '1rem', borderBottom: '1px solid var(--color-stroke)' }}>
                  <Building2 size={15} style={{ color: 'var(--color-vr-blue-6)' }} />
                  <h3 style={{ margin: 0, color: 'var(--color-neutral-10)', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-14)' }}>
                    Position &amp; Role
                  </h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  <DetailRow label="Employee Code"   mono>{emp.employeeCode}</DetailRow>
                  <DetailRow label="Job Title">
                    {editing
                      ? <EI field="jobTitle" edits={edits} setEdits={setEdits} />
                      : <span style={{ fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-10)' }}>{emp.jobTitle}</span>}
                  </DetailRow>
                  <DetailRow label="Department">
                    <span style={{ fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>{emp.departmentName}</span>
                    <span style={{ color: 'var(--color-neutral-6)', fontSize: 10, marginLeft: 4, fontFamily: 'monospace' }}>({emp.departmentCode})</span>
                  </DetailRow>
                  {emp.costCenterCode && (
                    <DetailRow label="Cost Center" mono>{emp.costCenterCode}</DetailRow>
                  )}
                  <DetailRow label="Reporting to">
                    {editing
                      ? <EI field="managerName" edits={edits} setEdits={setEdits} placeholder="Manager name" />
                      : <span style={{ fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>{emp.managerName ?? '— Not assigned'}</span>}
                  </DetailRow>
                  <DetailRow label="Status">
                    {editing
                      ? <ES field="employeeStatus" edits={edits} setEdits={setEdits} options={EMPLOYEE_STATUSES} />
                      : <StatusBadge status={emp.employeeStatus} />}
                  </DetailRow>
                  <DetailRow label="Employment Type">
                    {editing
                      ? <ES field="employmentType" edits={edits} setEdits={setEdits} options={EMPLOYMENT_TYPES} />
                      : <span style={{ textTransform: 'capitalize', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>{emp.employmentType.replace(/_/g, ' ')}</span>}
                  </DetailRow>
                </div>
              </div>

              {/* Compensation */}
              <div className="hrms-card" style={{ padding: '1.8rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.4rem', paddingBottom: '1rem', borderBottom: '1px solid var(--color-stroke)' }}>
                  <DollarSign size={15} style={{ color: 'var(--color-semantics-green-7)' }} />
                  <h3 style={{ margin: 0, color: 'var(--color-neutral-10)', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-14)' }}>
                    Compensation
                  </h3>
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--color-neutral-6)', fontFamily: 'var(--font-in-md)' }}>
                    Values are AES-256-GCM encrypted at rest
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  <DetailRow label="Currency" mono>{emp.currencyCode}</DetailRow>
                  <DetailRow label="Pay Frequency">
                    <span style={{ textTransform: 'capitalize', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>{emp.payFrequency.replace(/_/g, ' ')}</span>
                  </DetailRow>
                  <DetailRow label="Salary Band">
                    {editing
                      ? <EI field="salaryBand" edits={edits} setEdits={setEdits} placeholder="e.g. IC4, L5, Band-B" />
                      : <span style={{ fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>{emp.salaryBand ?? '— Not set'}</span>}
                  </DetailRow>
                  <DetailRow label="Base Salary">
                    {emp.reveal.baseSalary != null ? (
                      <span style={{ fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
                        {formatCurrency(Number(emp.reveal.baseSalary), emp.currencyCode)}
                        <span style={{ fontSize: 10, color: 'var(--color-neutral-5)', marginLeft: 4, fontFamily: 'var(--font-in-md)', fontWeight: 400 }}>/ month</span>
                      </span>
                    ) : (
                      <span style={{ color: 'var(--color-neutral-6)', fontSize: 11, fontFamily: 'var(--font-in-md)' }}>
                        Encrypted · payroll access required
                      </span>
                    )}
                  </DetailRow>
                  {emp.reveal.bankAccount && (
                    <DetailRow label="Bank Account" mono>{emp.reveal.bankAccount}</DetailRow>
                  )}
                  <DetailRow label="Equity Grants">
                    <span style={{ fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
                      {emp.vestingSchedules.filter((g) => g.status === 'active').length} active grant{emp.vestingSchedules.filter((g) => g.status === 'active').length !== 1 ? 's' : ''}
                    </span>
                  </DetailRow>
                </div>
              </div>

              {/* Timeline & Dates */}
              <div className="hrms-card" style={{ padding: '1.8rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.4rem', paddingBottom: '1rem', borderBottom: '1px solid var(--color-stroke)' }}>
                  <Calendar size={15} style={{ color: 'var(--color-semantics-orange-7)' }} />
                  <h3 style={{ margin: 0, color: 'var(--color-neutral-10)', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-14)' }}>
                    Timeline
                  </h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  <DetailRow label="Hire Date">
                    <span style={{ fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>{formatDate(emp.hireDate)}</span>
                    <span style={{ color: 'var(--color-neutral-6)', fontSize: 10, marginLeft: 6 }}>({tenureYears}y tenure)</span>
                  </DetailRow>
                  {emp.probationEndDate && (
                    <DetailRow label="Probation Ends">
                      <span style={{ fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>{formatDate(emp.probationEndDate)}</span>
                    </DetailRow>
                  )}
                  <DetailRow label="Next Review">
                    {editing
                      ? <EI field="nextReviewDate" edits={edits} setEdits={setEdits} type="date" />
                      : <span style={{ fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>{emp.nextReviewDate ? formatDate(emp.nextReviewDate) : '— Not scheduled'}</span>}
                  </DetailRow>
                  {emp.lastPromotionDate && (
                    <DetailRow label="Last Promotion">
                      <span style={{ fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>{formatDate(emp.lastPromotionDate)}</span>
                    </DetailRow>
                  )}
                  <DetailRow label="Record Created">
                    <span style={{ fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>{formatDate(emp.createdAt)}</span>
                  </DetailRow>
                  <DetailRow label="Last Modified">
                    <span style={{ fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>{formatRelativeTime(emp.updatedAt)}</span>
                  </DetailRow>
                </div>
              </div>

              {/* Localisation */}
              <div className="hrms-card" style={{ padding: '1.8rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.4rem', paddingBottom: '1rem', borderBottom: '1px solid var(--color-stroke)' }}>
                  <Globe size={15} style={{ color: 'var(--color-semantics-blue-6)' }} />
                  <h3 style={{ margin: 0, color: 'var(--color-neutral-10)', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-14)' }}>
                    Localisation
                  </h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  <DetailRow label="Country Code">
                    {editing
                      ? (
                        <select value={edits['countryCode'] ?? ''} onChange={(e) => setEdits((p) => ({ ...p, countryCode: e.target.value }))}
                                className="hrms-input" style={{ padding: '0.4rem 0.8rem', maxWidth: 200 }}>
                          {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.label} ({c.code})</option>)}
                        </select>
                      )
                      : <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 'var(--text-fs-14)' }}>{emp.countryCode}</span>}
                  </DetailRow>
                  <DetailRow label="Timezone">
                    {editing
                      ? <ES field="timezone" edits={edits} setEdits={setEdits} options={TIMEZONES} />
                      : <span style={{ fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>{emp.timezone}</span>}
                  </DetailRow>
                  <DetailRow label="Locale" mono>{emp.locale}</DetailRow>
                  <DetailRow label="Immigration Alerts">
                    {emp.immigrationAlerts.length > 0
                      ? <Badge variant="danger" dot>{emp.immigrationAlerts.length} alert{emp.immigrationAlerts.length > 1 ? 's' : ''}</Badge>
                      : <Badge variant="success">Clear</Badge>}
                  </DetailRow>
                  <DetailRow label="Active Visas">
                    <span style={{ fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
                      {emp.immigrationRecords.filter((r) => r.status === 'active').length} record{emp.immigrationRecords.filter((r) => r.status === 'active').length !== 1 ? 's' : ''}
                    </span>
                  </DetailRow>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── SKILLS ──────────────────────────────────────────────────── */}
        {tab === 'skills' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
              <button onClick={() => setSkillModal(true)} className="hrms-btn-primary">
                <Plus size={13} /> Add Skill
              </button>
            </div>
            {emp.skills.length === 0
              ? <EmptyState icon={TrendingUp} title="No skills on record"
                            action={<button onClick={() => setSkillModal(true)} className="hrms-btn-primary"><Plus size={12} /> Add first skill</button>} />
              : (
                <div className="hrms-card" style={{ padding: 0, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-fs-12)' }}>
                    <thead>
                      <tr>
                        {['Skill','Category','Proficiency','Verified via','Endorsements',''].map((h) => (
                          <th key={h} className="hrms-th">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {emp.skills.map((s, i) => (
                        <tr key={i}>
                          <td className="hrms-td" style={{ fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>{s.skillName}</td>
                          <td className="hrms-td" style={{ color: 'var(--color-neutral-7)' }}>{s.category}</td>
                          <td className="hrms-td"><ProfBadge level={s.proficiency} /></td>
                          <td className="hrms-td" style={{ color: 'var(--color-neutral-7)', textTransform: 'capitalize' }}>{s.verifiedVia.replace(/_/g, ' ')}</td>
                          <td className="hrms-td" style={{ fontVariantNumeric: 'tabular-nums' }}>{s.endorsementCount}</td>
                          <td className="hrms-td">
                            <button onClick={() => removeSkill(s.skillSlug)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-semantics-red-6)', padding: 4 }}>
                              <Trash2 size={12} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            {/* Add skill modal */}
            <Modal open={skillModal} onClose={() => setSkillModal(false)} title="Add Skill" width={440}
                   footer={
                     <>
                       <button onClick={() => setSkillModal(false)} className="hrms-btn-ghost">Cancel</button>
                       <button onClick={addSkill} disabled={savingSkill} className="hrms-btn-primary">
                         {savingSkill ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                         Add Skill
                       </button>
                     </>
                   }>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <SFM label="Skill Slug (unique identifier)">
                  <input value={newSkill.skillSlug} onChange={(e) => setNewSkill({ ...newSkill, skillSlug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                         className="hrms-input" placeholder="react-js, aws-lambda…" />
                </SFM>
                <SFM label="Skill Name">
                  <input value={newSkill.skillName} onChange={(e) => setNewSkill({ ...newSkill, skillName: e.target.value })}
                         className="hrms-input" placeholder="React.js" />
                </SFM>
                <SFM label="Category">
                  <input value={newSkill.category} onChange={(e) => setNewSkill({ ...newSkill, category: e.target.value })}
                         className="hrms-input" placeholder="Frontend, Cloud, Data…" />
                </SFM>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                  <SFM label="Proficiency">
                    <select value={newSkill.proficiency} onChange={(e) => setNewSkill({ ...newSkill, proficiency: e.target.value })} className="hrms-input">
                      {SKILL_PROFICIENCIES.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </SFM>
                  <SFM label="Verified via">
                    <select value={newSkill.verifiedVia} onChange={(e) => setNewSkill({ ...newSkill, verifiedVia: e.target.value })} className="hrms-input">
                      {SKILL_VERIFIED_VIA.map((v) => <option key={v} value={v}>{v.replace(/_/g, ' ')}</option>)}
                    </select>
                  </SFM>
                </div>
              </div>
            </Modal>
          </div>
        )}

        {/* ── EQUITY ──────────────────────────────────────────────────── */}
        {tab === 'equity' && <EquityVestingTimeline grants={emp.vestingSchedules} />}

        {/* ── ASSETS ──────────────────────────────────────────────────── */}
        {tab === 'assets' && <AssetsRegistry assets={emp.provisionedAssets} />}

        {/* ── IMMIGRATION ─────────────────────────────────────────────── */}
        {tab === 'immigration' && <ImmigrationNexusTracker records={emp.immigrationRecords} />}

        {/* ── LEAVES ──────────────────────────────────────────────────── */}
        {tab === 'leaves' && (
          leaves.length === 0
            ? <EmptyState icon={Calendar} title="No leave history" message="Leave requests submitted by this employee will appear here." />
            : (
              <div className="hrms-card" style={{ padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-fs-12)' }}>
                  <thead>
                    <tr>{['Type','Period','Days','Reason','Status','Actions'].map((h) => <th key={h} className="hrms-th">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {leaves.map((l) => (
                      <tr key={l._id}>
                        <td className="hrms-td" style={{ textTransform: 'capitalize' }}>{l.leaveType.replace('_',' ')}</td>
                        <td className="hrms-td" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatDate(l.startDate)} – {formatDate(l.endDate)}</td>
                        <td className="hrms-td" style={{ textAlign: 'center', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>{l.totalDays}</td>
                        <td className="hrms-td" style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-neutral-7)' }}>{l.reason}</td>
                        <td className="hrms-td"><StatusBadge status={l.status} /></td>
                        <td className="hrms-td">
                          {l.status === 'pending' && (
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button onClick={() => actOnLeave(l._id, 'approve')} disabled={!!actingLeave} className="hrms-btn-ghost"
                                      style={{ padding: '0.3rem 0.7rem', fontSize: 10, color: 'var(--color-semantics-green-7)', borderColor: 'var(--color-semantics-green-3)' }}>
                                {actingLeave === l._id + 'approve' ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle size={10} />} Approve
                              </button>
                              <button onClick={() => actOnLeave(l._id, 'reject')} disabled={!!actingLeave} className="hrms-btn-ghost"
                                      style={{ padding: '0.3rem 0.7rem', fontSize: 10, color: 'var(--color-semantics-red-6)', borderColor: 'var(--color-semantics-red-2)' }}>
                                {actingLeave === l._id + 'reject' ? <Loader2 size={10} className="animate-spin" /> : <X size={10} />} Reject
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
        )}

        {/* ── SECURITY ────────────────────────────────────────────────── */}
        {tab === 'security' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.4rem' }}>
            <Sect title="Device Trust State" icon={<Laptop size={14} />}>
              <FR label="Trust Level"><StatusBadge status={emp.deviceTrustState.trustLevel} /></FR>
              <FR label="Compliance Score" value={`${emp.deviceTrustState.complianceScore} / 100`} />
              <FR label="Token Throttle"   value={`${Math.round(emp.deviceTrustState.accessTokenThrottle * 100)}%`} />
              {emp.deviceTrustState.lastHeartbeatAt && (
                <FR label="Last Heartbeat" value={formatRelativeTime(emp.deviceTrustState.lastHeartbeatAt)} />
              )}
              <div style={{ marginTop: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {[
                  { label: 'Disk encrypted',    val: emp.deviceTrustState.diskEncrypted },
                  { label: 'OS patch current',  val: emp.deviceTrustState.osPatchCurrent },
                  { label: 'MDM profile',        val: emp.deviceTrustState.mdmProfileActive },
                  { label: 'EDR agent',          val: emp.deviceTrustState.edrAgentActive },
                  { label: 'Firewall enabled',   val: emp.deviceTrustState.firewallEnabled },
                ].map(({ label, val }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>{label}</span>
                    <Badge variant={val ? 'success' : 'danger'}>{val ? 'Yes' : 'No'}</Badge>
                  </div>
                ))}
              </div>
            </Sect>

            <Sect title="Identity Verification" icon={<Shield size={14} />}>
              <FR label="Status"><StatusBadge status={emp.identityVerification.verificationStatus} /></FR>
              <FR label="Liveness">
                <Badge variant={emp.identityVerification.livenessCheckPassed ? 'success' : 'warning'}>
                  {emp.identityVerification.livenessCheckPassed ? 'Passed' : 'Not passed'}
                </Badge>
              </FR>
              <FR label="Failed attempts" value={String(emp.identityVerification.failedAttempts)} />
              {emp.identityVerification.verifiedAt && (
                <FR label="Verified at" value={formatDate(emp.identityVerification.verifiedAt)} />
              )}
            </Sect>

            {emp.digitalWorkerMeta.isDigitalWorker && (
              <Sect title="Digital Worker" icon={<Activity size={14} />}>
                <FR label="Framework"   value={emp.digitalWorkerMeta.agentFramework ?? '—'} />
                <FR label="Model"       value={emp.digitalWorkerMeta.modelVersion ?? '—'} />
                <FR label="Token budget">
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {(emp.digitalWorkerMeta.tokenBudgetUsed / 1000).toFixed(0)}k
                    {' / '}{(emp.digitalWorkerMeta.tokenBudgetMonthly / 1000).toFixed(0)}k
                  </span>
                </FR>
                <FR label="MTD cost" value={`$${emp.digitalWorkerMeta.apiCostMtd.toFixed(2)}`} />
              </Sect>
            )}
          </div>
        )}

        {/* ── PAYSLIPS ────────────────────────────────────────────────── */}
        {tab === 'payslips' && isHR && (
          <EmployeePayslips employeeId={emp._id} currencyCode={emp.currencyCode} />
        )}

        {/* ── ACTIVITY ────────────────────────────────────────────────── */}
        {tab === 'audit' && (
          <EmployeeAuditFeed employeeId={emp._id} />
        )}

        {tab === 'access' && isHR && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            <div className="hrms-card" style={{ padding: '1.4rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
                <SlidersHorizontal size={14} style={{ color: 'var(--color-vr-blue-6)' }} />
                <h3 className="hrms-section-label" style={{ margin: 0 }}>Sidebar Visibility</h3>
              </div>
              <p style={{ margin: '0 0 1.2rem', fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-7)' }}>
                Toggle which navigation items this employee can see in their sidebar.
                Hidden items are removed from their view immediately after saving.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {HIDEABLE_NAV.map(({ href, label }) => {
                  const hidden = hiddenTabs.includes(href);
                  return (
                    <div key={href}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '0.7rem 1rem', borderRadius: '0.7rem',
                        border: `1px solid ${hidden ? 'var(--color-semantics-red-3)' : 'var(--color-stroke)'}`,
                        background: hidden ? '#FFF5F5' : 'var(--color-neutral-1)',
                        transition: 'all 150ms ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        {hidden
                          ? <EyeOff size={14} style={{ color: 'var(--color-semantics-red-6)', flexShrink: 0 }} />
                          : <Eye    size={14} style={{ color: 'var(--color-semantics-green-7)', flexShrink: 0 }} />
                        }
                        <span style={{
                          fontFamily: 'var(--font-in-sb)', fontWeight: 600,
                          fontSize: 'var(--text-fs-12)',
                          color: hidden ? 'var(--color-neutral-6)' : 'var(--color-neutral-10)',
                          textDecoration: hidden ? 'line-through' : 'none',
                        }}>
                          {label}
                        </span>
                        <code style={{ fontSize: 10, color: 'var(--color-neutral-5)', background: 'var(--color-neutral-3)', padding: '0.1rem 0.4rem', borderRadius: 3 }}>
                          {href}
                        </code>
                      </div>
                      {/* Toggle switch */}
                      <button
                        onClick={() => toggleTab(href)}
                        style={{
                          width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
                          background: hidden ? 'var(--color-semantics-red-5)' : 'var(--color-semantics-green-6)',
                          position: 'relative', transition: 'background 200ms ease', flexShrink: 0,
                        }}
                        title={hidden ? 'Click to show' : 'Click to hide'}
                      >
                        <span style={{
                          position: 'absolute', top: 3,
                          left: hidden ? 3 : 21,
                          width: 16, height: 16, borderRadius: '50%', background: '#fff',
                          transition: 'left 200ms ease',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                        }} />
                      </button>
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: '1.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ margin: 0, fontSize: 11, color: 'var(--color-neutral-6)' }}>
                  {hiddenTabs.length === 0
                    ? 'All navigation items are visible to this employee.'
                    : `${hiddenTabs.length} item${hiddenTabs.length !== 1 ? 's' : ''} hidden from this employee's sidebar.`
                  }
                </p>
                <button onClick={saveAccessControl} disabled={savingAccess} className="hrms-btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.6rem 1.2rem' }}>
                  {savingAccess ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit feed for this employee
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Payslips tab — HR/payroll-officer view with decrypted salary figures
// ─────────────────────────────────────────────────────────────────────────────

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const SLIP_STATUS_VARIANT: Record<string, Parameters<typeof Badge>[0]['variant']> = {
  paid:             'success',
  approved:         'info',
  processing:       'warning',
  audit_passed:     'info',
  audit_failed:     'danger',
  reversed:         'danger',
  draft:            'neutral',
  cancelled:        'neutral',
};

function EmployeePayslips({ employeeId, currencyCode }: { employeeId: string; currencyCode: string }) {
  const [slips,   setSlips]   = useState<PayslipStub[]>([]);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/ws/employees/${employeeId}/payslips`)
      .then((r) => r.json())
      .then((d) => { if (d.error) setErr(d.error); else setSlips(d.data ?? []); })
      .catch(() => setErr('Failed to load payslips'))
      .finally(() => setLoading(false));
  }, [employeeId]);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
      <Loader2 size={18} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
    </div>
  );
  if (err) return (
    <div className="hrms-card" style={{ padding: '1.4rem', color: 'var(--color-semantics-red-6)', fontSize: 'var(--text-fs-12)' }}>
      {err}
    </div>
  );
  if (slips.length === 0) return (
    <EmptyState icon={Receipt} title="No payslips yet"
      message="Payslips appear here once payroll runs are processed and include this employee." />
  );

  const colGrid = '110px 1fr 1fr 1fr 80px 90px';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {/* Column headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: colGrid, gap: '1rem',
        padding: '0.5rem 1.4rem',
      }}>
        {['Period','Base Salary','Gross Pay','Net Pay','Days','Status'].map((h) => (
          <span key={h} style={{ fontSize: 10, color: 'var(--color-neutral-6)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', textAlign: h === 'Period' ? 'left' : 'right' }}>
            {h}
          </span>
        ))}
      </div>

      {slips.map((s) => {
        const cc = s.currencyCode || currencyCode;
        const fmt = (n: number | null) => n != null ? formatCurrency(n, cc) : '—';
        return (
          <div key={s._id} className="hrms-card" style={{
            display: 'grid', gridTemplateColumns: colGrid, gap: '1rem',
            padding: '0.85rem 1.4rem', alignItems: 'center',
            borderLeft: s.varianceFlag ? '3px solid var(--color-semantics-amber-6)' : undefined,
          }}>
            <div>
              <p style={{ margin: 0, fontFamily: 'var(--font-in-sb)', fontWeight: 600, fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-10)' }}>
                {MONTH_SHORT[s.month - 1]} {s.year}
              </p>
              <p style={{ margin: 0, fontSize: 10, color: 'var(--color-neutral-5)', fontVariantNumeric: 'tabular-nums' }}>
                {s.runCode}
              </p>
            </div>
            <p style={{ margin: 0, textAlign: 'right', fontSize: 'var(--text-fs-12)', fontVariantNumeric: 'tabular-nums', color: 'var(--color-neutral-7)' }}>
              {fmt(s.baseSalary)}
            </p>
            <p style={{ margin: 0, textAlign: 'right', fontSize: 'var(--text-fs-12)', fontVariantNumeric: 'tabular-nums', color: 'var(--color-neutral-8)' }}>
              {fmt(s.grossSalary)}
            </p>
            <p style={{ margin: 0, textAlign: 'right', fontFamily: 'var(--font-in-sb)', fontWeight: 700, fontSize: 'var(--text-fs-12)', fontVariantNumeric: 'tabular-nums', color: 'var(--color-neutral-10)' }}>
              {fmt(s.netSalary)}
            </p>
            <div style={{ textAlign: 'right', fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-7)' }}>
              {s.attendanceDays != null ? `${s.attendanceDays}d` : '—'}
              {s.leaveDaysDeducted > 0 && (
                <span style={{ display: 'block', fontSize: 10, color: 'var(--color-semantics-amber-6)' }}>
                  -{s.leaveDaysDeducted} leave
                </span>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
              <Badge variant={SLIP_STATUS_VARIANT[s.status] ?? 'neutral'}>
                {s.status.replace(/_/g, ' ')}
              </Badge>
              <a
                href={`/api/payroll/payslip?runId=${s._id}&employeeId=${employeeId}`}
                target="_blank" rel="noreferrer"
                className="hrms-btn-ghost"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '0.25rem 0.6rem', fontSize: 11 }}
                onClick={(e) => e.stopPropagation()}
              >
                <Receipt size={10} /> PDF
              </a>
            </div>
          </div>
        );
      })}

      <p style={{ marginTop: '0.6rem', fontSize: 11, color: 'var(--color-neutral-5)', textAlign: 'center' }}>
        Showing last {slips.length} payroll period{slips.length !== 1 ? 's' : ''} · Salary figures decrypted in-session, never stored in plain text
      </p>
    </div>
  );
}

function EmployeeAuditFeed({ employeeId }: { employeeId: string }) {
  const [logs,    setLogs]    = useState<Array<{ _id: string; actionType: string; createdAt: string; changeSummary?: Record<string, unknown>; actorRole?: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/ws/audit?limit=20&targetDocumentId=${employeeId}`)
      .then((r) => r.json())
      .then((d) => setLogs(d.data ?? []))
      .finally(() => setLoading(false));
  }, [employeeId]);

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}><Loader2 size={18} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} /></div>;
  if (logs.length === 0) return <EmptyState icon={Activity} title="No activity recorded" message="Changes made to this employee's record will appear here." />;

  return (
    <div className="hrms-card" style={{ padding: 0, overflow: 'hidden' }}>
      {logs.map((entry) => (
        <div key={entry._id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.8rem 1.4rem', borderBottom: '1px solid var(--color-neutral-4)' }}>
          <div style={{ width: 3, height: 28, borderRadius: 2, background: 'var(--color-vr-blue-4)', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, color: 'var(--color-neutral-10)', fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
              {entry.actionType.replace(/_/g, ' ')}
            </p>
            {entry.actorRole && (
              <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 10 }}>
                by {entry.actorRole.replace(/_/g, ' ')}
              </p>
            )}
          </div>
          <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 10, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
            {formatRelativeTime(entry.createdAt)}
          </p>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Local helper components
// ─────────────────────────────────────────────────────────────────────────────

function Sect({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="hrms-card" style={{ padding: '1.2rem 1.4rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.8rem' }}>
        {icon}
        <h3 className="hrms-section-label" style={{ margin: 0 }}>{title}</h3>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>{children}</div>
    </div>
  );
}

function FR({ label, value, mono = false, children }: {
  label: string; value?: React.ReactNode; mono?: boolean; children?: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.8rem' }}>
      <span style={{ color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)', flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--color-neutral-10)', fontFamily: mono ? 'monospace' : 'var(--font-in-sb)', fontWeight: 600, fontSize: 'var(--text-fs-12)', textAlign: 'right' }}>
        {children ?? value ?? '—'}
      </span>
    </div>
  );
}

function EI({ field, edits, setEdits, placeholder, maxLength, type = 'text' }: {
  field: string; edits: Record<string, string>;
  setEdits: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  placeholder?: string; maxLength?: number; type?: string;
}) {
  return (
    <input type={type} value={edits[field] ?? ''} maxLength={maxLength}
           onChange={(e) => setEdits((p) => ({ ...p, [field]: e.target.value }))}
           className="hrms-input" placeholder={placeholder}
           style={{ padding: '0.4rem 0.8rem', minWidth: 0, maxWidth: 200 }} />
  );
}

// ── DetailRow — full-width label/value divider row for the employment tab ──
function DetailRow({ label, mono = false, children }: {
  label: string; mono?: boolean; children: React.ReactNode;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: '1.2rem', padding: '0.9rem 0',
      borderBottom: '1px solid var(--color-neutral-4)',
    }}>
      <span style={{
        color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)',
        fontFamily: 'var(--font-in-md)', fontWeight: 500, flexShrink: 0,
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: mono ? 'monospace' : undefined,
        fontSize:   'var(--text-fs-12)',
        color:      'var(--color-neutral-9)',
        textAlign:  'right', maxWidth: '60%',
        display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end',
      }}>
        {children}
      </span>
    </div>
  );
}

function ES({ field, edits, setEdits, options }: {
  field: string; edits: Record<string, string>;
  setEdits: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  options: string[];
}) {
  return (
    <select value={edits[field] ?? ''} onChange={(e) => setEdits((p) => ({ ...p, [field]: e.target.value }))}
            className="hrms-input" style={{ padding: '0.4rem 0.8rem', maxWidth: 200 }}>
      {options.map((o) => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
    </select>
  );
}

function SFM({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', marginBottom: 4, color: 'var(--color-neutral-8)', fontSize: 10, fontFamily: 'var(--font-in-sb)', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const PROF_VARIANT: Record<string, Parameters<typeof Badge>[0]['variant']> = {
  awareness: 'neutral', working: 'info', practitioner: 'warning', expert: 'success', authority: 'purple',
};
function ProfBadge({ level }: { level: string }) {
  return <Badge variant={PROF_VARIANT[level] ?? 'neutral'}>{level}</Badge>;
}
