'use client';

import { useEffect, useState, useCallback } from 'react';
import { use } from 'react';
import { Loader2, UserPlus, ChevronLeft, Users, ChevronRight, CheckCircle2, XCircle, UserCheck } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import Link from 'next/link';

interface Applicant {
  _id: string; name: string; email: string; phone: string;
  source: string; status: string; notes: string; createdAt: string;
  candidateStatus?: string; employeeId?: string; hiredAt?: string;
}
interface ManagerOption {
  _id: string; employeeCode: string; jobTitle: string; departmentName?: string;
}
interface DeptOption {
  _id: string; name: string; code: string;
}

const COUNTRIES: { code: string; label: string }[] = [
  { code: 'IN', label: 'India' },
  { code: 'US', label: 'United States' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'SG', label: 'Singapore' },
  { code: 'AE', label: 'UAE' },
  { code: 'AU', label: 'Australia' },
  { code: 'CA', label: 'Canada' },
  { code: 'DE', label: 'Germany' },
  { code: 'FR', label: 'France' },
  { code: 'NL', label: 'Netherlands' },
  { code: 'JP', label: 'Japan' },
  { code: 'HK', label: 'Hong Kong' },
  { code: 'NZ', label: 'New Zealand' },
  { code: 'ZA', label: 'South Africa' },
];
interface Opening {
  _id: string; title: string; designation: string; status: string;
  headcount: number; description: string; requirements: string[];
  departmentId?: { name: string } | null;
}

const STATUS_FLOW = ['applied','shortlisted','interviewing','offered','accepted','rejected','withdrawn'] as const;
type AppStatus = typeof STATUS_FLOW[number];

const NEXT_STATUS: Partial<Record<AppStatus, AppStatus>> = {
  applied:      'shortlisted',
  shortlisted:  'interviewing',
  interviewing: 'offered',
  offered:      'accepted',
};

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  applied:      { bg: '#F5F5F5',                              fg: 'var(--color-neutral-7)' },
  shortlisted:  { bg: '#E8EEF5',                              fg: 'var(--color-vr-blue-6)' },
  interviewing: { bg: '#FFF3CD',                              fg: '#856404' },
  offered:      { bg: '#EEF0FF',                              fg: '#3759BF' },
  accepted:     { bg: 'var(--color-semantics-green-1)',        fg: 'var(--color-semantics-green-7)' },
  rejected:     { bg: 'var(--color-semantics-red-1)',          fg: 'var(--color-semantics-red-6)' },
  withdrawn:    { bg: '#F5F5F5',                              fg: 'var(--color-neutral-6)' },
};

const PIPELINE_LABEL: Record<string, string> = {
  SHORTLISTED:          'In Pipeline',
  OFFER_EXTENDED:       'Offer Extended',
  OFFER_ACCEPTED:       'Offer Accepted',
  ONBOARDING_ACTIVE:    'Onboarding Active',
  ONBOARDING_COMPLETED: 'Onboarding Done',
  TRAINING_IN_PROGRESS: 'In Training',
  FULLY_RAMPED:         'Fully Ramped',
};

