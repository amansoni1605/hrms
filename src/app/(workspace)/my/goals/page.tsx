'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Target, Plus, Loader2, Trash2, TrendingUp, Check, Flag } from 'lucide-react';
import { Modal }              from '@/components/ui/Modal';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { EmptyState }         from '@/components/ui/EmptyState';
import { useToast }           from '@/components/ui/Toast';

interface KeyResult { title: string; targetValue: number; currentValue: number; unit: string; done: boolean }
interface CheckIn   { progressPct: number; note?: string; at: string }
interface Goal {
  _id: string; title: string; description?: string; category: string; cycleLabel?: string;
  weight: number; status: string; progressPct: number; keyResults: KeyResult[]; checkIns: CheckIn[];
}

const CATEGORIES = ['business', 'customer', 'people', 'operational', 'personal'];
const STATUSES   = ['active', 'at_risk', 'achieved', 'missed', 'cancelled'];

function defaultCycle(): string {
  const n = new Date();
  return `${n.getMonth() < 6 ? 'H1' : 'H2'} ${n.getFullYear()}`;
}

function ProgressBar({ pct }: { pct: number }) {
  const color = pct >= 100 ? 'var(--color-semantics-green-6)' : pct >= 50 ? 'var(--color-vr-blue-6)' : 'var(--color-semantics-orange-6)';
  return (
    <div style={{ height: 6, background: 'var(--color-neutral-4)', borderRadius: 9999, overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color, transition: 'width 200ms ease' }} />
    </div>
  );
}

