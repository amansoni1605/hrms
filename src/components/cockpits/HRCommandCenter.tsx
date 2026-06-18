'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users, DollarSign, AlertTriangle, Globe, BarChart3,
  Download, CheckSquare, XSquare, Play, RefreshCw, Loader2, Search, UserPlus, ChevronRight,
} from 'lucide-react';
import { StatCard }              from '@/components/ui/StatCard';
import { DataGrid, type GridColumn } from '@/components/ui/DataGrid';
import { StatusBadge, Badge }    from '@/components/ui/Badge';
import { RiskBar }               from '@/components/ui/RiskBar';
import { AddEmployeeModal }      from '@/components/widgets/AddEmployeeModal';
import { BulkImportModal }      from '@/components/widgets/BulkImportModal';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, ResponsiveContainer, Legend,
  AreaChart, Area, LabelList, Sector,
} from 'recharts';
import { formatCurrency } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────────────────

interface EmployeeRow {
  _id:              string;
  employeeCode:     string;
  jobTitle:         string;
  departmentName:   string;
  departmentCode:   string;
  countryCode:      string;
  currencyCode:     string;
  employeeStatus:   string;
  employmentType:   string;
  hireDate:         string;
  burnoutRiskScore: number;
  flightRiskScore:  number;
  isActive:         boolean;
}

interface DeptMetric {
  department: string; headcount: number; avgBurnoutRisk: number; avgFlightRisk: number;
}

interface Analytics {
  summary: {
    totalEmployees: number; activeEmployees: number; onLeave: number;
    departments: number; pendingLeaves: number; latestPayrollTotal: number;
  };
  riskDistribution: Array<{ label: string; value: number; color: string }>;
  departmentMetrics: DeptMetric[];
  leaveTrend:        Array<{ month: string; total: number; approved: number; rejected: number }>;
}

// ── Compliance Monitor ──────────────────────────────────────────────────────

