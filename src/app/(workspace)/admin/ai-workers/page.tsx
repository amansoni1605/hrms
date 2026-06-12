'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Bot, Cpu, AlertTriangle, Loader2, RefreshCw,
  Pause, Play, XCircle, DollarSign, GitBranch, Users, ShieldAlert,
} from 'lucide-react';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Modal }              from '@/components/ui/Modal';
import { useToast }           from '@/components/ui/Toast';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface AIWorker {
  _id:                 string;
  employeeCode:        string;
  jobTitle:            string;
  agentFramework?:     string;
  modelVersion?:       string;
  tokenBudgetMonthly?: number;
  tokenBudgetUsed?:    number;
  apiCostMtd?:         number;
  status?:             string;
  supervisor?:         string;
  repo?:               string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function AIWorkersPage() {
  const toast = useToast();
  const [workers, setWorkers] = useState<AIWorker[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AIWorker | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res  = await fetch('/api/ws/ai-workers');
    const json = await res.json();
    setWorkers(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const throttle = async (id: string, body: Record<string, unknown>, successMsg: string) => {
    const res = await fetch(`/api/ws/ai-workers/${id}/throttle`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    if (res.ok) {
      toast.push({ kind: 'success', title: successMsg });
      await load();
    } else {
      const j = await res.json();
      toast.push({ kind: 'error', title: j.error ?? 'Throttle failed' });
    }
  };

  const totalCost     = workers.reduce((s, w) => s + (w.apiCostMtd ?? 0), 0);
  const totalUsed     = workers.reduce((s, w) => s + (w.tokenBudgetUsed ?? 0), 0);
  const totalBudget   = workers.reduce((s, w) => s + (w.tokenBudgetMonthly ?? 0), 0);
  const utilization   = totalBudget > 0 ? totalUsed / totalBudget : 0;

  return (
    <div style={{ padding: '2rem 2.4rem 6rem 2.4rem', maxWidth: 1400, minHeight: 'calc(100vh - 56px)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.6rem' }}>
        <Bot size={20} style={{ color: '#3759BF' }} />
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, color: 'var(--color-neutral-10)', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-20)' }}>
            AI Digital Worker Orchestrator
          </h2>
          <p style={{ margin: 0, marginTop: 4, color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
            Token budgets · MTD cost · supervisor lines · throttle controls. Stub agents persist in-memory only.
          </p>
        </div>
        <button onClick={load} className="hrms-btn-ghost" style={{ padding: '0.8rem' }}>
          <RefreshCw size={13} />
        </button>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.6rem' }}>
        <Stat label="Active Agents"  value={String(workers.length)}                                icon={<Bot size={16} style={{ color: '#3759BF' }} />}                accent="#E5F4FF" />
        <Stat label="Total Tokens"   value={`${(totalUsed / 1000).toFixed(0)}k / ${(totalBudget / 1000).toFixed(0)}k`} icon={<Cpu size={16} style={{ color: 'var(--color-vr-blue-7)' }} />} accent="var(--color-vr-blue-1)" />
        <Stat label="Utilisation"    value={`${(utilization * 100).toFixed(0)}%`}                  icon={<DollarSign size={16} style={{ color: 'var(--color-semantics-orange-7)' }} />} accent="#FFF6E6"
              variant={utilization >= 0.80 ? 'danger' : utilization >= 0.60 ? 'warning' : 'success'} />
        <Stat label="MTD API Cost"   value={`$${totalCost.toFixed(2)}`}                            icon={<DollarSign size={16} style={{ color: 'var(--color-semantics-green-7)' }} />} accent="var(--color-semantics-green-1)" />
      </div>

      {/* Worker grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '1.2rem' }}>
        {loading
          ? <Loader2 size={20} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
          : workers.length === 0
            ? <p style={{ color: 'var(--color-neutral-7)' }}>No AI workers registered.</p>
            : workers.map((w) => {
                const budget = w.tokenBudgetMonthly ?? 1_000_000;
                const used   = w.tokenBudgetUsed ?? 0;
                const pct    = Math.round((used / Math.max(budget, 1)) * 100);
                const status = w.status ?? 'active';
                const overBudget = pct >= 80;

                return (
                  <div key={w._id} className="hrms-card" style={{ padding: '1.4rem 1.6rem' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1rem' }}>
                      <div style={{
                        width: 42, height: 42, borderRadius: '0.8rem',
                        background: '#E5F4FF',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        <Cpu size={18} style={{ color: '#3759BF' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                          <h4 style={{ margin: 0, color: 'var(--color-neutral-10)', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-14)' }}>
                            {w.jobTitle}
                          </h4>
                          <StatusBadge status={status} />
                          {overBudget && <Badge variant="danger" dot>Over 80%</Badge>}
                        </div>
                        <p style={{ margin: 0, marginTop: 2, color: 'var(--color-neutral-7)', fontSize: 10, fontFamily: 'monospace' }}>
                          {w.employeeCode} · {w.agentFramework ?? 'unknown'} · {w.modelVersion ?? '—'}
                        </p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ margin: 0, color: 'var(--color-semantics-green-7)', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-16)' }}>
                          ${(w.apiCostMtd ?? 0).toFixed(2)}
                        </p>
                        <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 10 }}>MTD cost</p>
                      </div>
                    </div>

                    {/* Token budget bar */}
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ color: 'var(--color-neutral-7)', fontSize: 10 }}>Token budget</span>
                        <span style={{ color: 'var(--color-neutral-9)', fontSize: 10, fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
                          {(used / 1000).toFixed(0)}k / {(budget / 1000).toFixed(0)}k ({pct}%)
                        </span>
                      </div>
                      <div style={{ height: 6, background: 'var(--color-neutral-4)', borderRadius: 9999, overflow: 'hidden' }}>
                        <div style={{
                          width: `${pct}%`, height: '100%',
                          background:
                            pct >= 90 ? 'var(--color-semantics-red-6)' :
                            pct >= 80 ? 'var(--color-semantics-orange-6)' :
                                        '#3759BF',
                          transition: 'width 200ms ease',
                        }} />
                      </div>
                    </div>

                    {/* Supervisor + repo */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1rem' }}>
                      {w.supervisor && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-7)' }}>
                          <Users size={12} /> Supervisor: <span style={{ color: 'var(--color-neutral-10)', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>{w.supervisor}</span>
                        </div>
                      )}
                      {w.repo && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-7)' }}>
                          <GitBranch size={12} /> <span style={{ color: 'var(--color-vr-blue-6)', fontFamily: 'monospace', fontSize: 11 }}>{w.repo}</span>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <button onClick={() => setSelected(w)} className="hrms-btn-ghost" style={{ padding: '0.4rem 0.8rem', fontSize: 'var(--text-fs-12)' }}>
                        Adjust budget
                      </button>
                      {status === 'active' ? (
                        <button onClick={() => throttle(w._id, { status: 'suspended' }, `Suspended ${w.employeeCode}`)} className="hrms-btn-ghost" style={{ padding: '0.4rem 0.8rem', fontSize: 'var(--text-fs-12)', color: 'var(--color-semantics-orange-7)', borderColor: '#FFD891' }}>
                          <Pause size={11} /> Suspend
                        </button>
                      ) : (
                        <button onClick={() => throttle(w._id, { status: 'active' }, `Re-activated ${w.employeeCode}`)} className="hrms-btn-ghost" style={{ padding: '0.4rem 0.8rem', fontSize: 'var(--text-fs-12)', color: 'var(--color-semantics-green-7)', borderColor: 'var(--color-semantics-green-3)' }}>
                          <Play size={11} /> Resume
                        </button>
                      )}
                      <button onClick={() => throttle(w._id, { status: 'revoked' }, `Revoked ${w.employeeCode}`)} className="hrms-btn-ghost" style={{ padding: '0.4rem 0.8rem', fontSize: 'var(--text-fs-12)', color: 'var(--color-semantics-red-6)', borderColor: 'var(--color-semantics-red-2)' }}>
                        <XCircle size={11} /> Revoke
                      </button>
                    </div>
                  </div>
                );
              })}
      </div>

      {/* Adjust budget modal */}
      {selected && (
        <AdjustBudgetModal
          worker={selected}
          onClose={() => setSelected(null)}
          onSave={async (newBudget) => {
            await throttle(selected._id, { tokenBudgetMonthly: newBudget }, `Updated budget for ${selected.employeeCode}`);
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function Stat({ label, value, icon, accent, variant }: {
  label: string; value: string; icon: React.ReactNode; accent: string;
  variant?: 'success' | 'warning' | 'danger';
}) {
  const color =
    variant === 'danger'  ? 'var(--color-semantics-red-6)' :
    variant === 'warning' ? 'var(--color-semantics-orange-7)' :
    variant === 'success' ? 'var(--color-semantics-green-7)' :
                             'var(--color-neutral-10)';
  return (
    <div className="hrms-card" style={{ padding: '1.2rem 1.4rem', display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
      <div style={{ width: 36, height: 36, borderRadius: '0.6rem', background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>{label}</p>
        <p style={{ margin: '0.2rem 0 0', color, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-22)', fontVariantNumeric: 'tabular-nums' }}>
          {value}
        </p>
      </div>
    </div>
  );
}

function AdjustBudgetModal({ worker, onClose, onSave }: {
  worker:  AIWorker;
  onClose: () => void;
  onSave:  (newBudget: number) => Promise<void>;
}) {
  const [val, setVal] = useState(String(worker.tokenBudgetMonthly ?? 1_000_000));
  const [busy, setBusy] = useState(false);

  return (
    <Modal open onClose={onClose}
           title={`Adjust budget · ${worker.employeeCode}`}
           subtitle={worker.jobTitle}
           width={420}
           footer={
             <>
               <button onClick={onClose} className="hrms-btn-ghost">Cancel</button>
               <button onClick={async () => {
                 const n = Number(val);
                 if (isNaN(n) || n < 0) return;
                 setBusy(true);
                 await onSave(n);
                 setBusy(false);
               }} disabled={busy} className="hrms-btn-primary">
                 {busy ? <Loader2 size={12} className="animate-spin" /> : null}
                 Save Budget
               </button>
             </>
           }>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ padding: '0.8rem 1rem', borderRadius: '0.6rem', background: 'var(--color-vr-blue-1)', border: '1px solid var(--color-vr-blue-2)', display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
          <ShieldAlert size={13} style={{ color: 'var(--color-vr-blue-7)', marginTop: 2, flexShrink: 0 }} />
          <p style={{ margin: 0, color: 'var(--color-vr-blue-8)', fontSize: 'var(--text-fs-12)' }}>
            Token budget caps monthly LLM-API spend for this agent.
            Current usage: <strong>{((worker.tokenBudgetUsed ?? 0) / 1000).toFixed(0)}k tokens</strong>.
          </p>
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 4, color: 'var(--color-neutral-8)', fontSize: 10, fontFamily: 'var(--font-in-sb)', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
            New Monthly Token Budget
          </label>
          <input type="number" min="0" step="100000" value={val} onChange={(e) => setVal(e.target.value)} className="hrms-input" />
          <p style={{ margin: '4px 0 0', color: 'var(--color-neutral-7)', fontSize: 11 }}>
            = {(Number(val) / 1000).toFixed(0)}k tokens
          </p>
        </div>
      </div>
    </Modal>
  );
}
