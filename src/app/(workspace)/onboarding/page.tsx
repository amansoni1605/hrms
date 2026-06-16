'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Loader2, CheckSquare, Square, UserCheck, BookOpen } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

interface OnboardTask { _id?: string; title: string; category: string; assignedTo: string; status: string; dueDate?: string; }
interface Onboarding {
  _id: string; status: string; tasks: OnboardTask[];
  startDate: string; targetCompletionDate: string; completedAt?: string;
  employeeId: { _id: string; employeeCode: string; name: string; jobTitle: string; departmentName?: string } | null;
}
interface TrainingEnrollment {
  _id: string; title: string; category: string; isMandatory: boolean;
  myEnrollment: { status: string; result: string; attendedAt?: string } | null;
}

const CATEGORY_COLOR: Record<string, string> = {
  documentation: '#E8EEF5', it_setup: '#FFF3CD', training: '#EEF0FF', orientation: 'var(--color-semantics-green-1)', other: '#F5F5F5',
};
const ASSIGNEE_LABEL: Record<string, string> = {
  employee: 'Employee', hr: 'HR', it: 'IT', manager: 'Manager',
};
const ENROLL_STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  enrolled:  { bg: '#E8EEF5', fg: 'var(--color-vr-blue-6)' },
  completed: { bg: 'var(--color-semantics-green-1)', fg: 'var(--color-semantics-green-7)' },
  absent:    { bg: 'var(--color-semantics-red-1)',   fg: 'var(--color-semantics-red-6)' },
  withdrawn: { bg: '#F5F5F5',                        fg: 'var(--color-neutral-7)' },
};

