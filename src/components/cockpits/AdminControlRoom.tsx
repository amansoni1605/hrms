'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Building2, Bot, Shield, Activity,
  Cpu, Loader2,
  RefreshCw, Plus, CheckCircle2, Clock, ToggleLeft, ToggleRight,
  AlertTriangle, TrendingUp,
} from 'lucide-react';
import { StatCard }              from '@/components/ui/StatCard';
import { Badge, StatusBadge }    from '@/components/ui/Badge';
import { AddTenantModal }        from '@/components/widgets/AddTenantModal';
import { TenantDetailDrawer }    from '@/components/widgets/TenantDetailDrawer';

// ── Types ────────────────────────────────────────────────────────────────────

interface TenantRow {
  _id:           string;
  slug:          string;
  legalName:     string;
  displayName?:  string;
  primaryCountry: string;
  primaryCurrency: string;
  subscription:  { tier: string; maxSeats: number; usedSeats: number };
  kmsProvider:   string;
  isActive:      boolean;
  setupComplete: boolean;
  setupStep:     number;
  logoData?:     string;
  brandColor?:   string;
  liveHeadcount: number;
  createdAt:     string;
}

interface AuditEntry {
  _id: string; actionType: string; targetCollection: string;
  changeSummary?: Record<string, unknown>; createdAt: string;
  sequenceNumber?: number; digitalSignature?: string;
}

