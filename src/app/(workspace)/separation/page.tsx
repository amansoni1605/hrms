'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Plus, Loader2, LogOut, CheckSquare, Square, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

interface FnF { pendingSalary: number; leaveEncashment: number; gratuity: number; advanceDeductions: number; totalPayable: number; status: string; }
interface OffboardTask { _id?: string; task: string; assignedTo: string; status: string; }
interface Separation {
  _id: string; type: string; status: string; noticeDate: string; lastWorkingDay: string;
  offboardingTasks: OffboardTask[]; exitInterviewNotes: string;
  fnf: FnF; notes: string; createdAt: string;
  employeeId: { employeeCode: string; firstName: string; lastName: string; jobTitle: string } | null;
}

const SEP_TYPES = ['resignation','termination','retirement','contract_end'];
const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  initiated:   { bg: '#E8EEF5', fg: 'var(--color-vr-blue-6)' },
  in_progress: { bg: '#FFF3CD', fg: '#856404' },
  completed:   { bg: 'var(--color-semantics-green-1)', fg: 'var(--color-semantics-green-7)' },
  cancelled:   { bg: 'var(--color-semantics-red-1)',   fg: 'var(--color-semantics-red-6)' },
};

export default function SeparationPage() {
  const toast = useToast();
  const [records,  setRecords]  = useState<Separation[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [showForm,   setShowForm]   = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [form, setForm] = useState({ employeeId: '', type: 'resignation', noticeDate: new Date().toISOString().slice(0, 10), lastWorkingDay: '', notes: '' });
  const [empSearch,  setEmpSearch]  = useState('');
  const [empResults, setEmpResults] = useState<Array<{ _id: string; name: string; employeeCode: string; jobTitle: string }>>([]);
  const [empLoading, setEmpLoading] = useState(false);
  const [empLabel,   setEmpLabel]   = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res  = await fetch('/api/separation');
    const json = await res.json();
    setRecords(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const searchEmployees = (q: string) => {
    setEmpSearch(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) { setEmpResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setEmpLoading(true);
      const res  = await fetch(`/api/ws/employees?search=${encodeURIComponent(q)}&limit=8`);
      const json = await res.json();
      setEmpResults((json.data ?? []).map((e: { _id: string; employeeCode: string; jobTitle?: string; name?: string }) => ({
        _id: e._id, employeeCode: e.employeeCode, jobTitle: e.jobTitle ?? '', name: e.name ?? e.employeeCode,
      })));
      setEmpLoading(false);
    }, 300);
  };

  const selectEmployee = (emp: { _id: string; name: string; employeeCode: string; jobTitle: string }) => {
    setForm((f) => ({ ...f, employeeId: emp._id }));
    setEmpLabel(`${emp.name} (${emp.employeeCode})`);
    setEmpSearch('');
    setEmpResults([]);
  };

  const create = async () => {
    if (!form.employeeId || !form.lastWorkingDay) { toast.push({ kind: 'error', title: 'Select an employee and last working day' }); return; }
    setSaving(true);
    const res = await fetch('/api/separation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) {
      toast.push({ kind: 'success', title: 'Separation initiated' });
      setShowForm(false); load();
    } else {
      const j = await res.json();
      toast.push({ kind: 'error', title: j.error ?? 'Failed' });
    }
  };

  const toggleTask = async (sepId: string, taskId: string, currentStatus: string) => {
    setUpdating(taskId);
    await fetch(`/api/separation/${sepId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, taskStatus: currentStatus === 'completed' ? 'pending' : 'completed' }),
    });
    setUpdating(null);
    load();
  };

  const stats = {
    active: records.filter((r) => ['initiated','in_progress'].includes(r.status)).length,
    completed: records.filter((r) => r.status === 'completed').length,
    totalFnF: records.reduce((s, r) => s + (r.fnf?.totalPayable ?? 0), 0),
  };

  return (
    <div style={{ padding: '2rem', maxWidth: 1000 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.6rem' }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-20)', color: 'var(--color-neutral-10)' }}>Separation & Offboarding</h2>
          <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>{records.length} total</p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="hrms-btn-primary"><Plus size={13} /> Initiate Separation</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.6rem' }}>
        {[
          { label: 'Active Cases', value: stats.active, color: '#856404' },
          { label: 'Completed', value: stats.completed, color: 'var(--color-semantics-green-7)' },
          { label: 'Total F&F', value: `₹${stats.totalFnF.toLocaleString('en-IN')}`, color: 'var(--color-vr-blue-6)' },
        ].map((k) => (
          <div key={k.label} className="hrms-kpi-card">
            <p className="hrms-kpi-label">{k.label}</p>
            <p className="hrms-kpi-value" style={{ color: k.color }}>{k.value}</p>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="hrms-card" style={{ padding: '1.6rem', marginBottom: '1.6rem' }}>
          <h3 style={{ margin: '0 0 1.2rem', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-16)', color: 'var(--color-neutral-10)' }}>Initiate Separation</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <SF label="Employee">
              <div style={{ position: 'relative' }}>
                {form.employeeId ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.6rem 0.8rem', borderRadius: '0.6rem', border: '1.5px solid var(--color-vr-blue-6)', background: '#E8EEF5', fontSize: 'var(--text-fs-13)' }}>
                    <span style={{ flex: 1, color: 'var(--color-neutral-10)', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>{empLabel}</span>
                    <button type="button" onClick={() => { setForm((f) => ({ ...f, employeeId: '' })); setEmpLabel(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-neutral-6)', fontSize: 12 }}>✕</button>
                  </div>
                ) : (
                  <>
                    <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-neutral-5)', pointerEvents: 'none' }} />
                    <input
                      value={empSearch}
                      onChange={(e) => searchEmployees(e.target.value)}
                      className="hrms-input"
                      placeholder="Search by name or code…"
                      style={{ paddingLeft: '2.2rem' }}
                    />
                    {empLoading && <Loader2 size={12} className="animate-spin" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-neutral-5)' }} />}
                    {empResults.length > 0 && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: '#fff', border: '1px solid var(--color-stroke)', borderRadius: '0.6rem', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', overflow: 'hidden', marginTop: 2 }}>
                        {empResults.map((emp) => (
                          <div key={emp._id} onClick={() => selectEmployee(emp)} style={{ padding: '0.6rem 0.9rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', borderBottom: '1px solid var(--color-stroke)' }}
                               onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-neutral-2)')}
                               onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}>
                            <span style={{ fontSize: 'var(--text-fs-13)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-10)' }}>{emp.name}</span>
                            <span style={{ fontSize: 11, color: 'var(--color-neutral-6)' }}>{emp.employeeCode} · {emp.jobTitle}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </SF>
            <SF label="Type">
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="hrms-input">
                {SEP_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </SF>
            <SF label="Notice Date"><input type="date" value={form.noticeDate} onChange={(e) => setForm({ ...form, noticeDate: e.target.value })} className="hrms-input" /></SF>
            <SF label="Last Working Day"><input type="date" value={form.lastWorkingDay} onChange={(e) => setForm({ ...form, lastWorkingDay: e.target.value })} className="hrms-input" /></SF>
          </div>
          <SF label="Notes"><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="hrms-input" rows={2} style={{ width: '100%' }} /></SF>
          <div style={{ display: 'flex', gap: '0.8rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
            <button onClick={() => setShowForm(false)} className="hrms-btn-ghost">Cancel</button>
            <button onClick={create} disabled={saving} className="hrms-btn-primary">
              {saving ? <Loader2 size={12} className="animate-spin" /> : <LogOut size={12} />} Initiate
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
            const emp     = rec.employeeId;
            const isOpen  = expanded === rec._id;
            const s       = STATUS_STYLE[rec.status] ?? STATUS_STYLE['initiated']!;
            const done    = rec.offboardingTasks.filter((t) => t.status === 'completed').length;
            const total   = rec.offboardingTasks.length;

            return (
              <div key={rec._id} className="hrms-card" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '1.2rem 1.6rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '1.2rem' }}
                     onClick={() => setExpanded(isOpen ? null : rec._id)}>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontFamily: 'var(--font-in-sb)', fontWeight: 600, fontSize: 'var(--text-fs-14)', color: 'var(--color-neutral-10)' }}>
                      {emp ? `${emp.firstName} ${emp.lastName}` : '—'} <span style={{ color: 'var(--color-neutral-7)', fontWeight: 400 }}>· {emp?.jobTitle}</span>
                    </p>
                    <p style={{ margin: '0.2rem 0 0', fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-7)', textTransform: 'capitalize' }}>
                      {rec.type.replace(/_/g, ' ')} · Last day: {rec.lastWorkingDay ? new Date(rec.lastWorkingDay).toLocaleDateString('en-IN') : '—'}
                    </p>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-14)', color: 'var(--color-vr-blue-6)' }}>
                      ₹{(rec.fnf?.totalPayable ?? 0).toLocaleString('en-IN')}
                    </p>
                    <p style={{ margin: 0, fontSize: 10, color: 'var(--color-neutral-7)' }}>F&F Payable</p>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ margin: 0, fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-7)' }}>{done}/{total}</p>
                    <p style={{ margin: 0, fontSize: 10, color: 'var(--color-neutral-7)' }}>Tasks</p>
                  </div>
                  <span style={{ padding: '0.2rem 0.8rem', borderRadius: 99, background: s.bg, color: s.fg, fontSize: 11, fontFamily: 'var(--font-in-sb)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {rec.status.replace(/_/g, ' ')}
                  </span>
                  {isOpen ? <ChevronUp size={14} style={{ flexShrink: 0 }} /> : <ChevronDown size={14} style={{ flexShrink: 0 }} />}
                </div>
                {isOpen && (
                  <div style={{ padding: '0 1.6rem 1.6rem', borderTop: '1px solid var(--color-stroke)' }}>
                    {/* F&F breakdown */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.8rem', margin: '1.2rem 0', padding: '1rem', background: 'var(--color-neutral-2)', borderRadius: '0.8rem' }}>
                      {[
                        { label: 'Pending Salary', value: rec.fnf?.pendingSalary ?? 0 },
                        { label: 'Leave Encashment', value: rec.fnf?.leaveEncashment ?? 0 },
                        { label: 'Gratuity', value: rec.fnf?.gratuity ?? 0 },
                        { label: 'Deductions', value: rec.fnf?.advanceDeductions ?? 0 },
                      ].map((f) => (
                        <div key={f.label} style={{ textAlign: 'center' }}>
                          <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 10 }}>{f.label}</p>
                          <p style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-14)', color: 'var(--color-neutral-10)' }}>₹{f.value.toLocaleString('en-IN')}</p>
                        </div>
                      ))}
                    </div>
                    {/* Checklist */}
                    <h4 style={{ margin: '0 0 0.6rem', color: 'var(--color-neutral-8)', fontSize: 10, fontFamily: 'var(--font-in-sb)', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase' }}>Offboarding Checklist</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      {rec.offboardingTasks.map((task) => {
                        const isDone = task.status === 'completed';
                        return (
                          <div key={task._id} style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', padding: '0.5rem 0.8rem', borderRadius: '0.6rem', background: isDone ? 'var(--color-semantics-green-1)' : 'var(--color-neutral-2)', cursor: 'pointer' }}
                               onClick={() => task._id && toggleTask(rec._id, task._id, task.status)}>
                            {updating === task._id ? <Loader2 size={14} className="animate-spin" style={{ flexShrink: 0 }} />
                              : isDone ? <CheckSquare size={14} style={{ color: 'var(--color-semantics-green-7)', flexShrink: 0 }} />
                              : <Square size={14} style={{ color: 'var(--color-neutral-6)', flexShrink: 0 }} />}
                            <span style={{ flex: 1, fontSize: 'var(--text-fs-12)', color: isDone ? 'var(--color-semantics-green-7)' : 'var(--color-neutral-10)', textDecoration: isDone ? 'line-through' : 'none' }}>
                              {task.task}
                            </span>
                            <span style={{ fontSize: 10, color: 'var(--color-neutral-6)', textTransform: 'capitalize' }}>{task.assignedTo}</span>
                          </div>
                        );
                      })}
                    </div>
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

function SF({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', marginBottom: 4, color: 'var(--color-neutral-8)', fontSize: 10, fontFamily: 'var(--font-in-sb)', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase' }}>{label}</label>
      {children}
    </div>
  );
}
