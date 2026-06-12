'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Loader2, Briefcase, Users, ChevronRight, Search } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import Link from 'next/link';

interface JobOpening {
  _id: string; title: string; designation: string; status: string;
  headcount: number; applicantCount: number; createdAt: string;
  departmentId?: { name: string } | null;
}

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  open:   { bg: 'var(--color-semantics-green-1)', fg: 'var(--color-semantics-green-7)' },
  paused: { bg: '#FFF3CD', fg: '#856404' },
  closed: { bg: 'var(--color-semantics-red-1)',   fg: 'var(--color-semantics-red-6)' },
  filled: { bg: '#E8EEF5', fg: 'var(--color-vr-blue-6)' },
};

export default function RecruitmentPage() {
  const toast = useToast();
  const [openings,  setOpenings]  = useState<JobOpening[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  const [showForm,  setShowForm]  = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [form, setForm] = useState({ title: '', designation: '', headcount: 1, description: '', requirements: '' });

  const load = useCallback(async () => {
    setLoading(true);
    const res  = await fetch('/api/recruitment');
    const json = await res.json();
    setOpenings(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = search
    ? openings.filter((o) => `${o.title} ${o.designation}`.toLowerCase().includes(search.toLowerCase()))
    : openings;

  const create = async () => {
    if (!form.title.trim()) { toast.push({ kind: 'error', title: 'Title required' }); return; }
    setSaving(true);
    const res = await fetch('/api/recruitment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        requirements: form.requirements.split('\n').filter(Boolean),
      }),
    });
    setSaving(false);
    if (res.ok) {
      toast.push({ kind: 'success', title: 'Job opening created' });
      setShowForm(false);
      setForm({ title: '', designation: '', headcount: 1, description: '', requirements: '' });
      load();
    } else {
      toast.push({ kind: 'error', title: 'Failed to create' });
    }
  };

  const stats = {
    open:   openings.filter((o) => o.status === 'open').length,
    total:  openings.reduce((s, o) => s + o.applicantCount, 0),
    filled: openings.filter((o) => o.status === 'filled').length,
  };

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.6rem' }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-20)', color: 'var(--color-neutral-10)' }}>Recruitment</h2>
          <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>{stats.open} open positions · {stats.total} total applicants</p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="hrms-btn-primary">
          <Plus size={13} /> New Opening
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.6rem' }}>
        {[
          { label: 'Open Positions', value: stats.open,   color: 'var(--color-semantics-green-7)' },
          { label: 'Total Applicants', value: stats.total, color: 'var(--color-vr-blue-6)' },
          { label: 'Positions Filled', value: stats.filled, color: 'var(--color-neutral-7)' },
        ].map((kpi) => (
          <div key={kpi.label} className="hrms-kpi-card">
            <p className="hrms-kpi-label">{kpi.label}</p>
            <p className="hrms-kpi-value" style={{ color: kpi.color }}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* New opening form */}
      {showForm && (
        <div className="hrms-card" style={{ padding: '1.6rem', marginBottom: '1.6rem' }}>
          <h3 style={{ margin: '0 0 1.2rem', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-16)', color: 'var(--color-neutral-10)' }}>New Job Opening</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <SF label="Job Title"><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="hrms-input" placeholder="e.g. Senior Analyst" /></SF>
            <SF label="Designation"><input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} className="hrms-input" placeholder="e.g. Analyst L2" /></SF>
            <SF label="Headcount"><input type="number" min={1} value={form.headcount} onChange={(e) => setForm({ ...form, headcount: Number(e.target.value) })} className="hrms-input" /></SF>
          </div>
          <SF label="Description" style={{ marginBottom: '1rem' }}>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="hrms-input" rows={3} style={{ width: '100%', resize: 'vertical' }} placeholder="Role description…" />
          </SF>
          <SF label="Requirements (one per line)">
            <textarea value={form.requirements} onChange={(e) => setForm({ ...form, requirements: e.target.value })} className="hrms-input" rows={3} style={{ width: '100%', resize: 'vertical' }} placeholder="3+ years experience&#10;CFA preferred&#10;Strong communication" />
          </SF>
          <div style={{ display: 'flex', gap: '0.8rem', marginTop: '1.2rem', justifyContent: 'flex-end' }}>
            <button onClick={() => setShowForm(false)} className="hrms-btn-ghost">Cancel</button>
            <button onClick={create} disabled={saving} className="hrms-btn-primary">
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Create Opening
            </button>
          </div>
        </div>
      )}

      <div style={{ position: 'relative', marginBottom: '1rem' }}>
        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-neutral-6)' }} />
        <input value={search} onChange={(e) => setSearch(e.target.value)} className="hrms-input" placeholder="Search openings…" style={{ paddingLeft: '2.8rem', maxWidth: 320 }} />
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <Loader2 size={22} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem' }}>
          {filtered.length === 0 && <p style={{ color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>No openings found</p>}
          {filtered.map((o) => {
            const s = STATUS_STYLE[o.status] ?? STATUS_STYLE['open']!;
            return (
              <Link key={o._id} href={`/recruitment/${o._id}`} style={{ textDecoration: 'none' }}>
                <div className="hrms-card" style={{ padding: '1.4rem', cursor: 'pointer', transition: 'box-shadow 120ms ease' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.8rem', marginBottom: '0.8rem' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '0.8rem', background: 'var(--color-vr-blue-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Briefcase size={16} style={{ color: 'var(--color-vr-blue-6)' }} />
                    </div>
                    <span style={{ padding: '0.2rem 0.8rem', borderRadius: 99, background: s.bg, color: s.fg, fontSize: 11, fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
                      {o.status}
                    </span>
                  </div>
                  <p style={{ margin: '0 0 0.2rem', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-14)', color: 'var(--color-neutral-10)' }}>{o.title}</p>
                  <p style={{ margin: '0 0 1rem', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
                    {o.departmentId?.name ?? 'No Department'} · {o.designation}
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
                      <Users size={12} /> {o.applicantCount} applicant{o.applicantCount !== 1 ? 's' : ''}
                    </span>
                    <span style={{ color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
                      {o.headcount} seat{o.headcount !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
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