interface AIWorker {
  _id: string; employeeCode: string; jobTitle: string;
  agentFramework?: string; modelVersion?: string;
  tokenBudgetMonthly?: number; tokenBudgetUsed?: number; apiCostMtd?: number;
  status?: string; supervisor?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tenant Fleet Grid
// ─────────────────────────────────────────────────────────────────────────────

function TenantFleetGrid({
  tenants, loading, onRefresh, onManage,
}: {
  tenants: TenantRow[];
  loading: boolean;
  onRefresh: () => void;
  onManage: (id: string) => void;
}) {
  const [toggling, setToggling] = useState<string | null>(null);

  const toggleActive = async (t: TenantRow) => {
    setToggling(t._id);
    try {
      await fetch(`/api/ws/tenants/${t._id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ isActive: !t.isActive }),
      });
      onRefresh();
    } finally {
      setToggling(null);
    }
  };

  return (
    <div className="hrms-card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.6rem',
        padding: '1rem 1.6rem',
        borderBottom: '1px solid var(--color-stroke)',
        background: 'var(--color-neutral-2)',
      }}>
        <Building2 size={14} style={{ color: 'var(--color-vr-blue-6)' }} />
        <h3 className="hrms-section-label" style={{ flex: 1 }}>Tenant Fleet</h3>
        {!loading && <Badge variant="info">{tenants.length} tenants</Badge>}
        <button
          onClick={onRefresh}
          style={{ padding: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-neutral-7)' }}
        >
          <RefreshCw size={12} />
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <Loader2 size={18} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
        </div>
      ) : tenants.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
          No tenants yet. Add the first tenant using the button above.
        </div>
      ) : (
        <div>
          {tenants.map((t) => {
            const name      = t.displayName ?? t.legalName;
            const initial   = name.charAt(0).toUpperCase();
            const color     = t.brandColor ?? '#1C509D';
            const maxSeats  = t.subscription.maxSeats;
            const used      = t.liveHeadcount;
            const seatPct   = maxSeats > 0 ? Math.round((used / maxSeats) * 100) : 0;
            const seatColor = seatPct >= 90 ? 'var(--color-semantics-red-6)'
                            : seatPct >= 70 ? 'var(--color-semantics-orange-6)'
                            : 'var(--color-vr-blue-6)';

            return (
              <div
                key={t._id}
                style={{
                  display: 'flex', alignItems: 'center', gap: '1rem',
                  padding: '0.9rem 1.6rem',
                  borderBottom: '1px solid var(--color-neutral-4)',
                  opacity: t.isActive ? 1 : 0.6,
                }}
              >
                {/* Logo / initial */}
                {t.logoData ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={t.logoData}
                    alt={name}
                    style={{ width: 32, height: 32, borderRadius: '0.5rem', objectFit: 'contain', flexShrink: 0 }}
                  />
                ) : (
                  <div style={{
                    width: 32, height: 32, borderRadius: '0.5rem', flexShrink: 0,
                    background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 14,
                  }}>
                    {initial}
                  </div>
                )}

                {/* Name + slug + setup status */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--color-neutral-10)', fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
                      {name}
                    </span>
                    <Badge variant="purple">{t.subscription.tier}</Badge>
                    <StatusBadge status={t.isActive ? 'active' : 'suspended'} />
                    {t.setupComplete ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--color-semantics-green-7)' }}>
                        <CheckCircle2 size={10} /> Setup done
                      </span>
                    ) : (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--color-semantics-orange-7)' }}>
                        <Clock size={10} /> Step {t.setupStep}/6
                      </span>
                    )}
                  </div>
                  <p style={{ margin: 0, marginTop: 2, color: 'var(--color-neutral-6)', fontSize: 10, fontFamily: 'monospace' }}>
                    {t.slug} · {t.primaryCountry} · {t.primaryCurrency}
                  </p>
                </div>

                {/* Seat usage bar */}
                <div style={{ width: 120, flexShrink: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 10, color: 'var(--color-neutral-7)' }}>Seats</span>
                    <span style={{ fontSize: 10, color: 'var(--color-neutral-9)', fontVariantNumeric: 'tabular-nums' }}>
                      {used} / {maxSeats}
                    </span>
                  </div>
                  <div style={{ height: 4, background: 'var(--color-neutral-4)', borderRadius: 9999, overflow: 'hidden' }}>
                    <div style={{ width: `${seatPct}%`, height: '100%', background: seatColor }} />
                  </div>
                </div>

                {/* Manage button */}
                <button
                  onClick={() => onManage(t._id)}
                  className="hrms-btn-ghost"
                  style={{ padding: '0.35rem 0.8rem', fontSize: 11, flexShrink: 0, whiteSpace: 'nowrap' }}
                >
                  Manage
                </button>

                {/* Suspend / Activate toggle */}
                <button
                  onClick={() => toggleActive(t)}
                  disabled={toggling === t._id}
                  title={t.isActive ? 'Suspend tenant' : 'Activate tenant'}
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: t.isActive ? 'var(--color-vr-blue-6)' : 'var(--color-neutral-6)',
                    flexShrink: 0, padding: 4,
                  }}
                >
                  {toggling === t._id
                    ? <Loader2 size={18} className="animate-spin" />
                    : t.isActive
                      ? <ToggleRight size={20} />
                      : <ToggleLeft size={20} />
                  }
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit Ledger
// ─────────────────────────────────────────────────────────────────────────────

const SEV_RAIL: Record<string, string> = {
  SALARY_CHANGE:            'var(--color-semantics-orange-7)',
  BANKING_CHANGE:           'var(--color-semantics-orange-7)',
  PERMISSION_ESCALATION:    'var(--color-semantics-red-6)',
  DEVICE_COMPLIANCE_BREACH: 'var(--color-semantics-red-6)',
  ACCESS_REVOKED:           'var(--color-semantics-red-6)',
  LIVENESS_FAILED:          'var(--color-semantics-red-6)',
  PAYROLL_APPROVED:         'var(--color-vr-blue-6)',
  PAYROLL_REVERSED:         'var(--color-semantics-orange-7)',
  DEK_ROTATION:             'var(--color-vr-blue-6)',
  LIVENESS_VERIFIED:        'var(--color-semantics-green-7)',
  TENANT_UPDATED:           'var(--color-semantics-orange-7)',
  INSERT:                   'var(--color-neutral-6)',
  UPDATE:                   'var(--color-neutral-6)',
  DELETE:                   'var(--color-semantics-red-6)',
};

function AuditLedger() {
  const [logs,    setLogs]    = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page,    setPage]    = useState(1);
  const [total,   setTotal]   = useState(0);

  const load = (p = 1) => {
    setLoading(true);
    fetch(`/api/ws/audit?page=${p}&limit=10`)
      .then((r) => r.json())
      .then((d) => { setLogs(d.data ?? []); setTotal(d.pagination?.total ?? 0); })
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(page); }, [page]);

  return (
    <div className="hrms-card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.6rem',
        padding: '1rem 1.6rem',
        borderBottom: '1px solid var(--color-stroke)',
        background: 'var(--color-neutral-2)',
      }}>
        <Shield size={14} style={{ color: 'var(--color-vr-blue-6)' }} />
        <h3 className="hrms-section-label" style={{ flex: 1 }}>Immutable Audit Ledger</h3>
        <Badge variant="info">{total.toLocaleString()} entries</Badge>
        <button
          onClick={() => load(page)}
          style={{ padding: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-neutral-7)' }}
        >
          <RefreshCw size={12} />
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2.4rem' }}>
          <Loader2 size={18} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
        </div>
      ) : logs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2.4rem', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
          No audit entries yet.
        </div>
      ) : (
        <div>
          {logs.map((entry) => (
            <div
              key={entry._id}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.8rem',
                padding: '0.8rem 1.6rem',
                borderBottom: '1px solid var(--color-neutral-4)',
              }}
            >
              <div
                aria-hidden
                style={{
                  width: 3, height: 28, borderRadius: 2, flexShrink: 0,
                  background: SEV_RAIL[entry.actionType] ?? 'var(--color-neutral-5)',
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span style={{ color: 'var(--color-neutral-10)', fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
                    {entry.actionType.replace(/_/g, ' ')}
                  </span>
                  <Badge variant="neutral">{entry.targetCollection}</Badge>
                </div>
                <p style={{
                  margin: 0, marginTop: 2, color: 'var(--color-neutral-7)', fontSize: 10,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  seq #{entry.sequenceNumber} · sig {entry.digitalSignature?.slice(0, 12)}…
                </p>
              </div>
              <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 10, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                {new Date(entry.createdAt).toLocaleString('en-US', {
                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                })}
              </p>
            </div>
          ))}
        </div>
      )}

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.6rem 1.6rem',
        background: 'var(--color-neutral-2)',
        borderTop: '1px solid var(--color-stroke)',
      }}>
        <span style={{ color: 'var(--color-neutral-7)', fontSize: 10 }}>
          Page {page} · {total} total
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="hrms-btn-ghost" style={{ padding: '0.3rem 0.8rem', fontSize: 10 }}>
            Prev
          </button>
          <button disabled={logs.length < 10} onClick={() => setPage((p) => p + 1)} className="hrms-btn-ghost" style={{ padding: '0.3rem 0.8rem', fontSize: 10 }}>
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Digital Worker Grid
// ─────────────────────────────────────────────────────────────────────────────

function DigitalWorkerGrid() {
  const [workers, setWorkers] = useState<AIWorker[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/ws/ai-workers')
      .then((r) => r.json())
      .then((d) => setWorkers(d.data ?? []))
      .catch(() => setWorkers([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="hrms-card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.6rem',
        padding: '1rem 1.6rem',
        borderBottom: '1px solid var(--color-stroke)',
        background: 'var(--color-neutral-2)',
      }}>
        <Bot size={14} style={{ color: '#3759BF' }} />
        <h3 className="hrms-section-label" style={{ flex: 1 }}>AI Digital Workers</h3>
        {!loading && <Badge variant="cyan">{workers.length} agents</Badge>}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2.4rem' }}>
          <Loader2 size={18} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
        </div>
      ) : workers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2.4rem', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
          No AI workers registered.
        </div>
      ) : (
        <div>
          {workers.map((w) => {
            const budget    = w.tokenBudgetMonthly ?? 1_000_000;
            const used      = w.tokenBudgetUsed    ?? 0;
            const pct       = Math.round((used / Math.max(budget, 1)) * 100);
            const cost      = w.apiCostMtd ?? 0;
            const status    = w.status ?? 'active';
            const framework = w.agentFramework ?? 'unknown';
            const fillColor = pct >= 80 ? 'var(--color-semantics-red-6)'
                            : pct >= 60 ? 'var(--color-semantics-orange-6)'
                            : '#3759BF';

            return (
              <div key={String(w._id)} style={{ padding: '1rem 1.6rem', borderBottom: '1px solid var(--color-neutral-4)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.8rem' }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '0.6rem', background: '#E5F4FF',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Cpu size={15} style={{ color: '#3759BF' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span style={{ color: 'var(--color-neutral-10)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, fontSize: 'var(--text-fs-12)' }}>
                        {w.jobTitle}
                      </span>
                      <StatusBadge status={status} />
                    </div>
                    <p style={{ margin: 0, marginTop: 2, color: 'var(--color-neutral-7)', fontSize: 10 }}>
                      {framework} · {w.modelVersion ?? 'unknown'} · supervisor: {w.supervisor ?? '—'}
                    </p>
                    <div style={{ marginTop: '0.6rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={{ color: 'var(--color-neutral-7)', fontSize: 10 }}>Token budget</span>
                        <span style={{ color: 'var(--color-neutral-9)', fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>
                          {(used / 1000).toFixed(0)}k / {(budget / 1000).toFixed(0)}k ({pct}%)
                        </span>
                      </div>
                      <div style={{ height: 4, background: 'var(--color-neutral-4)', borderRadius: 9999, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: fillColor }} />
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ margin: 0, color: 'var(--color-neutral-10)', fontSize: 'var(--text-fs-14)', fontFamily: 'var(--font-jk-bd)', fontWeight: 700 }}>
                      ${cost.toFixed(2)}
                    </p>
                    <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 10 }}>MTD cost</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Root Admin Control Room
// ─────────────────────────────────────────────────────────────────────────────

export function AdminControlRoom() {
  const [tenants,        setTenants]        = useState<TenantRow[]>([]);
  const [loadingT,       setLoadingT]       = useState(true);
  const [addOpen,        setAddOpen]        = useState(false);
  const [managingTenant, setManagingTenant] = useState<string | null>(null);

  const loadTenants = useCallback(() => {
    setLoadingT(true);
    fetch('/api/ws/tenants')
      .then((r) => r.json())
      .then((d) => setTenants(d.data ?? []))
      .catch(() => setTenants([]))
      .finally(() => setLoadingT(false));
  }, []);

  useEffect(() => { loadTenants(); }, [loadTenants]);

  // Platform-level KPIs
  const totalTenants  = tenants.length;
  const activeTenants = tenants.filter((t) => t.isActive).length;
  const pendingSetup  = tenants.filter((t) => !t.setupComplete).length;
  const totalSeats    = tenants.reduce((sum, t) => sum + t.liveHeadcount, 0);

  return (
    <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.6rem', maxWidth: 1440 }}>

      {/* Super Admin Banner */}
      <div
        className="hrms-card"
        style={{
          padding: '1.2rem 1.6rem',
          background: 'linear-gradient(90deg, #F6EDF9 0%, var(--color-neutral-1) 80%)',
          border: '1px solid #DAB1E4',
          display: 'flex', alignItems: 'center', gap: '1rem',
        }}
      >
        <Shield size={18} style={{ color: '#783489', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, color: '#4C2157', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-16)' }}>
            Super Admin Control Room
          </p>
          <p style={{ margin: 0, marginTop: 2, color: '#783489', fontSize: 'var(--text-fs-12)' }}>
            Full platform access · Multi-tenant management · Immutable system audit
          </p>
        </div>
        <Badge variant="purple" dot>Super Admin</Badge>
        <button
          onClick={() => setAddOpen(true)}
          className="hrms-btn-primary"
          style={{ padding: '0.6rem 1.2rem', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Plus size={13} /> New Tenant
        </button>
      </div>

      <AddTenantModal open={addOpen} onClose={() => setAddOpen(false)} onCreated={loadTenants} />

      {/* Platform KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.2rem' }}>
        <StatCard title="Total Tenants"    value={loadingT ? '—' : totalTenants}  icon={Building2}     accent="blue"   />
        <StatCard title="Active Tenants"   value={loadingT ? '—' : activeTenants} icon={Activity}      accent="green"  />
        <StatCard title="Pending Setup"    value={loadingT ? '—' : pendingSetup}  icon={AlertTriangle} accent="purple" />
        <StatCard title="Total Seats Used" value={loadingT ? '—' : totalSeats}    icon={TrendingUp}    accent="cyan"   />
      </div>

      {/* Tenant fleet — full width */}
      <TenantFleetGrid tenants={tenants} loading={loadingT} onRefresh={loadTenants} onManage={setManagingTenant} />

      <TenantDetailDrawer
        tenantId={managingTenant}
        onClose={() => setManagingTenant(null)}
        onSaved={loadTenants}
        onDeleted={() => { setManagingTenant(null); loadTenants(); }}
      />

      {/* Lower row: AI Workers + Audit */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.2rem' }}>
        <DigitalWorkerGrid />
        <AuditLedger />
      </div>
    </div>
  );
}
