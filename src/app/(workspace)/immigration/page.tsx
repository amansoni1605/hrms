'use client';

import { useEffect, useState, useCallback } from 'react';
import { Globe, RefreshCw, Loader2, Search } from 'lucide-react';
import { ImmigrationNexusTracker, type ImmigrationRecord } from '@/components/widgets/ImmigrationNexusTracker';
import { Avatar }    from '@/components/ui/Avatar';
import { Badge }     from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

// ─────────────────────────────────────────────────────────────────────────────
// HR-facing Immigration page — shows all employees with active immigration
// records, sorted by soonest expiry, with per-employee nexus trackers.
// ─────────────────────────────────────────────────────────────────────────────

interface EmployeeImmigration {
  _id:          string;
  employeeCode: string;
  jobTitle:     string;
  departmentName: string;
  countryCode:  string;
  displayName:  string;
  records:      ImmigrationRecord[];
  soonestExpiry: number;           // epoch ms for sort
}

export default function ImmigrationPage() {
  const [rows,    setRows]    = useState<EmployeeImmigration[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const debounced = useDebouncedValue(search, 200);

  const load = useCallback(async () => {
    setLoading(true);
    // Fetch employees with immigration records
    const res  = await fetch('/api/ws/employees?limit=200&sort=employeeCode&dir=asc');
    const json = await res.json();
    const emps = (json.data ?? []) as Array<{
      _id: string; employeeCode: string; jobTitle: string;
      departmentName: string; countryCode: string;
      immigrationRecords?: ImmigrationRecord[];
    }>;

    const withImmigration: EmployeeImmigration[] = emps
      .filter((e) => (e.immigrationRecords ?? []).some((r) => r.status === 'active'))
      .map((e) => {
        const active = (e.immigrationRecords ?? []).filter((r) => r.status === 'active');
        const soonestExpiry = Math.min(
          ...active.map((r) => new Date(r.expiresAt).getTime()),
        );
        return {
          _id:          e._id,
          employeeCode: e.employeeCode,
          jobTitle:     e.jobTitle,
          departmentName: e.departmentName,
          countryCode:  e.countryCode,
          displayName:  e.employeeCode,       // real name hidden without decryption
          records:      active,
          soonestExpiry,
        };
      })
      .sort((a, b) => a.soonestExpiry - b.soonestExpiry);

    setRows(withImmigration);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter((r) =>
    !debounced ||
    r.employeeCode.toLowerCase().includes(debounced.toLowerCase()) ||
    r.jobTitle.toLowerCase().includes(debounced.toLowerCase()) ||
    r.departmentName.toLowerCase().includes(debounced.toLowerCase()) ||
    r.countryCode.toLowerCase().includes(debounced.toLowerCase()),
  );

  const toggleExpand = (id: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // Counts
  const alertCount   = rows.filter((r) => r.soonestExpiry <= Date.now() + 90 * 86_400_000).length;
  const criticalCount = rows.filter((r) => r.soonestExpiry <= Date.now() + 30 * 86_400_000).length;

  return (
    <div style={{ padding: '2rem', maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.4rem' }}>
        <Globe size={18} style={{ color: 'var(--color-vr-blue-6)' }} />
        <div style={{ flex: 1 }}>
          <h2 style={{
            margin: 0, color: 'var(--color-neutral-10)',
            fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-20)',
          }}>Immigration &amp; Nexus Tracker</h2>
          <p style={{ margin: 0, marginTop: 2, color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
            Active visa/work-permit records · tax-nexus day tallies · expiry countdown.
          </p>
        </div>
        {criticalCount > 0 && (
          <Badge variant="danger" dot>{criticalCount} critical</Badge>
        )}
        {alertCount > criticalCount && (
          <Badge variant="warning">{alertCount - criticalCount} watch</Badge>
        )}
        <button onClick={load} className="hrms-btn-ghost" style={{ padding: '0.8rem' }}>
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', maxWidth: 360, marginBottom: '1.2rem' }}>
        <Search size={13} style={{
          position: 'absolute', left: 12, top: '50%',
          transform: 'translateY(-50%)', color: 'var(--color-neutral-6)',
        }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by employee, dept, country…"
          className="hrms-input"
          style={{ paddingLeft: '3.2rem' }}
        />
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
          <Loader2 size={22} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Globe}
          title="No active immigration records"
          message="Employees with active visas or work permits will appear here."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {filtered.map((row) => {
            const soonestDays = Math.ceil((row.soonestExpiry - Date.now()) / 86_400_000);
            const isExpanded  = expanded.has(row._id);
            const urgency     = soonestDays <= 30 ? 'danger' : soonestDays <= 90 ? 'warning' : 'success';

            return (
              <div key={row._id} className="hrms-card" style={{ padding: 0, overflow: 'hidden' }}>
                {/* Row header */}
                <button
                  onClick={() => toggleExpand(row._id)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '1rem',
                    padding: '1rem 1.4rem',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <Avatar name={row.displayName} size="sm" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      margin: 0, color: 'var(--color-neutral-10)',
                      fontFamily: 'var(--font-in-sb)', fontWeight: 600,
                      fontSize: 'var(--text-fs-12)',
                    }}>
                      {row.employeeCode}
                    </p>
                    <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 10 }}>
                      {row.jobTitle} · {row.departmentName} · {row.countryCode}
                    </p>
                  </div>
                  <Badge variant={urgency}>
                    {soonestDays <= 0  ? 'Expired'
                   : soonestDays <= 30 ? `${soonestDays}d left`
                   : soonestDays <= 90 ? `${soonestDays}d — watch`
                   : `${soonestDays}d`}
                  </Badge>
                  <Badge variant="neutral">{row.records.length} record{row.records.length > 1 ? 's' : ''}</Badge>
                  <span style={{ color: 'var(--color-neutral-6)', fontSize: 12, marginLeft: 4 }}>
                    {isExpanded ? '▲' : '▼'}
                  </span>
                </button>

                {/* Expanded tracker */}
                {isExpanded && (
                  <div style={{ padding: '0.8rem 1.4rem 1.4rem' }}>
                    <ImmigrationNexusTracker records={row.records} compact />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <p style={{ textAlign: 'right', marginTop: '0.8rem', color: 'var(--color-neutral-7)', fontSize: 10 }}>
          {filtered.length} employees with active immigration records
        </p>
      )}
    </div>
  );
}