export default function RecruitmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const toast  = useToast();
  const [opening,    setOpening]    = useState<Opening | null>(null);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [showForm,   setShowForm]   = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [advancing,  setAdvancing]  = useState<string | null>(null);
  const [hireModal,  setHireModal]  = useState<Applicant | null>(null);
  const [hireForm,   setHireForm]   = useState({ jobTitle: '', departmentId: '', departmentName: '', managerId: '', managerName: '', startDate: '', countryCode: 'IN', employmentType: 'full_time', baseSalary: '' });
  const [hiring,     setHiring]     = useState(false);
  const [managers,    setManagers]    = useState<ManagerOption[]>([]);
  const [departments, setDepartments] = useState<DeptOption[]>([]);
  const [jobTitles,   setJobTitles]   = useState<string[]>([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', source: 'direct', notes: '' });

  const load = useCallback(async () => {
    setLoading(true);
    const res  = await fetch(`/api/recruitment/${id}`);
    const json = await res.json();
    setOpening(json.data?.opening ?? null);
    setApplicants(json.data?.applicants ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const addApplicant = async () => {
    if (!form.name || !form.email) { toast.push({ kind: 'error', title: 'Name and email required' }); return; }
    setSaving(true);
    const res = await fetch(`/api/recruitment/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) {
      toast.push({ kind: 'success', title: 'Applicant added' });
      setShowForm(false); setForm({ name: '', email: '', phone: '', source: 'direct', notes: '' }); load();
    } else {
      toast.push({ kind: 'error', title: 'Failed to add applicant' });
    }
  };

  const advance = async (applicant: Applicant, nextStatus: AppStatus) => {
    setAdvancing(applicant._id);
    const res = await fetch(`/api/recruitment/applicants/${applicant._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    });
    setAdvancing(null);
    if (res.ok) {
      toast.push({ kind: 'success', title: `Moved to ${nextStatus}` });
      load();
    } else {
      const j = await res.json();
      toast.push({ kind: 'error', title: j.error ?? 'Failed' });
    }
  };

  const reject = async (applicant: Applicant) => {
    setAdvancing(applicant._id + '_rej');
    const res = await fetch(`/api/recruitment/applicants/${applicant._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'rejected' }),
    });
    setAdvancing(null);
    if (res.ok) { toast.push({ kind: 'info', title: 'Applicant rejected' }); load(); }
  };

  const hire = async () => {
    if (!hireModal) return;
    if (!hireForm.jobTitle.trim())  { toast.push({ kind: 'error', title: 'Job title required' }); return; }
    if (!hireForm.departmentId)     { toast.push({ kind: 'error', title: 'Department required' }); return; }
    if (!hireForm.startDate)        { toast.push({ kind: 'error', title: 'Start date required' }); return; }
    setHiring(true);
    const res = await fetch(`/api/recruitment/applicants/${hireModal._id}/hire`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(hireForm),
    });
    setHiring(false);
    if (res.ok) {
      const j = await res.json();
      toast.push({ kind: 'success', title: `${hireModal.name} hired! Code: ${j.data?.employeeCode}` });
      setHireModal(null);
      load();
    } else {
      const j = await res.json();
      toast.push({ kind: 'error', title: j.error ?? 'Hire failed' });
    }
  };

  const openHireModal = async (a: Applicant) => {
    setHireForm({ jobTitle: opening?.designation ?? '', departmentId: '', departmentName: opening?.departmentId?.name ?? '', managerId: '', managerName: '', startDate: '', countryCode: 'IN', employmentType: 'full_time', baseSalary: '' });
    setHireModal(a);
    setModalLoading(true);
    try {
      const [empRes, deptRes] = await Promise.all([
        fetch('/api/employees?limit=200'),
        fetch('/api/departments'),
      ]);
      const empJson  = await empRes.json()  as { data?: ManagerOption[] };
      const deptJson = await deptRes.json() as { data?: DeptOption[] };
      const emps = empJson.data ?? [];
      setManagers(emps);
      setDepartments(deptJson.data ?? []);
      const titles = Array.from(new Set(emps.map((e) => e.jobTitle).filter(Boolean)));
      if (opening?.designation && !titles.includes(opening.designation)) titles.unshift(opening.designation);
      setJobTitles(titles);
    } finally {
      setModalLoading(false);
    }
  };

  if (loading || !opening) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><Loader2 size={22} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} /></div>;
  }

  const byStatus = STATUS_FLOW.map((s) => ({
    status: s,
    count:  applicants.filter((a) => a.status === s).length,
  }));

  return (
    <div style={{ padding: '2rem', maxWidth: 1100 }}>
      <Link href="/recruitment" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-vr-blue-6)', fontSize: 'var(--text-fs-12)', textDecoration: 'none', marginBottom: '1.2rem' }}>
        <ChevronLeft size={14} /> Back to Recruitment
      </Link>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.6rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-20)', color: 'var(--color-neutral-10)' }}>{opening.title}</h2>
          <p style={{ margin: '0.4rem 0 0', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
            {opening.departmentId?.name ?? 'No Department'} · {opening.designation} · {opening.headcount} seat{opening.headcount !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="hrms-btn-primary">
          <UserPlus size={13} /> Add Applicant
        </button>
      </div>

      {/* Pipeline funnel */}
      <div style={{ display: 'flex', gap: '0.6rem', overflowX: 'auto', marginBottom: '1.6rem', paddingBottom: '0.4rem' }}>
        {byStatus.map(({ status, count }) => {
          const s = STATUS_STYLE[status] ?? STATUS_STYLE['applied']!;
          return (
            <div key={status} style={{ flex: '0 0 110px', textAlign: 'center', padding: '0.8rem', borderRadius: '0.8rem', background: s.bg }}>
              <p style={{ margin: '0 0 0.2rem', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-20)', color: s.fg }}>{count}</p>
              <p style={{ margin: 0, fontSize: 10, fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: s.fg, textTransform: 'capitalize' }}>{status}</p>
            </div>
          );
        })}
      </div>

      {/* Add applicant form */}
      {showForm && (
        <div className="hrms-card" style={{ padding: '1.6rem', marginBottom: '1.6rem' }}>
          <h3 style={{ margin: '0 0 1.2rem', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-16)', color: 'var(--color-neutral-10)' }}>Add Applicant</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <SF label="Full Name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="hrms-input" placeholder="Applicant name" /></SF>
            <SF label="Email"><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="hrms-input" placeholder="email@example.com" /></SF>
            <SF label="Phone"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="hrms-input" placeholder="+91 9876543210" /></SF>
            <SF label="Source">
              <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className="hrms-input">
                {['direct','linkedin','referral','agency','job_board','other'].map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </select>
            </SF>
          </div>
          <SF label="Notes"><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="hrms-input" rows={2} style={{ width: '100%', resize: 'vertical' }} /></SF>
          <div style={{ display: 'flex', gap: '0.8rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
            <button onClick={() => setShowForm(false)} className="hrms-btn-ghost">Cancel</button>
            <button onClick={addApplicant} disabled={saving} className="hrms-btn-primary">
              {saving ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />} Add
            </button>
          </div>
        </div>
      )}

      {/* Hire Modal */}
      {hireModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="hrms-card" style={{ padding: '2rem', maxWidth: 520, width: '100%' }}>
            <h3 style={{ margin: '0 0 0.4rem', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-18)', color: 'var(--color-neutral-10)' }}>
              Hire {hireModal.name}
            </h3>
            <p style={{ margin: '0 0 1.4rem', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
              This will create an employee record, login account, and onboarding checklist.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <SF label="Job Title *">
                <input
                  list="jt-list"
                  value={hireForm.jobTitle}
                  onChange={(e) => setHireForm({ ...hireForm, jobTitle: e.target.value })}
                  className="hrms-input"
                  placeholder={modalLoading ? 'Loading…' : 'Select or type job title'}
                  disabled={modalLoading}
                />
                <datalist id="jt-list">
                  {jobTitles.map((t) => <option key={t} value={t} />)}
                </datalist>
              </SF>
              <SF label="Start Date *">
                <input type="date" value={hireForm.startDate} onChange={(e) => setHireForm({ ...hireForm, startDate: e.target.value })} className="hrms-input" />
              </SF>
              <SF label="Department *">
                <select
                  value={hireForm.departmentId}
                  onChange={(e) => {
                    const d = departments.find((d) => d._id === e.target.value);
                    setHireForm({ ...hireForm, departmentId: e.target.value, departmentName: d?.name ?? '' });
                  }}
                  className="hrms-input"
                  disabled={modalLoading}
                >
                  <option value="">{modalLoading ? 'Loading…' : '— Select department —'}</option>
                  {departments.map((d) => (
                    <option key={d._id} value={d._id}>{d.name} ({d.code})</option>
                  ))}
                </select>
              </SF>
              <SF label="Employment Type">
                <select value={hireForm.employmentType} onChange={(e) => setHireForm({ ...hireForm, employmentType: e.target.value })} className="hrms-input">
                  {['full_time','part_time','contractor','intern'].map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                </select>
              </SF>
              <SF label="Manager">
                <select
                  value={hireForm.managerId}
                  onChange={(e) => {
                    const m = managers.find((m) => m._id === e.target.value);
                    setHireForm({ ...hireForm, managerId: e.target.value, managerName: m ? `${m.employeeCode} — ${m.jobTitle}` : '' });
                  }}
                  className="hrms-input"
                  disabled={modalLoading}
                >
                  <option value="">{modalLoading ? 'Loading…' : '— Select manager (optional) —'}</option>
                  {managers.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.employeeCode} — {m.jobTitle}{m.departmentName ? ` (${m.departmentName})` : ''}
                    </option>
                  ))}
                </select>
              </SF>
              <SF label="Country">
                <select value={hireForm.countryCode} onChange={(e) => setHireForm({ ...hireForm, countryCode: e.target.value })} className="hrms-input">
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.label} ({c.code})</option>
                  ))}
                </select>
              </SF>
              <SF label="Base Salary (Annual)">
                <input
                  type="number" min={0} step={1000}
                  value={hireForm.baseSalary}
                  onChange={(e) => setHireForm({ ...hireForm, baseSalary: e.target.value })}
                  className="hrms-input" placeholder="e.g. 800000"
                />
              </SF>
            </div>
            <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setHireModal(null)} className="hrms-btn-ghost">Cancel</button>
              <button onClick={hire} disabled={hiring} className="hrms-btn-primary">
                {hiring ? <Loader2 size={12} className="animate-spin" /> : <UserCheck size={12} />} Confirm Hire
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Applicants list */}
      <div className="hrms-card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '1.2rem 1.6rem', borderBottom: '1px solid var(--color-stroke)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Users size={14} style={{ color: 'var(--color-vr-blue-6)' }} />
          <h3 style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-14)', color: 'var(--color-neutral-10)' }}>Applicants ({applicants.length})</h3>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>{['Name','Email','Source','Status','Pipeline Stage','Actions'].map((h) => <th key={h} className="hrms-th">{h}</th>)}</tr>
          </thead>
          <tbody>
            {applicants.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>No applicants yet</td></tr>
            )}
            {applicants.map((a) => {
              const s    = STATUS_STYLE[a.status] ?? STATUS_STYLE['applied']!;
              const next = NEXT_STATUS[a.status as AppStatus];
              const isTerminal = ['rejected','withdrawn'].includes(a.status);
              const isHired    = !!a.employeeId;
              const busy       = advancing === a._id || advancing === a._id + '_rej';
              return (
                <tr key={a._id} style={{ borderBottom: '1px solid var(--color-stroke)' }}>
                  <td className="hrms-td" style={{ fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>{a.name}</td>
                  <td className="hrms-td" style={{ fontSize: 'var(--text-fs-12)' }}>{a.email}</td>
                  <td className="hrms-td" style={{ textTransform: 'capitalize' }}>{a.source.replace(/_/g, ' ')}</td>
                  <td className="hrms-td">
                    <span style={{ padding: '0.2rem 0.8rem', borderRadius: 99, background: s.bg, color: s.fg, fontSize: 11, fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
                      {a.status}
                    </span>
                  </td>
                  <td className="hrms-td">
                    {a.candidateStatus ? (
                      <span style={{ padding: '0.2rem 0.8rem', borderRadius: 99, background: 'var(--color-vr-blue-1)', color: 'var(--color-vr-blue-6)', fontSize: 11, fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
                        {PIPELINE_LABEL[a.candidateStatus] ?? a.candidateStatus}
                      </span>
                    ) : <span style={{ color: 'var(--color-neutral-5)', fontSize: 12 }}>—</span>}
                  </td>
                  <td className="hrms-td">
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      {isHired ? (
                        <span style={{ fontSize: 11, color: 'var(--color-semantics-green-7)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <CheckCircle2 size={12} /> Hired
                        </span>
                      ) : a.status === 'accepted' ? (
                        <button onClick={() => openHireModal(a)} className="hrms-btn-primary" style={{ fontSize: 11, padding: '0.3rem 0.8rem' }}>
                          <UserCheck size={11} /> Hire
                        </button>
                      ) : (
                        <>
                          {next && !isTerminal && (
                            <button onClick={() => advance(a, next)} disabled={busy} className="hrms-btn-ghost" style={{ fontSize: 11, padding: '0.3rem 0.8rem' }}>
                              {busy ? <Loader2 size={10} className="animate-spin" /> : <ChevronRight size={10} />} {next}
                            </button>
                          )}
                          {!isTerminal && (
                            <button onClick={() => reject(a)} disabled={busy} style={{ fontSize: 11, padding: '0.3rem 0.8rem', border: 'none', background: 'var(--color-semantics-red-1)', color: 'var(--color-semantics-red-6)', borderRadius: '0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                              {busy ? <Loader2 size={10} className="animate-spin" /> : <XCircle size={10} />} Reject
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SF({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={style}>
      <label style={{ display: 'block', marginBottom: 4, color: 'var(--color-neutral-8)', fontSize: 10, fontFamily: 'var(--font-in-sb)', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase' }}>{label}</label>
      {children}
    </div>
  );
}
