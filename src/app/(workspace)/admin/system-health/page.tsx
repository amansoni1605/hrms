'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Activity, Database, Cpu, Shield, RefreshCw, Loader2,
  CheckCircle, AlertTriangle, Server, HardDrive,
} from 'lucide-react';
import { StatCard }   from '@/components/ui/StatCard';
import { Badge }      from '@/components/ui/Badge';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface HealthResponse {
  timestamp: string;
  infra: {
    dekCache: { size: number; maxSize: number; ttlMs: number; hits: number; misses: number; provisions: number; hitRate: number };
    plugin:   { registered: boolean; globalCollections: number; tenantScoped: number };
    crypto:   { supportedVersions: number[]; kmsProvider: string };
  };
  process: {
    uptimeSec:   number;
    nodeVersion: string;
    pid:         number;
    memory:      { rssMb: number; heapUsedMb: number; heapTotalMb: number; externalMb: number; arrayBuffersMb: number };
  };
  mongo: {
    readyState: number;
    stateLabel: string;
    dbName:     string | null;
    host:       string | null;
    port:       number | null;
    collectionCount: number;
  };
  host: {
    platform:      string;
    release:       string;
    arch:          string;
    hostname:      string;
    cpuCount:      number;
    loadAverage:   number[];
    freeMemoryMb:  number;
    totalMemoryMb: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function SystemHealthPage() {
  const [data,    setData]    = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch('/api/system/health');
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, [autoRefresh, load]);

  if (loading || !data) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '6rem' }}>
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
      </div>
    );
  }

  const memUtilisation = data.process.memory.heapUsedMb / data.process.memory.heapTotalMb;
  const memPct         = (memUtilisation * 100).toFixed(0);
  const hostMemUsedMb  = data.host.totalMemoryMb - data.host.freeMemoryMb;
  const hostMemPct     = ((hostMemUsedMb / data.host.totalMemoryMb) * 100).toFixed(0);

  const uptimeHrs   = (data.process.uptimeSec / 3600).toFixed(1);
  const hitRatePct  = (data.infra.dekCache.hitRate * 100).toFixed(1);

  return (
    <div style={{ padding: '2rem 2.4rem 6rem 2.4rem', maxWidth: 1400, minHeight: 'calc(100vh - 56px)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.6rem' }}>
        <Server size={20} style={{ color: 'var(--color-vr-blue-6)' }} />
        <div style={{ flex: 1 }}>
          <h2 style={{
            margin: 0, color: 'var(--color-neutral-10)',
            fontFamily: 'var(--font-jk-bd)', fontWeight: 700,
            fontSize: 'var(--text-fs-20)',
          }}>
            System Health Cockpit
          </h2>
          <p style={{ margin: 0, marginTop: 4, color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
            Live infrastructure telemetry · {data.host.hostname} · last refresh {new Date(data.timestamp).toLocaleTimeString()}
          </p>
        </div>
        <button
          onClick={() => setAutoRefresh((v) => !v)}
          className="hrms-btn-ghost"
        >
          {autoRefresh ? <Activity size={13} className="animate-pulse" /> : <Activity size={13} />}
          {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
        </button>
        <button onClick={load} className="hrms-btn-ghost" style={{ padding: '0.8rem' }}>
          <RefreshCw size={13} />
        </button>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.6rem' }}>
        <StatCard title="Uptime"          value={`${uptimeHrs}h`}                      icon={Activity} accent="green" subtitle={data.process.nodeVersion} />
        <StatCard title="MongoDB"          value={data.mongo.stateLabel}                icon={Database}
                  accent={data.mongo.readyState === 1 ? 'green' : 'red'}
                  subtitle={data.mongo.dbName ?? '—'} />
        <StatCard title="DEK Cache Hit Rate" value={`${hitRatePct}%`}                     icon={Shield}   accent="blue"
                  subtitle={`${data.infra.dekCache.size}/${data.infra.dekCache.maxSize} slots`} />
        <StatCard title="Heap Memory"      value={`${data.process.memory.heapUsedMb} MB`} icon={HardDrive}
                  accent={memUtilisation > 0.85 ? 'red' : memUtilisation > 0.65 ? 'amber' : 'green'}
                  subtitle={`${memPct}% of ${data.process.memory.heapTotalMb} MB`} />
        <StatCard title="CPU Load"         value={data.host.loadAverage[0]?.toFixed(2) ?? '—'}
                  icon={Cpu} accent="cyan"
                  subtitle={`${data.host.cpuCount} cores · ${data.host.platform}`} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.4rem' }}>

        {/* DEK Cache Detail */}
        <div className="hrms-card" style={{ padding: '1.6rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.2rem', paddingBottom: '0.8rem', borderBottom: '1px solid var(--color-stroke)' }}>
            <Shield size={14} style={{ color: 'var(--color-semantics-green-7)' }} />
            <h3 style={{ margin: 0, color: 'var(--color-neutral-10)', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-14)' }}>
              DEK Cache (CSFLE)
            </h3>
            <Badge variant="success" dot>Operational</Badge>
          </div>
          <DRow label="Cache size"        value={`${data.infra.dekCache.size} / ${data.infra.dekCache.maxSize}`} />
          <DRow label="TTL"               value={`${data.infra.dekCache.ttlMs / 60_000} minutes`} />
          <DRow label="Cache hits"        value={data.infra.dekCache.hits.toLocaleString()} />
          <DRow label="Cache misses"      value={data.infra.dekCache.misses.toLocaleString()} />
          <DRow label="Provisions (cold)" value={data.infra.dekCache.provisions.toLocaleString()} />
          <DRow label="Hit rate"          value={
            <span style={{ color: data.infra.dekCache.hitRate >= 0.80 ? 'var(--color-semantics-green-7)' : 'var(--color-semantics-orange-7)', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
              {hitRatePct}%
            </span>
          } />
        </div>

        {/* Tenant Isolation Plugin */}
        <div className="hrms-card" style={{ padding: '1.6rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.2rem', paddingBottom: '0.8rem', borderBottom: '1px solid var(--color-stroke)' }}>
            <Shield size={14} style={{ color: 'var(--color-vr-blue-6)' }} />
            <h3 style={{ margin: 0, color: 'var(--color-neutral-10)', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-14)' }}>
              Tenant Isolation Plugin
            </h3>
            {data.infra.plugin.registered
              ? <Badge variant="success" dot>Registered</Badge>
              : <Badge variant="danger" dot>Not registered</Badge>}
          </div>
          <DRow label="Plugin registered" value={
            data.infra.plugin.registered
              ? <CheckCircle size={14} style={{ color: 'var(--color-semantics-green-7)' }} />
              : <AlertTriangle size={14} style={{ color: 'var(--color-semantics-red-6)' }} />
          } />
          <DRow label="Global collections"  value={data.infra.plugin.globalCollections} />
          <DRow label="Tenant-scoped"       value={data.infra.plugin.tenantScoped} />
          <DRow label="KMS provider"         value={data.infra.crypto.kmsProvider} />
          <DRow label="CSFLE versions"      value={data.infra.crypto.supportedVersions.map((v) => `0x${v.toString(16).padStart(2, '0')}`).join(', ')} />
        </div>

        {/* MongoDB connection */}
        <div className="hrms-card" style={{ padding: '1.6rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.2rem', paddingBottom: '0.8rem', borderBottom: '1px solid var(--color-stroke)' }}>
            <Database size={14} style={{ color: 'var(--color-semantics-green-7)' }} />
            <h3 style={{ margin: 0, color: 'var(--color-neutral-10)', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-14)' }}>
              MongoDB
            </h3>
            <Badge variant={data.mongo.readyState === 1 ? 'success' : 'danger'} dot>
              {data.mongo.stateLabel}
            </Badge>
          </div>
          <DRow label="Database"        value={data.mongo.dbName ?? '—'} mono />
          <DRow label="Host"            value={data.mongo.host ?? '—'} mono />
          <DRow label="Port"            value={data.mongo.port ?? '—'} />
          <DRow label="Ready state"     value={data.mongo.readyState} />
          <DRow label="Collections"     value={data.mongo.collectionCount} />
        </div>

        {/* Process Memory */}
        <div className="hrms-card" style={{ padding: '1.6rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.2rem', paddingBottom: '0.8rem', borderBottom: '1px solid var(--color-stroke)' }}>
            <HardDrive size={14} style={{ color: 'var(--color-semantics-orange-7)' }} />
            <h3 style={{ margin: 0, color: 'var(--color-neutral-10)', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-14)' }}>
              Process Memory
            </h3>
          </div>
          <DRow label="RSS"             value={`${data.process.memory.rssMb} MB`} />
          <DRow label="Heap used"       value={`${data.process.memory.heapUsedMb} MB`} />
          <DRow label="Heap total"      value={`${data.process.memory.heapTotalMb} MB`} />
          <DRow label="External"        value={`${data.process.memory.externalMb} MB`} />
          <DRow label="Array buffers"   value={`${data.process.memory.arrayBuffersMb} MB`} />
          <div style={{ marginTop: '0.8rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: 'var(--color-neutral-7)', fontSize: 10 }}>Heap utilisation</span>
              <span style={{ color: 'var(--color-neutral-9)', fontSize: 10, fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>{memPct}%</span>
            </div>
            <div style={{ height: 4, background: 'var(--color-neutral-4)', borderRadius: 9999, overflow: 'hidden' }}>
              <div style={{
                width: `${memPct}%`, height: '100%',
                background: memUtilisation > 0.85 ? 'var(--color-semantics-red-6)' : memUtilisation > 0.65 ? 'var(--color-semantics-orange-6)' : 'var(--color-semantics-green-6)',
              }} />
            </div>
          </div>
        </div>

        {/* Host */}
        <div className="hrms-card" style={{ padding: '1.6rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.2rem', paddingBottom: '0.8rem', borderBottom: '1px solid var(--color-stroke)' }}>
            <Server size={14} style={{ color: 'var(--color-vr-blue-6)' }} />
            <h3 style={{ margin: 0, color: 'var(--color-neutral-10)', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-14)' }}>
              Host
            </h3>
          </div>
          <DRow label="Hostname"   value={data.host.hostname} mono />
          <DRow label="Platform"   value={`${data.host.platform} ${data.host.release}`} />
          <DRow label="Arch"       value={data.host.arch} mono />
          <DRow label="CPU cores"  value={data.host.cpuCount} />
          <DRow label="Load avg (1m)" value={data.host.loadAverage[0]?.toFixed(2) ?? '—'} />
          <DRow label="Memory used"  value={`${hostMemUsedMb.toLocaleString()} / ${data.host.totalMemoryMb.toLocaleString()} MB`} />
          <div style={{ marginTop: '0.8rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: 'var(--color-neutral-7)', fontSize: 10 }}>Host memory</span>
              <span style={{ color: 'var(--color-neutral-9)', fontSize: 10, fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>{hostMemPct}%</span>
            </div>
            <div style={{ height: 4, background: 'var(--color-neutral-4)', borderRadius: 9999, overflow: 'hidden' }}>
              <div style={{ width: `${hostMemPct}%`, height: '100%', background: 'var(--color-vr-blue-6)' }} />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

function DRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--color-neutral-4)' }}>
      <span style={{ color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>{label}</span>
      <span style={{
        color: 'var(--color-neutral-10)',
        fontFamily: mono ? 'monospace' : 'var(--font-in-sb)',
        fontWeight: 600,
        fontSize: 'var(--text-fs-12)',
      }}>
        {value}
      </span>
    </div>
  );
}
