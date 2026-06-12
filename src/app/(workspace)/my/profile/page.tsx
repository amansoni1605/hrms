'use client';

import { useEffect, useState } from 'react';
import {
  User, Mail, Phone, Briefcase, Award,
  DollarSign, Cpu, Globe, ShieldCheck, Target, Loader2, BadgeCheck, TrendingUp, Star, Activity,
} from 'lucide-react';
import { Avatar }              from '@/components/ui/Avatar';
import { Badge, StatusBadge }  from '@/components/ui/Badge';
import { RiskBar }             from '@/components/ui/RiskBar';
import { EmptyState }          from '@/components/ui/EmptyState';
import { formatDate, formatCurrency } from '@/lib/utils';

interface Profile {
  identity:   { fullName: string; email: string; phone: string | null; employeeCode: string };
  employment: {
    jobTitle: string; departmentName: string; departmentCode: string; costCenterCode: string | null;
    managerName: string | null; employeeStatus: string; employmentType: string; salaryBand: string | null;
    hireDate: string | null; tenureYears: number | null; countryCode: string; timezone: string; locale: string;
  };
  compensation: { baseSalary: number | null; currencyCode: string; payFrequency: string };
  skills: Array<{ skillName: string; proficiency: string; verifiedVia?: string; endorsementCount?: number }>;
  provisionedAssets: Array<{ assetCategory: string; provider?: string; state: string }>;
  vestingSchedules: Array<{ grantId: string; grantType: string; totalUnits: number; vestedUnits: number; unvestedUnits: number; status: string }>;
  immigrationRecords: Array<{ documentType: string; hostCountry: string; expiresAt: string; nexusRiskLevel: string; status: string }>;
  wellbeing: { burnoutRiskScore: number; flightRiskScore: number; engagementPct: number | null };
  device: { trustLevel: string | null; complianceScore: number | null };
  identityVerification: { verificationStatus: string | null; livenessCheckPassed: boolean | null };
  reviews: Array<{ _id: string; cycleLabel: string; status: string; overallRating?: number; periodStart: string; periodEnd: string }>;
  compHistory: Array<{ _id: string; cycleLabel?: string; changeType: string; currencyCode?: string; incrementPct: number; promotion: boolean; oldTitle?: string; newTitle?: string; effectiveDate: string; oldSalary: number | null; newSalary: number | null }>;
}

const card: React.CSSProperties = { marginBottom: '1.4rem' };
const sectionTitle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 1.2rem', color: 'var(--color-neutral-10)', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-16)' };
const dl: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem 2rem' };
const dtS: React.CSSProperties = { margin: 0, color: 'var(--color-neutral-7)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' };
const ddS: React.CSSProperties = { margin: '2px 0 0', color: 'var(--color-neutral-10)', fontSize: 'var(--text-fs-14)', fontFamily: 'var(--font-in-sb)', fontWeight: 600 };

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <p style={dtS}>{label}</p>
      <p style={{ ...ddS, ...(mono ? { fontFamily: 'monospace', fontWeight: 500 } : {}) }}>{value ?? '—'}</p>
    </div>
  );
}