function GoalCard({ goal, onChanged }: { goal: Goal; onChanged: () => void }) {
  const { push } = useToast();
  const [busy, setBusy]       = useState(false);
  const [checkin, setCheckin] = useState(false);
  const [pct, setPct]         = useState(goal.progressPct);
  const [note, setNote]       = useState('');

  const call = async (body: object) => {
    setBusy(true);
    const res = await fetch(`/api/me/goals/${goal._id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setBusy(false);
    if (!res.ok) { push({ kind: 'error', title: 'Update failed' }); return false; }
    return true;
  };

  const logCheckIn = async () => {
    if (await call({ action: 'checkin', progressPct: pct, note })) {
      push({ kind: 'success', title: 'Progress logged' }); setCheckin(false); setNote(''); onChanged();
    }
  };
  const setStatus = async (status: string) => { if (await call({ action: 'update', status })) onChanged(); };
  const bumpKR = async (krIndex: number, currentValue: number, done: boolean) => { if (await call({ action: 'update_kr', krIndex, krCurrentValue: currentValue, krDone: done })) onChanged(); };
  const remove = async () => {
    setBusy(true);
    await fetch(`/api/me/goals/${goal._id}`, { method: 'DELETE' });
    setBusy(false); push({ kind: 'success', title: 'Goal removed' }); onChanged();
  };

  return (
    <div className="hrms-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--font-in-sb)', fontWeight: 700, fontSize: 'var(--text-fs-14)', color: 'var(--color-neutral-10)' }}>{goal.title}</span>
            <Badge variant="info">{goal.category}</Badge>
            {goal.cycleLabel && <Badge variant="neutral">{goal.cycleLabel}</Badge>}
            {goal.weight > 0 && <Badge variant="purple">{goal.weight}%</Badge>}
          </div>
          {goal.description && <p style={{ margin: '4px 0 0', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>{goal.description}</p>}
        </div>
        <StatusBadge status={goal.status} />
        <button onClick={remove} disabled={busy} title="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-neutral-6)', padding: 4 }}><Trash2 size={13} /></button>
      </div>

      {/* progress */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-neutral-7)' }}>Progress</span>
          <span style={{ fontFamily: 'var(--font-in-sb)', fontWeight: 700, fontSize: 'var(--text-fs-12)', fontVariantNumeric: 'tabular-nums' }}>{goal.progressPct}%</span>
        </div>
        <ProgressBar pct={goal.progressPct} />
      </div>

      {/* key results */}
      {goal.keyResults.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {goal.keyResults.map((kr, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-fs-12)' }}>
              <button onClick={() => bumpKR(i, kr.done ? kr.currentValue : kr.targetValue, !kr.done)} disabled={busy}
                style={{ width: 16, height: 16, borderRadius: 4, border: '1px solid var(--color-stroke)', background: kr.done ? 'var(--color-semantics-green-6)' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {kr.done && <Check size={11} color="#fff" />}
              </button>
              <span style={{ flex: 1, color: 'var(--color-neutral-8)', textDecoration: kr.done ? 'line-through' : 'none' }}>{kr.title}</span>
              <input type="number" value={kr.currentValue} disabled={busy} onChange={(e) => bumpKR(i, parseFloat(e.target.value) || 0, kr.done)}
                style={{ width: 56, textAlign: 'right', fontVariantNumeric: 'tabular-nums', border: '1px solid var(--color-stroke)', borderRadius: 4, padding: '1px 4px', fontSize: 11 }} />
              <span style={{ color: 'var(--color-neutral-6)', minWidth: 48 }}>/ {kr.targetValue}{kr.unit}</span>
            </div>
          ))}
        </div>
      )}

      {/* check-in + status row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid var(--color-neutral-4)', paddingTop: '0.7rem' }}>
        {!checkin ? (
          <button onClick={() => { setPct(goal.progressPct); setCheckin(true); }} className="hrms-btn-ghost" style={{ padding: '0.35rem 0.8rem', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <TrendingUp size={12} /> Log progress
          </button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
            <input type="number" min={0} max={100} value={pct} onChange={(e) => setPct(parseInt(e.target.value) || 0)} style={{ width: 52, border: '1px solid var(--color-stroke)', borderRadius: 4, padding: '2px 4px', fontSize: 11 }} />
            <span style={{ fontSize: 11, color: 'var(--color-neutral-6)' }}>%</span>
            <input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} className="hrms-input" style={{ flex: 1, fontSize: 11, padding: '0.3rem 0.5rem' }} />
            <button onClick={logCheckIn} disabled={busy} className="hrms-btn-primary" style={{ padding: '0.35rem 0.8rem', fontSize: 11 }}>{busy ? <Loader2 size={11} className="animate-spin" /> : 'Save'}</button>
            <button onClick={() => setCheckin(false)} className="hrms-btn-ghost" style={{ padding: '0.35rem 0.6rem', fontSize: 11 }}>Cancel</button>
          </div>
        )}
        {!checkin && (
          <select value={goal.status} onChange={(e) => setStatus(e.target.value)} disabled={busy}
            style={{ marginLeft: 'auto', fontSize: 11, border: '1px solid var(--color-stroke)', borderRadius: 6, padding: '0.3rem 0.5rem', color: 'var(--color-neutral-8)' }}>
            {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
        )}
      </div>
      {goal.checkIns.length > 0 && !checkin && (
        <p style={{ margin: 0, fontSize: 10, color: 'var(--color-neutral-6)' }}>
          Last check-in: {goal.checkIns[goal.checkIns.length - 1]!.progressPct}%{goal.checkIns[goal.checkIns.length - 1]!.note ? ` — ${goal.checkIns[goal.checkIns.length - 1]!.note}` : ''}
        </p>
      )}
    </div>
  );
}

export default function MyGoalsPage() {
  const { push } = useToast();
  const [goals, setGoals]     = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen]       = useState(false);
  const [saving, setSaving]   = useState(false);

  // create form
  const [title, setTitle]       = useState('');
  const [desc, setDesc]         = useState('');
  const [category, setCategory] = useState('business');
  const [cycle, setCycle]       = useState(defaultCycle());
  const [weight, setWeight]     = useState('');
  const [krs, setKrs]           = useState<Array<{ title: string; targetValue: string; unit: string }>>([{ title: '', targetValue: '100', unit: '%' }]);

  const load = () => {
    setLoading(true);
    fetch('/api/me/goals').then((r) => r.json()).then((d) => setGoals(d.data ?? [])).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const reset = () => { setTitle(''); setDesc(''); setCategory('business'); setCycle(defaultCycle()); setWeight(''); setKrs([{ title: '', targetValue: '100', unit: '%' }]); };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    const res = await fetch('/api/me/goals', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title, description: desc, category, cycleLabel: cycle, weight: parseFloat(weight) || 0,
        keyResults: krs.filter((k) => k.title.trim()).map((k) => ({ title: k.title, targetValue: parseFloat(k.targetValue) || 100, unit: k.unit })),
      }),
    });
    setSaving(false);
    if (!res.ok) { push({ kind: 'error', title: 'Could not create goal' }); return; }
    push({ kind: 'success', title: 'Goal created' }); setOpen(false); reset(); load();
  };

  const avgProgress = goals.length ? Math.round(goals.reduce((a, g) => a + g.progressPct, 0) / goals.length) : 0;

  return (
    <div style={{ padding: '2rem', maxWidth: 880 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.6rem' }}>
        <Flag size={20} style={{ color: 'var(--color-vr-blue-6)' }} />
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, color: 'var(--color-neutral-10)', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-20)' }}>My Goals</h2>
          <p style={{ margin: '2px 0 0', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
            Set objectives, track key results, and log progress. {goals.length > 0 && `${goals.length} goals · ${avgProgress}% avg progress.`}
          </p>
        </div>
        <button onClick={() => setOpen(true)} className="hrms-btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.7rem 1.2rem' }}><Plus size={13} /> New Goal</button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><Loader2 size={22} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} /></div>
      ) : goals.length === 0 ? (
        <EmptyState icon={Target} title="No goals yet" message="Create your first objective to start tracking progress through the cycle." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          {goals.map((g) => <GoalCard key={g._id} goal={g} onChanged={load} />)}
        </div>
      )}

      <Modal open={open} onClose={() => !saving && setOpen(false)} title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Target size={15} />New Goal</span>} subtitle="Define an objective and optional measurable key results." width={560}
        footer={<>
          <button type="button" className="hrms-btn-ghost" onClick={() => setOpen(false)} disabled={saving}>Cancel</button>
          <button type="submit" form="new-goal-form" className="hrms-btn-primary" disabled={saving}>{saving ? <Loader2 size={13} className="animate-spin" /> : 'Create Goal'}</button>
        </>}>
        <form id="new-goal-form" onSubmit={create}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            <div><label style={{ fontSize: 'var(--text-fs-12)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Objective *</label>
              <input className="hrms-input" style={{ width: '100%', boxSizing: 'border-box' }} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Launch the new onboarding flow" required autoFocus /></div>
            <div><label style={{ fontSize: 'var(--text-fs-12)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Description</label>
              <textarea className="hrms-input" style={{ width: '100%', boxSizing: 'border-box', minHeight: 50, resize: 'vertical' }} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.8rem' }}>
              <div><label style={{ fontSize: 'var(--text-fs-12)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Category</label>
                <select className="hrms-input" style={{ width: '100%', boxSizing: 'border-box' }} value={category} onChange={(e) => setCategory(e.target.value)}>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
              <div><label style={{ fontSize: 'var(--text-fs-12)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Cycle</label>
                <input className="hrms-input" style={{ width: '100%', boxSizing: 'border-box' }} value={cycle} onChange={(e) => setCycle(e.target.value)} /></div>
              <div><label style={{ fontSize: 'var(--text-fs-12)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Weight %</label>
                <input className="hrms-input" style={{ width: '100%', boxSizing: 'border-box' }} type="number" min={0} max={100} value={weight} onChange={(e) => setWeight(e.target.value)} /></div>
            </div>
            <div>
              <label style={{ fontSize: 'var(--text-fs-12)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Key Results</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {krs.map((kr, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6 }}>
                    <input className="hrms-input" style={{ flex: 1, fontSize: 12 }} placeholder={`Key result ${i + 1}`} value={kr.title} onChange={(e) => setKrs(krs.map((k, j) => j === i ? { ...k, title: e.target.value } : k))} />
                    <input className="hrms-input" style={{ width: 70, fontSize: 12 }} type="number" placeholder="target" value={kr.targetValue} onChange={(e) => setKrs(krs.map((k, j) => j === i ? { ...k, targetValue: e.target.value } : k))} />
                    <input className="hrms-input" style={{ width: 50, fontSize: 12 }} placeholder="unit" value={kr.unit} onChange={(e) => setKrs(krs.map((k, j) => j === i ? { ...k, unit: e.target.value } : k))} />
                  </div>
                ))}
                <button type="button" onClick={() => setKrs([...krs, { title: '', targetValue: '100', unit: '%' }])} className="hrms-btn-ghost" style={{ alignSelf: 'flex-start', padding: '0.3rem 0.7rem', fontSize: 11 }}>+ Add key result</button>
              </div>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
