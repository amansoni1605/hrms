'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Loader2, BookOpen, Users, Calendar, CheckCircle, Route, Trash2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/hooks/useSession';

interface Program {
  _id: string; title: string; trainer: string; category: string;
  scheduledAt: string | null; durationHours: number; maxEnrollment: number;
  isMandatory: boolean; status: string;
  enrollments: Array<{ employeeId: string; status: string }>;
  createdAt: string;
}
interface LearningPath {
  _id: string; name: string; description?: string; targetRole?: string; isActive: boolean;
  tracks: Array<{ _id: string; order: number; isMandatory: boolean; delayDays: number; programId: Program | null }>;
  createdAt: string;
}

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  draft:       { bg: '#F5F5F5',                              fg: 'var(--color-neutral-7)' },
  scheduled:   { bg: '#E8EEF5',                              fg: 'var(--color-vr-blue-6)' },
  in_progress: { bg: '#FFF3CD',                              fg: '#856404' },
  completed:   { bg: 'var(--color-semantics-green-1)',        fg: 'var(--color-semantics-green-7)' },
  cancelled:   { bg: 'var(--color-semantics-red-1)',          fg: 'var(--color-semantics-red-6)' },
};

const CATEGORIES = ['compliance','technical','leadership','soft_skills','other'];