export default function OnboardingPage() {
  const toast = useToast();
  const [records,        setRecords]        = useState<Onboarding[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [expanded,       setExpanded]       = useState<string | null>(null);
  const [updating,       setUpdating]       = useState<string | null>(null);
  const [showForm,       setShowForm]       = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [newEmpId,       setNewEmpId]       = useState('');
  const [trainingMap,    setTrainingMap]    = useState<Record<string, TrainingEnrollment[]>>({});
  const [trainingLoading, setTrainingLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res  = await fetch('/api/onboarding');
    const json = await res.json();
    setRecords(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadTraining = useCallback(async (rec: Onboarding) => {
    const empId = rec.employeeId?._id;
    if (!empId || trainingMap[rec._id]) return;
    setTrainingLoading(rec._id);
    const res  = await fetch(`/api/training?employeeId=${empId}`);
    const json = await res.json();
    setTrainingMap((prev) => ({ ...prev, [rec._id]: json.data ?? [] }));
    setTrainingLoading(null);
  }, [trainingMap]);

  const handleExpand = (rec: Onboarding) => {
    const nextId = expanded === rec._id ? null : rec._id;
    setExpanded(nextId);
    if (nextId) loadTraining(rec);
  };

  const createOnboarding = async () => {
    if (!newEmpId.trim()) { toast.push({ kind: 'error', title: 'Employee ID required' }); return; }
    setSaving(true);
    const res = await fetch('/api/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId: newEmpId, startDate: new Date().toISOString() }),
    });
    setSaving(false);
    if (res.ok) {
      toast.push({ kind: 'success', title: 'Onboarding created' });
      setShowForm(false); setNewEmpId(''); load();
    } else {
      const j = await res.json();
      toast.push({ kind: 'error', title: j.error ?? 'Failed' });
    }
  };

  const toggleTask = async (recordId: string, taskId: string, currentStatus: string) => {
    setUpdating(taskId);
    await fetch(`/api/onboarding/${recordId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, taskStatus: currentStatus === 'completed' ? 'pending' : 'completed' }),
    });
    setUpdating(null);
    load();
  };

  const stats = {
    notStarted:  records.filter((r) => r.status === 'not_started').length,
    inProgress:  records.filter((r) => r.status === 'in_progress').length,
    completed:   records.filter((r) => r.status === 'completed').length,
  };

  return (
    <div style={{ padding: '2rem', maxWidth: 1000 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.6rem' }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-20)', color: 'var(--color-neutral-10)' }}>Onboarding</h2>
          <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>{records.length} records</p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="hrms-btn-primary"><Plus size={13} /> Start Onboarding</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.6rem' }}>
        {[
          { label: 'Not Started', value: stats.notStarted, color: 'var(--color-neutral-7)' },
          { label: 'In Progress', value: stats.inProgress, color: '#856404' },
          { label: 'Completed',   value: stats.completed,  color: 'var(--color-semantics-green-7)' },
        ].map((k) => (
          <div key={k.label} className="hrms-kpi-card">
            <p className="hrms-kpi-label">{k.label}</p>
            <p className="hrms-kpi-value" style={{ color: k.color }}>{k.value}</p>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="hrms-card" style={{ padding: '1.6rem', marginBottom: '1.6rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-16)', color: 'var(--color-neutral-10)' }}>Start Onboarding</h3>
          <label style={{ display: 'block', marginBottom: 4, color: 'var(--color-neutral-8)', fontSize: 10, fontFamily: 'var(--font-in-sb)', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase' }}>Employee ID (MongoDB _id)</label>
          <input value={newEmpId} onChange={(e) => setNewEmpId(e.target.value)} className="hrms-input" placeholder="Employee document _id…" style={{ marginBottom: '1rem' }} />
          <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'flex-end' }}>
            <button onClick={() => setShowForm(false)} className="hrms-btn-ghost">Cancel</button>
            <button onClick={createOnboarding} disabled={saving} className="hrms-btn-primary">
              {saving ? <Loader2 size={12} className="animate-spin" /> : <UserCheck size={12} />} Create
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <Loader2 size={22} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {records.map((rec) => {
            const emp        = rec.employeeId;
            const isOpen     = expanded === rec._id;
            const done       = rec.tasks.filter((t) => t.status === 'completed').length;
            const total      = rec.tasks.length;
            const pct        = total > 0 ? Math.round(done / total * 100) : 0;
            const statusColor = rec.status === 'completed' ? 'var(--color-semantics-green-7)'
              : rec.status === 'in_progress' ? '#856404' : 'var(--color-neutral-7)';
            const trainingPrograms = trainingMap[rec._id] ?? [];
            const trainingDone = trainingPrograms.filter((p) => p.myEnrollment?.status === 'completed').length;

            return (
              <div key={rec._id} className="hrms-card" style={{ overflow: 'hidden' }}>
                {/* Header row */}
                <div style={{ padding: '1.2rem 1.6rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '1.2rem' }}
                     onClick={() => handleExpand(rec)}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--color-vr-blue-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <UserCheck size={18} style={{ color: 'var(--color-vr-blue-6)' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontFamily: 'var(--font-in-sb)', fontWeight: 600, fontSize: 'var(--text-fs-14)', color: 'var(--color-neutral-10)' }}>
                      {emp?.name ?? '—'} <span style={{ color: 'var(--color-neutral-5)', fontSize: 11, fontWeight: 400 }}>{emp?.employeeCode}</span>
                      {emp?.jobTitle && <span style={{ color: 'var(--color-neutral-7)', fontWeight: 400 }}> · {emp.jobTitle}</span>}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.4rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: 120, height: 6, background: 'var(--color-stroke)', borderRadius: 99 }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? 'var(--color-semantics-green-7)' : 'var(--color-vr-blue-6)', borderRadius: 99, transition: 'width 300ms ease' }} />
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--color-neutral-7)' }}>{done}/{total} tasks</span>
                      </div>
                      {/* Training summary pill — only shows after onboarding completes */}
                      {rec.status === 'completed' && trainingPrograms.length > 0 && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '0.15rem 0.6rem', borderRadius: 99, background: trainingDone === trainingPrograms.length ? 'var(--color-semantics-green-1)' : '#FFF3CD', color: trainingDone === trainingPrograms.length ? 'var(--color-semantics-green-7)' : '#856404', fontSize: 10, fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
                          <BookOpen size={9} /> Training {trainingDone}/{trainingPrograms.length}
                        </span>
                      )}
                    </div>
                  </div>
                  <span style={{ padding: '0.2rem 0.8rem', borderRadius: 99, background: '#F5F5F5', color: statusColor, fontSize: 11, fontFamily: 'var(--font-in-sb)', fontWeight: 600, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
                    {rec.status.replace(/_/g, ' ')}
                  </span>
                </div>

                {/* Expanded panel */}
                {isOpen && (
                  <div style={{ borderTop: '1px solid var(--color-stroke)' }}>
                    {/* Onboarding tasks */}
                    <div style={{ padding: '0.8rem 1.6rem 1.2rem' }}>
                      <p style={{ margin: '0 0 0.6rem', fontSize: 11, fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-7)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>Onboarding Tasks</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {rec.tasks.map((task) => {
                          const isDone = task.status === 'completed';
                          return (
                            <div key={task._id} style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', padding: '0.6rem', borderRadius: '0.6rem', background: isDone ? 'var(--color-semantics-green-1)' : 'var(--color-neutral-2)', cursor: 'pointer' }}
                                 onClick={() => task._id && toggleTask(rec._id, task._id, task.status)}>
                              {updating === task._id ? <Loader2 size={16} className="animate-spin" style={{ flexShrink: 0, color: 'var(--color-vr-blue-6)' }} />
                                : isDone ? <CheckSquare size={16} style={{ color: 'var(--color-semantics-green-7)', flexShrink: 0 }} />
                                : <Square size={16} style={{ color: 'var(--color-neutral-6)', flexShrink: 0 }} />}
                              <span style={{ flex: 1, fontSize: 'var(--text-fs-12)', color: isDone ? 'var(--color-semantics-green-7)' : 'var(--color-neutral-10)', textDecoration: isDone ? 'line-through' : 'none' }}>
                                {task.title}
                              </span>
                              <span style={{ fontSize: 10, color: 'var(--color-neutral-6)', flexShrink: 0, textTransform: 'capitalize' }}>
                                {CATEGORY_COLOR[task.category] ? task.category.replace(/_/g, ' ') : task.category} · {ASSIGNEE_LABEL[task.assignedTo] ?? task.assignedTo}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Training section — shows after onboarding is completed */}
                    {rec.status === 'completed' && (
                      <div style={{ padding: '0.8rem 1.6rem 1.2rem', borderTop: '1px solid var(--color-stroke)', background: 'var(--color-neutral-1)' }}>
                        <p style={{ margin: '0 0 0.6rem', fontSize: 11, fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-7)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                          Training Status
                        </p>
                        {trainingLoading === rec._id ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-neutral-6)', fontSize: 'var(--text-fs-12)' }}>
                            <Loader2 size={14} className="animate-spin" /> Loading training data…
                          </div>
                        ) : trainingPrograms.length === 0 ? (
                          <p style={{ margin: 0, fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-6)' }}>
                            No training programs enrolled. Ask HR to seed default programs.
                          </p>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            {trainingPrograms.map((prog) => {
                              const enroll = prog.myEnrollment;
                              const style  = ENROLL_STATUS_STYLE[enroll?.status ?? 'enrolled'] ?? ENROLL_STATUS_STYLE['enrolled'];
                              return (
                                <div key={prog._id} style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', padding: '0.55rem 0.8rem', borderRadius: '0.6rem', background: 'var(--color-neutral-2)' }}>
                                  <BookOpen size={14} style={{ color: 'var(--color-vr-blue-6)', flexShrink: 0 }} />
                                  <span style={{ flex: 1, fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-10)', fontFamily: 'var(--font-in-sb)', fontWeight: 500 }}>
                                    {prog.title}
                                    {prog.isMandatory && <span style={{ marginLeft: 6, fontSize: 9, background: '#FFF3CD', color: '#856404', padding: '0.1rem 0.4rem', borderRadius: 99, fontWeight: 600 }}>MANDATORY</span>}
                                  </span>
                                  <span style={{ fontSize: 10, fontFamily: 'var(--font-in-sb)', fontWeight: 600, padding: '0.15rem 0.6rem', borderRadius: 99, background: style.bg, color: style.fg, flexShrink: 0, textTransform: 'capitalize' }}>
                                    {enroll?.status ?? '—'}
                                  </span>
                                  {enroll?.attendedAt && (
                                    <span style={{ fontSize: 10, color: 'var(--color-neutral-5)', flexShrink: 0 }}>
                                      {new Date(enroll.attendedAt).toLocaleDateString()}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