export default function MyProfilePage() {
  const [p, setP]           = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');

  useEffect(() => {
    fetch('/api/me/profile')
      .then(async (r) => { if (!r.ok) throw new Error((await r.json()).error ?? 'Failed to load'); return r.json(); })
      .then((d) => setP(d.data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem' }}><Loader2 size={22} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} /></div>;
  if (error || !p) return <div style={{ padding: '2rem' }}><EmptyState icon={User} title="Profile unavailable" message={error || 'No employee record is linked to your account.'} /></div>;

  const cur = p.compensation.currencyCode || 'USD';

  return (
    <div style={{ padding: '2rem', maxWidth: 1000 }}>
      {/* Header card */}
      <div className="hrms-card" style={{ ...card, display: 'flex', alignItems: 'center', gap: '1.4rem', background: 'linear-gradient(90deg, var(--color-vr-blue-1) 0%, var(--color-neutral-1) 75%)', border: '1px solid var(--color-vr-blue-2)' }}>
        <Avatar name={p.identity.fullName} size="lg" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: 0, color: 'var(--color-neutral-10)', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-24)' }}>
            {p.identity.fullName}
          </h2>
          <p style={{ margin: '2px 0 0', color: 'var(--color-neutral-8)', fontSize: 'var(--text-fs-14)' }}>
            {p.employment.jobTitle} · {p.employment.departmentName}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--color-neutral-7)' }}>{p.identity.employeeCode}</span>
            <StatusBadge status={p.employment.employeeStatus} />
            <Badge variant="info">{p.employment.employmentType.replace('_', ' ')}</Badge>
            {p.employment.salaryBand && <Badge variant="purple">{p.employment.salaryBand}</Badge>}
          </div>
        </div>
      </div>

      {/* Contact & identity */}
      <div className="hrms-card" style={card}>
        <h3 style={sectionTitle}><User size={15} style={{ color: 'var(--color-vr-blue-6)' }} /> Personal & Contact</h3>
        <div style={dl}>
          <Field label="Email" value={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Mail size={12} style={{ color: 'var(--color-neutral-6)' }} />{p.identity.email}</span>} />
          <Field label="Phone" value={p.identity.phone ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Phone size={12} style={{ color: 'var(--color-neutral-6)' }} />{p.identity.phone}</span> : '—'} />
          <Field label="Country" value={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Globe size={12} style={{ color: 'var(--color-neutral-6)' }} />{p.employment.countryCode}</span>} />
          <Field label="Timezone" value={p.employment.timezone} />
          <Field label="Locale" value={p.employment.locale} />
        </div>
      </div>

      {/* Employment */}
      <div className="hrms-card" style={card}>
        <h3 style={sectionTitle}><Briefcase size={15} style={{ color: 'var(--color-vr-blue-6)' }} /> Employment</h3>
        <div style={dl}>
          <Field label="Job Title" value={p.employment.jobTitle} />
          <Field label="Department" value={`${p.employment.departmentName} (${p.employment.departmentCode})`} />
          <Field label="Manager" value={p.employment.managerName} />
          <Field label="Cost Center" value={p.employment.costCenterCode} mono />
          <Field label="Hire Date" value={p.employment.hireDate ? formatDate(p.employment.hireDate) : '—'} />
          <Field label="Tenure" value={p.employment.tenureYears != null ? `${p.employment.tenureYears} yrs` : '—'} />
          <Field label="Employment Type" value={p.employment.employmentType.replace('_', ' ')} />
          <Field label="Salary Band" value={p.employment.salaryBand} />
        </div>
      </div>

      {/* Compensation */}
      <div className="hrms-card" style={card}>
        <h3 style={sectionTitle}><DollarSign size={15} style={{ color: 'var(--color-vr-blue-6)' }} /> Compensation</h3>
        <div style={dl}>
          <Field label="Base Salary" value={p.compensation.baseSalary != null ? formatCurrency(p.compensation.baseSalary, cur) : 'Restricted'} />
          <Field label="Currency" value={cur} />
          <Field label="Pay Frequency" value={p.compensation.payFrequency} />
        </div>
        {p.compHistory.length > 0 && (
          <div style={{ marginTop: '1.4rem' }}>
            <p style={{ ...dtS, marginBottom: 8 }}>Salary History</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-fs-12)' }}>
              <thead><tr>{['Effective', 'Type', 'Change', 'From → To'].map((h) => <th key={h} className="hrms-th">{h}</th>)}</tr></thead>
              <tbody>
                {p.compHistory.map((h) => (
                  <tr key={h._id}>
                    <td className="hrms-td">{formatDate(h.effectiveDate)}{h.cycleLabel ? ` · ${h.cycleLabel}` : ''}</td>
                    <td className="hrms-td"><Badge variant={h.promotion ? 'purple' : 'info'}>{h.promotion ? 'Promotion' : h.changeType}</Badge></td>
                    <td className="hrms-td" style={{ color: 'var(--color-semantics-green-7)', fontFamily: 'var(--font-in-sb)', fontWeight: 700 }}>+{h.incrementPct}%</td>
                    <td className="hrms-td">
                      {h.oldSalary != null && h.newSalary != null
                        ? `${formatCurrency(h.oldSalary, h.currencyCode || cur)} → ${formatCurrency(h.newSalary, h.currencyCode || cur)}`
                        : (h.promotion && h.oldTitle && h.newTitle ? `${h.oldTitle} → ${h.newTitle}` : '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Performance */}
      <div className="hrms-card" style={card}>
        <h3 style={sectionTitle}><Target size={15} style={{ color: 'var(--color-vr-blue-6)' }} /> Performance</h3>
        {p.reviews.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--color-neutral-6)', fontSize: 'var(--text-fs-12)' }}>No reviews yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {p.reviews.map((r) => (
              <div key={r._id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0.6rem 0', borderBottom: '1px solid var(--color-neutral-4)' }}>
                <span style={{ flex: 1, fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-10)' }}>{r.cycleLabel}</span>
                <StatusBadge status={r.status} />
                {typeof r.overallRating === 'number' && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-in-sb)', fontWeight: 700, color: 'var(--color-semantics-orange-7)' }}>
                    <Star size={12} fill="currentColor" />{r.overallRating}/5
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Skills */}
      <div className="hrms-card" style={card}>
        <h3 style={sectionTitle}><Award size={15} style={{ color: 'var(--color-vr-blue-6)' }} /> Skills</h3>
        {p.skills.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--color-neutral-6)', fontSize: 'var(--text-fs-12)' }}>No skills recorded.</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {p.skills.map((s, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.4rem 0.8rem', borderRadius: 8, background: 'var(--color-neutral-2)', border: '1px solid var(--color-stroke)', fontSize: 'var(--text-fs-12)' }}>
                <BadgeCheck size={12} style={{ color: 'var(--color-vr-blue-6)' }} />
                <span style={{ fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-10)' }}>{s.skillName}</span>
                <Badge variant="neutral">{s.proficiency}</Badge>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Assets & Equity side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.4rem', marginBottom: '1.4rem' }}>
        <div className="hrms-card">
          <h3 style={sectionTitle}><Cpu size={15} style={{ color: 'var(--color-vr-blue-6)' }} /> Assets</h3>
          {p.provisionedAssets.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--color-neutral-6)', fontSize: 'var(--text-fs-12)' }}>No assets provisioned.</p>
          ) : p.provisionedAssets.map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--color-neutral-4)' }}>
              <span style={{ fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-9)' }}>{a.assetCategory}{a.provider ? ` · ${a.provider}` : ''}</span>
              <StatusBadge status={a.state} />
            </div>
          ))}
        </div>
        <div className="hrms-card">
          <h3 style={sectionTitle}><TrendingUp size={15} style={{ color: 'var(--color-vr-blue-6)' }} /> Equity</h3>
          {p.vestingSchedules.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--color-neutral-6)', fontSize: 'var(--text-fs-12)' }}>No equity grants.</p>
          ) : p.vestingSchedules.map((v) => (
            <div key={v.grantId} style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--color-neutral-4)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'var(--font-in-sb)', fontWeight: 600, fontSize: 'var(--text-fs-12)' }}>{v.grantType.toUpperCase()} · {v.grantId}</span>
                <StatusBadge status={v.status} />
              </div>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--color-neutral-7)' }}>
                {v.vestedUnits.toLocaleString()} / {v.totalUnits.toLocaleString()} vested
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Wellbeing & Security */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.4rem' }}>
        <div className="hrms-card">
          <h3 style={sectionTitle}><Activity size={15} style={{ color: 'var(--color-vr-blue-6)' }} /> Wellbeing</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            <RiskBar score={Math.round((p.wellbeing.burnoutRiskScore ?? 0) * 100)} label="Burnout signal" />
            <RiskBar score={Math.round((p.wellbeing.flightRiskScore ?? 0) * 100)} label="Flight risk" />
            {p.wellbeing.engagementPct != null && <Field label="Engagement" value={`${p.wellbeing.engagementPct}%`} />}
          </div>
        </div>
        <div className="hrms-card">
          <h3 style={sectionTitle}><ShieldCheck size={15} style={{ color: 'var(--color-vr-blue-6)' }} /> Device & Verification</h3>
          <div style={dl}>
            <Field label="Device Trust" value={p.device.trustLevel ? <StatusBadge status={p.device.trustLevel} /> : '—'} />
            <Field label="Compliance Score" value={p.device.complianceScore != null ? `${p.device.complianceScore}` : '—'} />
            <Field label="Identity Status" value={p.identityVerification.verificationStatus ? <StatusBadge status={p.identityVerification.verificationStatus} /> : '—'} />
            <Field label="Liveness" value={p.identityVerification.livenessCheckPassed == null ? '—' : (p.identityVerification.livenessCheckPassed ? 'Passed' : 'Not passed')} />
          </div>
        </div>
      </div>
    </div>
  );
}