export default function TrainingPage() {
  const { session } = useSession();
  const toast = useToast();
  const [tab,       setTab]       = useState<'programs' | 'paths'>('programs');
  const [programs,  setPrograms]  = useState<Program[]>([]);
  const [paths,     setPaths]     = useState<LearningPath[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [acting,    setActing]    = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', trainer: '', category: 'other', scheduledAt: '', durationHours: 1, maxEnrollment: 50, isMandatory: false, description: '' });

  const [showPathForm, setShowPathForm] = useState(false);
  const [pathForm, setPathForm] = useState({ name: '', description: '', targetRole: '', trackIds: [] as string[] });
  const [savingPath, setSavingPath] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const isHR = session && ['super_admin','hr_admin','hr_manager'].includes(session.role);

  const loadPrograms = useCallback(async () => {
    const res  = await fetch('/api/training');
    const json = await res.json();
    setPrograms(json.data ?? []);
  }, []);

  const loadPaths = useCallback(async () => {
    const res  = await fetch('/api/learning-paths');
    const json = await res.json();
    setPaths(json.data ?? []);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadPrograms(), loadPaths()]);
    setLoading(false);
  }, [loadPrograms, loadPaths]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.title.trim()) { toast.push({ kind: 'error', title: 'Title required' }); return; }
    setSaving(true);
    const res = await fetch('/api/training', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) {
      toast.push({ kind: 'success', title: 'Training program created' });
      setShowForm(false); load();
    } else {
      toast.push({ kind: 'error', title: 'Failed to create' });
    }
  };

  const createPath = async () => {
    if (!pathForm.name.trim()) { toast.push({ kind: 'error', title: 'Path name required' }); return; }
    setSavingPath(true);
    const tracks = pathForm.trackIds.map((pid, i) => ({ programId: pid, order: i + 1, isMandatory: true, delayDays: 0 }));
    const res = await fetch('/api/learning-paths', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...pathForm, tracks }),
    });
    setSavingPath(false);
    if (res.ok) {
      toast.push({ kind: 'success', title: 'Learning path created' });
      setShowPathForm(false);
      setPathForm({ name: '', description: '', targetRole: '', trackIds: [] });
      loadPaths();
    } else {
      toast.push({ kind: 'error', title: 'Failed to create path' });
    }
  };

  const deletePath = async (pathId: string) => {
    await fetch(`/api/learning-paths/${pathId}`, { method: 'DELETE' });
    toast.push({ kind: 'info', title: 'Learning path deleted' });
    loadPaths();
  };

  const seedDefaults = async () => {
    setSeeding(true);
    const res  = await fetch('/api/training/defaults', { method: 'POST' });
    const json = await res.json();
    setSeeding(false);
    if (res.ok) {
      if (json.created === 0) {
        toast.push({ kind: 'info', title: 'All default programs already exist' });
      } else {
        toast.push({ kind: 'success', title: `${json.created} default program${json.created > 1 ? 's' : ''} added`, desc: json.skipped > 0 ? `${json.skipped} already existed, skipped.` : undefined });
        loadPrograms();
      }
    } else {
      toast.push({ kind: 'error', title: json.error ?? 'Failed to seed defaults' });
    }
  };

  const enroll = async (id: string, action: 'enroll' | 'withdraw') => {
    setActing(id);
    await fetch(`/api/training/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    setActing(null);
    toast.push({ kind: 'success', title: action === 'enroll' ? 'Enrolled successfully' : 'Withdrawn from training' });
    loadPrograms();
  };

  const myEmpId = session?.employeeId;
  const isEnrolled = (p: Program) => myEmpId ? p.enrollments.some((e) => e.employeeId === myEmpId) : false;

  const toggleTrack = (pid: string) => {
    setPathForm((prev) => ({
      ...prev,
      trackIds: prev.trackIds.includes(pid)
        ? prev.trackIds.filter((id) => id !== pid)
        : [...prev.trackIds, pid],
    }));
  };

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.6rem' }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-20)', color: 'var(--color-neutral-10)' }}>Training & Development</h2>
          <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>{programs.length} programs · {paths.length} learning paths</p>
        </div>
        {isHR && tab === 'programs' && (
          <div style={{ display: 'flex', gap: '0.6rem' }}>
            {programs.length === 0 && (
              <button
                onClick={seedDefaults}
                disabled={seeding}
                className="hrms-btn-ghost"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                title="Add 12 standard training programs covering compliance, soft skills, and leadership"
              >
                {seeding ? <Loader2 size={13} className="animate-spin" /> : <BookOpen size={13} />}
                Seed Default Programs
              </button>
            )}
            <button onClick={() => setShowForm((v) => !v)} className="hrms-btn-primary">
              <Plus size={13} /> New Program
            </button>
          </div>
        )}
        {isHR && tab === 'paths' && (
          <button onClick={() => setShowPathForm((v) => !v)} className="hrms-btn-primary">
            <Plus size={13} /> New Path
          </button>
        )}
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: '0.2rem', marginBottom: '1.6rem', borderBottom: '2px solid var(--color-stroke)', paddingBottom: 0 }}>
        {([['programs', 'Programs', BookOpen], ['paths', 'Learning Paths', Route]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.6rem 1.2rem', border: 'none', background: 'none', cursor: 'pointer', fontSize: 'var(--text-fs-13)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: tab === key ? 'var(--color-vr-blue-6)' : 'var(--color-neutral-7)', borderBottom: tab === key ? '2px solid var(--color-vr-blue-6)' : '2px solid transparent', marginBottom: -2, transition: 'color 150ms ease' }}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {/* Programs tab */}
      {tab === 'programs' && (
        <>
          {showForm && isHR && (
            <div className="hrms-card" style={{ padding: '1.6rem', marginBottom: '1.6rem' }}>
              <h3 style={{ margin: '0 0 1.2rem', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-16)', color: 'var(--color-neutral-10)' }}>New Training Program</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <SF label="Title"><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="hrms-input" /></SF>
                <SF label="Trainer"><input value={form.trainer} onChange={(e) => setForm({ ...form, trainer: e.target.value })} className="hrms-input" /></SF>
                <SF label="Category">
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="hrms-input">
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                  </select>
                </SF>
                <SF label="Scheduled At"><input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} className="hrms-input" /></SF>
                <SF label="Duration (hours)"><input type="number" min={0.5} step={0.5} value={form.durationHours} onChange={(e) => setForm({ ...form, durationHours: Number(e.target.value) })} className="hrms-input" /></SF>
                <SF label="Max Enrollment"><input type="number" min={1} value={form.maxEnrollment} onChange={(e) => setForm({ ...form, maxEnrollment: Number(e.target.value) })} className="hrms-input" /></SF>
              </div>
              <SF label="Description">
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="hrms-input" rows={2} style={{ width: '100%', resize: 'vertical' }} />
              </SF>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '1rem' }}>
                <input type="checkbox" id="mandatory" checked={form.isMandatory} onChange={(e) => setForm({ ...form, isMandatory: e.target.checked })} />
                <label htmlFor="mandatory" style={{ color: 'var(--color-neutral-10)', fontSize: 'var(--text-fs-12)', cursor: 'pointer' }}>Mark as mandatory (auto-enroll on onboarding completion)</label>
              </div>
              <div style={{ display: 'flex', gap: '0.8rem', marginTop: '1.2rem', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowForm(false)} className="hrms-btn-ghost">Cancel</button>
                <button onClick={create} disabled={saving} className="hrms-btn-primary">
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Create
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
              <Loader2 size={22} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
            </div>
          ) : programs.length === 0 ? (
            <div className="hrms-card" style={{ padding: '3rem', textAlign: 'center' }}>
              <BookOpen size={36} style={{ color: 'var(--color-neutral-5)', marginBottom: '1rem' }} />
              <p style={{ margin: '0 0 0.4rem', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-16)', color: 'var(--color-neutral-10)' }}>No training programs yet</p>
              <p style={{ margin: '0 0 1.6rem', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-13)' }}>
                Get started with 12 pre-built programs covering compliance, soft skills, and leadership — or create your own.
              </p>
              {isHR && (
                <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button onClick={seedDefaults} disabled={seeding} className="hrms-btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {seeding ? <Loader2 size={13} className="animate-spin" /> : <BookOpen size={13} />}
                    Add 12 Default Programs
                  </button>
                  <button onClick={() => setShowForm(true)} className="hrms-btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Plus size={13} /> Create Custom Program
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem' }}>
              {programs.map((p) => {
                const s        = STATUS_STYLE[p.status] ?? STATUS_STYLE['draft']!;
                const enrolled = isEnrolled(p);
                const isFull   = p.enrollments.length >= p.maxEnrollment;
                return (
                  <div key={p._id} className="hrms-card" style={{ padding: '1.4rem', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <span style={{ padding: '0.2rem 0.8rem', borderRadius: 99, background: s.bg, color: s.fg, fontSize: 11, fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>{p.status.replace(/_/g, ' ')}</span>
                        {p.isMandatory && <span style={{ padding: '0.2rem 0.8rem', borderRadius: 99, background: 'var(--color-semantics-red-1)', color: 'var(--color-semantics-red-6)', fontSize: 11, fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>Mandatory</span>}
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--color-neutral-6)', textTransform: 'capitalize', whiteSpace: 'nowrap', marginLeft: 8 }}>{p.category.replace(/_/g, ' ')}</span>
                    </div>
                    <p style={{ margin: '0 0 0.3rem', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-14)', color: 'var(--color-neutral-10)' }}>{p.title}</p>
                    <p style={{ margin: '0 0 0.6rem', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>{p.trainer || 'Internal trainer'}</p>
                    {(p as Program & { description?: string }).description && (
                      <p style={{ margin: '0 0 0.8rem', color: 'var(--color-neutral-7)', fontSize: 11, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {(p as Program & { description?: string }).description}
                      </p>
                    )}
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-7)', marginTop: 'auto' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <BookOpen size={11} /> {p.durationHours}h
                      </span>
                      {p.scheduledAt && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Calendar size={11} /> {new Date(p.scheduledAt).toLocaleDateString('en-IN')}
                        </span>
                      )}
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Users size={11} /> {p.enrollments.length}/{p.maxEnrollment}
                      </span>
                    </div>
                    {!isHR && p.status === 'scheduled' && (
                      enrolled ? (
                        <button onClick={() => enroll(p._id, 'withdraw')} disabled={acting === p._id} className="hrms-btn-ghost" style={{ width: '100%', fontSize: 'var(--text-fs-12)' }}>
                          {acting === p._id ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} style={{ color: 'var(--color-semantics-green-7)' }} />} Enrolled — Withdraw
                        </button>
                      ) : (
                        <button onClick={() => enroll(p._id, 'enroll')} disabled={acting === p._id || isFull} className="hrms-btn-primary" style={{ width: '100%', fontSize: 'var(--text-fs-12)' }}>
                          {acting === p._id ? <Loader2 size={11} className="animate-spin" /> : <BookOpen size={11} />} {isFull ? 'Full' : 'Enroll'}
                        </button>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Learning Paths tab */}

      {tab === 'paths' && (
        <>
          {showPathForm && isHR && (
            <div className="hrms-card" style={{ padding: '1.6rem', marginBottom: '1.6rem' }}>
              <h3 style={{ margin: '0 0 1.2rem', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-16)', color: 'var(--color-neutral-10)' }}>New Learning Path</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <SF label="Path Name *"><input value={pathForm.name} onChange={(e) => setPathForm({ ...pathForm, name: e.target.value })} className="hrms-input" placeholder="e.g. New Hire Onboarding Track" /></SF>
                <SF label="Target Role"><input value={pathForm.targetRole} onChange={(e) => setPathForm({ ...pathForm, targetRole: e.target.value })} className="hrms-input" placeholder="e.g. Software Engineer" /></SF>
              </div>
              <SF label="Description" style={{ marginBottom: '1rem' }}>
                <textarea value={pathForm.description} onChange={(e) => setPathForm({ ...pathForm, description: e.target.value })} className="hrms-input" rows={2} style={{ width: '100%', resize: 'vertical' }} />
              </SF>
              <p style={{ margin: '0 0 0.6rem', fontSize: 10, fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-8)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Select Programs (in order)</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1.2rem', maxHeight: 200, overflowY: 'auto' }}>
                {programs.map((p) => (
                  <label key={p._id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0.8rem', borderRadius: '0.5rem', background: pathForm.trackIds.includes(p._id) ? 'var(--color-vr-blue-1)' : 'var(--color-neutral-2)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={pathForm.trackIds.includes(p._id)} onChange={() => toggleTrack(p._id)} />
                    <span style={{ fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-10)', flex: 1 }}>{p.title}</span>
                    {p.isMandatory && <span style={{ fontSize: 10, color: 'var(--color-semantics-red-6)' }}>Mandatory</span>}
                  </label>
                ))}
                {programs.length === 0 && <p style={{ color: 'var(--color-neutral-6)', fontSize: 12, padding: '0.4rem' }}>No programs yet — create programs first.</p>}
              </div>
              <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowPathForm(false)} className="hrms-btn-ghost">Cancel</button>
                <button onClick={createPath} disabled={savingPath} className="hrms-btn-primary">
                  {savingPath ? <Loader2 size={12} className="animate-spin" /> : <Route size={12} />} Create Path
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
              <Loader2 size={22} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
            </div>
          ) : paths.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-neutral-7)' }}>
              <Route size={32} style={{ marginBottom: '0.8rem', opacity: 0.4 }} />
              <p style={{ margin: 0, fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>No learning paths yet</p>
              <p style={{ margin: '0.4rem 0 0', fontSize: 12 }}>Create a path to define ordered training tracks for new hires.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {paths.map((path) => (
                <div key={path._id} className="hrms-card" style={{ padding: '1.4rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.8rem' }}>
                    <div>
                      <p style={{ margin: '0 0 0.2rem', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-14)', color: 'var(--color-neutral-10)' }}>{path.name}</p>
                      {path.targetRole && <p style={{ margin: 0, fontSize: 11, color: 'var(--color-neutral-6)' }}>For: {path.targetRole}</p>}
                      {path.description && <p style={{ margin: '0.4rem 0 0', fontSize: 12, color: 'var(--color-neutral-7)' }}>{path.description}</p>}
                    </div>
                    {isHR && (
                      <button onClick={() => deletePath(path._id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--color-neutral-5)', padding: '0.2rem' }}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    {path.tracks.sort((a, b) => a.order - b.order).map((track, idx) => {
                      const prog = track.programId;
                      return (
                        <div key={track._id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0.8rem', borderRadius: '0.5rem', background: 'var(--color-neutral-2)' }}>
                          <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--color-vr-blue-1)', color: 'var(--color-vr-blue-6)', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{idx + 1}</span>
                          <span style={{ flex: 1, fontSize: 12, color: 'var(--color-neutral-10)', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>{prog?.title ?? '—'}</span>
                          {track.isMandatory && <span style={{ fontSize: 10, color: 'var(--color-semantics-red-6)' }}>Mandatory</span>}
                          {track.delayDays > 0 && <span style={{ fontSize: 10, color: 'var(--color-neutral-6)' }}>+{track.delayDays}d</span>}
                        </div>
                      );
                    })}
                    {path.tracks.length === 0 && <p style={{ fontSize: 12, color: 'var(--color-neutral-5)', margin: 0, padding: '0.4rem' }}>No programs in this path yet.</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
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