function ComplianceMonitor({ metrics }: { metrics: DeptMetric[] }) {
  const highRisk = metrics.filter((d) => d.avgBurnoutRisk >= 0.6);

  return (
    <div className="hrms-card" style={{ padding: '1.6rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h3 className="hrms-section-label">Compliance Alerts</h3>
        {highRisk.length > 0
          ? <Badge variant="danger" dot>{highRisk.length} at risk</Badge>
          : <Badge variant="success">All clear</Badge>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {highRisk.slice(0, 4).map((d, i) => (
          <div
            key={i}
            style={{
              padding: '0.8rem',
              borderRadius: '0.8rem',
              background: 'var(--color-semantics-red-1)',
              border: '1px solid var(--color-semantics-red-2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
              <span style={{ color: 'var(--color-neutral-10)', fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
                {d.department}
              </span>
              <span className="loss_pill">
                {(d.avgBurnoutRisk * 100).toFixed(0)}% burnout
              </span>
            </div>
            <RiskBar score={d.avgBurnoutRisk} size="sm" showValue={false} />
          </div>
        ))}
        {highRisk.length === 0 && (
          <p style={{ textAlign: 'center', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)', padding: '1.2rem 0' }}>
            All departments are within safe burnout thresholds.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Payroll Console ─────────────────────────────────────────────────────────

function PayrollConsole({ total, currency }: { total: number; currency: string }) {
  const [running, setRunning] = useState(false);

  const handleRun = async () => {
    setRunning(true);
    const now = new Date();
    await fetch('/api/payroll', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ month: now.getMonth() + 1, year: now.getFullYear() }),
    });
    setRunning(false);
  };

  return (
    <div className="hrms-card" style={{ padding: '1.6rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h3 className="hrms-section-label">Payroll</h3>
        <StatusBadge status="pending" />
      </div>

      <p
        style={{
          margin: 0, color: 'var(--color-neutral-10)',
          fontFamily: 'var(--font-jk-bd)', fontWeight: 700,
          fontSize: 'var(--text-fs-28)', fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.01em',
        }}
      >
        {formatCurrency(total, currency)}
      </p>
      <p
        style={{
          margin: 0, marginTop: 2, marginBottom: '1.2rem',
          color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)',
        }}
      >
        Latest payroll net total
      </p>

      <button onClick={handleRun} disabled={running} className="hrms-btn-primary" style={{ width: '100%' }}>
        {running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
        {running ? 'Processing…' : 'Run Current Month'}
      </button>
    </div>
  );
}

// ── Bulk Action Bar ─────────────────────────────────────────────────────────

function BulkActionBar({ selectedIds, onClear }: { selectedIds: Set<string>; onClear: () => void }) {
  if (selectedIds.size === 0) return null;

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: '0.8rem',
        padding: '0.6rem 1.2rem', borderRadius: '0.8rem',
        background: 'var(--color-vr-blue-1)',
        border: '1px solid var(--color-vr-blue-2)',
      }}
    >
      <span style={{ color: 'var(--color-vr-blue-7)', fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
        {selectedIds.size} selected
      </span>
      <div style={{ flex: 1 }} />
      <button className="hrms-btn-ghost" style={{ padding: '0.4rem 0.8rem' }}>
        <CheckSquare size={11} style={{ color: 'var(--color-semantics-green-7)' }} />
        Approve Leaves
      </button>
      <button className="hrms-btn-ghost" style={{ padding: '0.4rem 0.8rem' }}>
        <Download size={11} />
        Export
      </button>
      <button onClick={onClear} className="hrms-btn-ghost" style={{ padding: '0.4rem 0.8rem' }}>
        <XSquare size={11} />
        Clear
      </button>
    </div>
  );
}

// ── Main HR Command Center ───────────────────────────────────────────────────

export function HRCommandCenter() {
  const [analytics,    setAnalytics]    = useState<Analytics | null>(null);
  const [employees,    setEmployees]    = useState<EmployeeRow[]>([]);
  const [totalEmp,     setTotalEmp]     = useState(0);
  const [loadingEmp,   setLoadingEmp]   = useState(true);
  const [fetchingMore,  setFetchingMore]  = useState(false);
  const pageRef                            = useRef(1);
  const [search,        setSearch]        = useState('');
  const [statusFilter,  setStatus]        = useState('');
  const [sortCol,       setSortCol]       = useState('employeeCode');
  const [sortDir,       setSortDir]       = useState<'asc' | 'desc'>('asc');
  const [selectedIds,   setSelected]      = useState<Set<string>>(new Set());
  const [showAddModal,  setShowAddModal]  = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/analytics').then((r) => r.json()).then(setAnalytics).catch(() => null);
  }, []);

  const fetchEmployees = useCallback(async (targetPage: number, reset: boolean) => {
    if (reset) setLoadingEmp(true); else setFetchingMore(true);

    const p = new URLSearchParams({
      page:  String(targetPage),
      limit: '50',
      sort:  sortCol,
      dir:   sortDir,
      ...(search       ? { search }              : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
    });

    try {
      const res  = await fetch(`/api/ws/employees?${p}`);
      const json = await res.json();
      const incoming: EmployeeRow[] = json.data ?? [];

      if (reset) setEmployees(incoming);
      else {
        setEmployees((prev) => {
          const seen  = new Set(prev.map((e) => e._id));
          const fresh = incoming.filter((e) => !seen.has(e._id));
          return [...prev, ...fresh];
        });
      }
      setTotalEmp(json.pagination?.total ?? 0);
    } finally {
      setLoadingEmp(false); setFetchingMore(false);
    }
  }, [sortCol, sortDir, search, statusFilter]);

  useEffect(() => {
    pageRef.current = 1;
    fetchEmployees(1, true);
  }, [search, statusFilter, sortCol, sortDir, fetchEmployees]);

  const fetchNextPage = useCallback(() => {
    if (fetchingMore) return;
    const next = pageRef.current + 1;
    pageRef.current = next;
    fetchEmployees(next, false);
  }, [fetchingMore, fetchEmployees]);

  const columns = useMemo((): GridColumn<EmployeeRow>[] => [
    {
      key: 'employeeCode', label: 'ID', width: 110,
      render: (r) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ color: 'var(--color-vr-blue-6)', fontFamily: 'monospace', fontSize: 10 }}>
            {r.employeeCode}
          </span>
          <ChevronRight size={10} style={{ color: 'var(--color-vr-blue-4)', opacity: 0.7 }} />
        </span>
      ),
    },
    {
      key: 'jobTitle', label: 'Role / Name', width: 220,
      render: (r) => (
        <div>
          <p style={{ margin: 0, color: 'var(--color-neutral-10)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, fontSize: 'var(--text-fs-12)' }}>
            {r.jobTitle}
          </p>
        </div>
      ),
    },
    {
      key: 'departmentName', label: 'Department', width: 160,
    },
    {
      key: 'countryCode', label: 'Country', width: 80,
      render: (r) => (
        <span style={{ color: 'var(--color-neutral-7)', fontFamily: 'monospace' }}>
          {r.countryCode}
        </span>
      ),
    },
    {
      key: 'employeeStatus', label: 'Status', width: 120, sortable: false,
      render: (r) => <StatusBadge status={r.employeeStatus} />,
    },
    {
      key: 'burnoutRiskScore', label: 'Burnout', width: 160,
      render: (r) => <RiskBar score={r.burnoutRiskScore} size="sm" />,
    },
    {
      key: 'flightRiskScore', label: 'Flight Risk', width: 160,
      render: (r) => <RiskBar score={r.flightRiskScore} size="sm" />,
    },
  ], []);

  const s = analytics?.summary;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', overflow: 'scroll' }}>
      <div style={{ padding: '2rem 2rem 0 2rem' }}>

        {/* Hero banner */}
        <div className="hrms-hero-card bento-span-4 animate-fade-in-up anim-delay-0" style={{ marginBottom: '1.6rem' }}>
          <div className="hrms-orb hrms-orb--white" />
          <div className="hrms-orb hrms-orb--purple" />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <h1 style={{
              margin: 0,
              color: '#ffffff',
              fontFamily: 'var(--font-jk-bd)',
              fontWeight: 700,
              fontSize: 'var(--text-fs-28)',
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
            }}>
              HR Command Center
            </h1>
            <p style={{
              margin: 0,
              marginTop: '0.4rem',
              color: 'rgba(255,255,255,0.72)',
              fontSize: 'var(--text-fs-14)',
              fontFamily: 'var(--font-in-rg)',
            }}>
              Your workforce at a glance
            </p>
          </div>
        </div>

        {/* KPI strip */}
        <div className="hrms-bento-grid" style={{ marginBottom: '1.6rem' }}>
          <div className="animate-fade-in-up anim-delay-0">
            <StatCard title="Total Employees" value={s?.totalEmployees    ?? '—'} icon={Users}        accent="blue"   />
          </div>
          <div className="animate-fade-in-up anim-delay-75">
            <StatCard title="Active"          value={s?.activeEmployees   ?? '—'} icon={CheckSquare}  accent="green"  />
          </div>
          <div className="animate-fade-in-up anim-delay-150">
            <StatCard title="On Leave"        value={s?.onLeave           ?? '—'} icon={Globe}        accent="amber"  />
          </div>
          <div className="animate-fade-in-up anim-delay-225">
            <StatCard title="Pending Leaves"  value={s?.pendingLeaves     ?? '—'} icon={AlertTriangle} accent="amber" />
          </div>
          <div className="animate-fade-in-up anim-delay-225">
            <StatCard title="Departments"     value={s?.departments       ?? '—'} icon={BarChart3}    accent="purple" />
          </div>
          <div className="animate-fade-in-up anim-delay-225">
            <StatCard title="Latest Payroll"  value={formatCurrency(s?.latestPayrollTotal ?? 0)} icon={DollarSign} accent="cyan" />
          </div>
        </div>

        {/* Charts row */}
        <div className="hrms-bento-grid" style={{ marginBottom: '1.6rem' }}>
          <div className="hrms-card bento-span-2 animate-fade-in-up anim-delay-150" style={{ padding: '1.6rem' }}>
            <h3 className="hrms-section-label" style={{ marginBottom: '1rem' }}>Department Headcount & Burnout</h3>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={analytics?.departmentMetrics ?? []} margin={{ top: 16, right: 4, left: -16, bottom: 0 }} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="2 4" stroke="#E5EAF1" vertical={false} />
                <XAxis dataKey="department" tick={{ fontSize: 10, fill: '#8C8C8C' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="l" tick={{ fontSize: 10, fill: '#8C8C8C' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="r" orientation="right" domain={[0, 1]}
                       tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                       tick={{ fontSize: 10, fill: '#8C8C8C' }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  content={({ active, payload, label }: any) => {
                    if (!active || !payload?.length) return null;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const hc = payload.find((p: any) => p.dataKey === 'headcount')?.value ?? 0;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const br = payload.find((p: any) => p.dataKey === 'avgBurnoutRisk')?.value ?? 0;
                    return (
                      <div className="hrms-card" style={{ padding: '0.8rem 1.2rem', fontSize: 'var(--text-fs-12)', minWidth: 140 }}>
                        <p style={{ margin: '0 0 0.4rem', fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-10)' }}>{label}</p>
                        <p style={{ margin: 0, color: 'var(--color-vr-blue-7)' }}>Headcount: <strong>{hc}</strong></p>
                        <p style={{ margin: 0, color: '#D97706' }}>Burnout risk: <strong>{(Number(br) * 100).toFixed(0)}%</strong></p>
                      </div>
                    );
                  }}
                />
                <Bar yAxisId="l" dataKey="headcount" name="Headcount" fill="#1C509D" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="headcount" position="top" style={{ fontSize: 9, fill: '#8C8C8C' }} />
                </Bar>
                <Bar yAxisId="r" dataKey="avgBurnoutRisk" name="Burnout Risk" fill="#F59E0B" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="hrms-card animate-fade-in-up anim-delay-225" style={{ padding: '1.6rem' }}>
            <h3 className="hrms-section-label" style={{ marginBottom: '1rem' }}>Risk Distribution</h3>
            <div style={{ position: 'relative' }}>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={analytics?.riskDistribution ?? []}
                    cx="50%" cy="45%"
                    innerRadius={42} outerRadius={66}
                    paddingAngle={3}
                    dataKey="value"
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    activeShape={(props: any) => {
                      const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
                      return (
                        <Sector cx={cx} cy={cy} innerRadius={innerRadius - 3} outerRadius={outerRadius + 7}
                          startAngle={startAngle} endAngle={endAngle} fill={fill} />
                      );
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    {(analytics?.riskDistribution ?? []).map((e, i) => (
                      <Cell key={i} fill={e.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    content={({ active, payload }: any) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0];
                      const total = (analytics?.riskDistribution ?? []).reduce((s, r) => s + r.value, 0);
                      const pct = total > 0 ? ((Number(d.value) / total) * 100).toFixed(0) : '0';
                      return (
                        <div className="hrms-card" style={{ padding: '0.8rem 1.2rem', fontSize: 'var(--text-fs-12)' }}>
                          <p style={{ margin: '0 0 0.2rem', fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-10)' }}>{d.name}</p>
                          <p style={{ margin: 0, color: 'var(--color-neutral-7)' }}>{d.value} employee{Number(d.value) !== 1 ? 's' : ''} · {pct}%</p>
                        </div>
                      );
                    }}
                  />
                  <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 10, color: '#595959' }} />
                </PieChart>
              </ResponsiveContainer>
              {/* Center donut label */}
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0,
                height: 150,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                pointerEvents: 'none',
              }}>
                <p style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 20, color: 'var(--color-neutral-10)', lineHeight: 1 }}>
                  {(analytics?.riskDistribution ?? []).reduce((s, r) => s + r.value, 0)}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 9, color: '#8C8C8C', letterSpacing: '0.05em', textTransform: 'uppercase' }}>employees</p>
              </div>
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 auto', maxWidth: 320 }}>
            <Search size={13} style={{
              position: 'absolute', left: 12, top: '50%',
              transform: 'translateY(-50%)', color: 'var(--color-neutral-6)',
            }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employees…"
              className="hrms-input"
              style={{ paddingLeft: '3.2rem' }}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatus(e.target.value)}
            className="hrms-input"
            style={{ width: 160 }}
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="on_leave">On Leave</option>
            <option value="probation">Probation</option>
            <option value="terminated">Terminated</option>
          </select>
          <button
            onClick={() => { pageRef.current = 1; fetchEmployees(1, true); }}
            className="hrms-btn-ghost"
            style={{ padding: '0.8rem' }}
            aria-label="Refresh"
          >
            <RefreshCw size={13} />
          </button>
          <button
            onClick={() => setShowBulkModal(true)}
            className="hrms-btn-ghost"
            style={{ padding: '0.7rem 1.2rem', whiteSpace: 'nowrap' }}
          >
            <Download size={13} /> Bulk Import
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="hrms-btn-primary"
            style={{ padding: '0.7rem 1.2rem', whiteSpace: 'nowrap' }}
          >
            <UserPlus size={13} /> Add Employee
          </button>
          <div style={{ flex: 1 }} />
          <BulkActionBar selectedIds={selectedIds} onClear={() => setSelected(new Set())} />
        </div>
      </div>

      <AddEmployeeModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onCreated={() => { pageRef.current = 1; fetchEmployees(1, true); }}
      />
      <BulkImportModal
        open={showBulkModal}
        onClose={() => setShowBulkModal(false)}
        onCreated={() => { pageRef.current = 1; fetchEmployees(1, true); }}
      />

      {/* Virtualized grid */}
      <div className="animate-fade-in-up anim-delay-400" style={{ flex: 1, minHeight: 400, padding: '0 2rem 1.6rem 2rem' }}>
        <DataGrid
          data={employees}
          columns={columns}
          totalCount={totalEmp}
          isLoading={loadingEmp}
          isFetchingNextPage={fetchingMore}
          sortColumn={sortCol}
          sortDir={sortDir}
          onSortChange={(c, d) => { setSortCol(c); setSortDir(d); }}
          selectedIds={selectedIds}
          onSelectToggle={(id) => setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
          })}
          onSelectAll={() =>
            setSelected(selectedIds.size === employees.length
              ? new Set()
              : new Set(employees.map((e) => e._id)),
            )
          }
          onRowClick={(row) => router.push(`/employees/${row._id}`)}
          fetchNextPage={fetchNextPage}
          emptyMessage="No employees found. POST /api/seed first."
        />
      </div>

      {/* Bottom row */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '1.2rem', padding: '0 2rem 2rem 2rem', flexShrink: 0,
      }}>
        <div className="animate-fade-in-up anim-delay-300">
          <ComplianceMonitor metrics={analytics?.departmentMetrics ?? []} />
        </div>

        {/* Leave Trend chart — 6-month area */}
        <div className="hrms-card animate-fade-in-up anim-delay-350" style={{ padding: '1.6rem' }}>
          <h3 className="hrms-section-label" style={{ marginBottom: '1rem' }}>Leave Trend (6 months)</h3>
          {(() => {
            const trendData = (analytics?.leaveTrend ?? []).map((d) => ({
              ...d,
              label: new Date(d.month + '-02').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
            }));
            if (!trendData.length) return (
              <p style={{ color: 'var(--color-neutral-6)', fontSize: 'var(--text-fs-12)', textAlign: 'center', padding: '2.4rem 0', margin: 0 }}>
                No leave data in the last 6 months.
              </p>
            );
            return (
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={trendData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ltTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1C509D" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#1C509D" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="ltApproved" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="#E5EAF1" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#8C8C8C' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#8C8C8C' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    content={({ active, payload, label }: any) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="hrms-card" style={{ padding: '0.8rem 1.2rem', fontSize: 'var(--text-fs-12)', minWidth: 130 }}>
                          <p style={{ margin: '0 0 0.4rem', fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-10)' }}>{label}</p>
                          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                          {payload.map((p: any) => (
                            <p key={p.dataKey} style={{ margin: 0, color: p.color }}>{p.name}: <strong>{p.value}</strong></p>
                          ))}
                        </div>
                      );
                    }}
                    cursor={{ stroke: '#E5EAF1', strokeWidth: 1 }}
                  />
                  <Area type="monotone" dataKey="total" name="Total" stroke="#1C509D" strokeWidth={2} fill="url(#ltTotal)" dot={false} activeDot={{ r: 4 }} />
                  <Area type="monotone" dataKey="approved" name="Approved" stroke="#22c55e" strokeWidth={2} fill="url(#ltApproved)" dot={false} activeDot={{ r: 4 }} />
                  <Area type="monotone" dataKey="rejected" name="Rejected" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 3" fill="none" dot={false} activeDot={{ r: 3 }} />
                  <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 10, color: '#595959' }} />
                </AreaChart>
              </ResponsiveContainer>
            );
          })()}
        </div>

        <div className="animate-fade-in-up anim-delay-400">
          <PayrollConsole total={s?.latestPayrollTotal ?? 0} currency="USD" />
        </div>
      </div>
    </div>
  );
}
