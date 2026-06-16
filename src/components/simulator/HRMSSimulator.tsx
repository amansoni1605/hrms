'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  MapPin, ShieldCheck, ShieldX, Coins, TrendingDown,
  Wifi, WifiOff, Battery, BatteryWarning, Signal, Home, Scan,
  Smartphone, Monitor, Zap, Activity, Lock,
  Calculator, Globe, AlertTriangle, CheckCircle2,
  Layers, Crosshair, Radio, Terminal, ChevronRight,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type TaxRegime   = 'new' | 'old';
type NexusStatus = 'safe' | 'watch' | 'at_risk' | 'triggered';
type DeviceTrust = 'trusted' | 'watch' | 'non_compliant' | 'revoked';
type MobileTab   = 'home' | 'clock' | 'tax' | 'nexus' | 'risk';
type ViewMode    = 'desktop' | 'mobile';
type RiskLevel   = 'low' | 'medium' | 'high' | 'critical';

interface SlabRow { label: string; taxable: number; rate: number; tax: number }
interface TaxResult {
  grossIncome: number; stdDed: number; taxableIncome: number;
  taxBeforeRebate: number; rebate87A: number; taxAfterRebate: number;
  cess: number; totalTax: number; netAnnual: number; netMonthly: number;
  effectiveRate: number; slabs: SlabRow[];
}
interface NexusResult {
  daysPresent: number; windowDays: number; ratePerDay: number;
  utilization: number; status: NexusStatus; daysToTrigger: number;
  projectedDate: string | null;
}
interface FlightResult {
  score: number; level: RiskLevel;
  compContrib: number; engageContrib: number; stagnContrib: number;
}
interface GeoResult { distance: number; allowed: boolean; reason: string }
interface Employee {
  id: string; name: string; role: string; department: string;
  color: string; initials: string;
  grossIncome: number; regime: TaxRegime; deviceTrust: DeviceTrust;
  lat: number; lon: number; nexusDays: number; windowDays: number;
  compGap: number; engagementDecay: number; stagnationMonths: number;
  country: string; tagline: string;
}

// ─── Math Engines (unchanged) ─────────────────────────────────────────────────

const NEW_SLABS = [
  { upTo: 400_000,   rate: 0.00 }, { upTo: 800_000,   rate: 0.05 },
  { upTo: 1_200_000, rate: 0.10 }, { upTo: 1_600_000, rate: 0.15 },
  { upTo: 2_000_000, rate: 0.20 }, { upTo: 2_400_000, rate: 0.25 },
  { upTo: Infinity,  rate: 0.30 },
];
const OLD_SLABS = [
  { upTo: 250_000, rate: 0.00 }, { upTo: 500_000,   rate: 0.05 },
  { upTo: 1_000_000, rate: 0.20 }, { upTo: Infinity, rate: 0.30 },
];

function fmtL(n: number): string {
  if (n >= 10_000_000) return `${(n / 10_000_000).toFixed(1)}Cr`;
  if (n >= 100_000)    return `${(n / 100_000).toFixed(1)}L`;
  return n.toLocaleString('en-IN');
}
const rs = (n: number) => `₹${fmtL(n)}`;

function slabTax(taxable: number, slabs: typeof NEW_SLABS): SlabRow[] {
  let rem = taxable; let prev = 0; const rows: SlabRow[] = [];
  for (const s of slabs) {
    if (rem <= 0) break;
    const w = s.upTo === Infinity ? rem : Math.min(s.upTo - prev, rem);
    if (w > 0) rows.push({
      label: s.upTo === Infinity ? `Above ₹${fmtL(prev)}` : `₹${fmtL(prev)}–₹${fmtL(s.upTo)}`,
      taxable: w, rate: s.rate, tax: Math.round(w * s.rate),
    });
    rem -= w; prev = s.upTo;
  }
  return rows;
}

function computeTax(gross: number, regime: TaxRegime, oldDed = 0): TaxResult {
  const stdDed = regime === 'new' ? 75_000 : 50_000;
  const totalDed = stdDed + (regime === 'old' ? oldDed : 0);
  const taxableIncome = Math.max(0, gross - totalDed);
  const slabs = slabTax(taxableIncome, regime === 'new' ? NEW_SLABS : OLD_SLABS);
  const taxBeforeRebate = slabs.reduce((s, r) => s + r.tax, 0);
  let rebate87A = 0;
  if (regime === 'new' && taxableIncome <= 1_200_000) rebate87A = Math.min(taxBeforeRebate, 60_000);
  if (regime === 'old' && taxableIncome <= 500_000)   rebate87A = Math.min(taxBeforeRebate, 12_500);
  const taxAfterRebate = Math.max(0, taxBeforeRebate - rebate87A);
  const cess = Math.round(taxAfterRebate * 0.04);
  const totalTax = taxAfterRebate + cess;
  return {
    grossIncome: gross, stdDed, taxableIncome, taxBeforeRebate, rebate87A, taxAfterRebate,
    cess, totalTax, netAnnual: gross - totalTax,
    netMonthly: Math.round((gross - totalTax) / 12),
    effectiveRate: gross > 0 ? totalTax / gross : 0, slabs,
  };
}

function computeNexus(daysPresent: number, windowDays: number): NexusResult {
  const ratePerDay  = windowDays > 0 ? daysPresent / windowDays : 0;
  const utilization = daysPresent / 183;
  const status: NexusStatus =
    utilization >= 1.0 ? 'triggered' : utilization >= 0.85 ? 'at_risk' :
    utilization >= 0.50 ? 'watch' : 'safe';
  const daysToTrigger = Math.max(0, 183 - daysPresent);
  let projectedDate: string | null = null;
  if (ratePerDay > 0 && status !== 'triggered') {
    const d = new Date();
    d.setDate(d.getDate() + Math.ceil(daysToTrigger / ratePerDay));
    projectedDate = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  return { daysPresent, windowDays, ratePerDay, utilization, status, daysToTrigger, projectedDate };
}

function computeFlightRisk(compGap: number, engagementDecay: number, stagnMonths: number): FlightResult {
  const stagnNorm    = Math.min(100, (stagnMonths / 60) * 100);
  const compContrib  = compGap * 0.45;
  const engageContrib = engagementDecay * 0.35;
  const stagnContrib = stagnNorm * 0.20;
  const score = Math.round(Math.min(100, Math.max(0, compContrib + engageContrib + stagnContrib)));
  const level: RiskLevel = score >= 75 ? 'critical' : score >= 55 ? 'high' : score >= 35 ? 'medium' : 'low';
  return { score, level, compContrib, engageContrib, stagnContrib };
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000, toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(lat2 - lat1), dLon = toR(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function computeGeo(eLat: number, eLon: number, oLat: number, oLon: number, radius: number, trust: DeviceTrust): GeoResult {
  const distance = haversine(eLat, eLon, oLat, oLon);
  const inZone   = distance <= radius;
  const devOk    = trust !== 'non_compliant' && trust !== 'revoked';
  return {
    distance, allowed: inZone && devOk,
    reason: !inZone ? `${distance}m from HQ — outside ${radius}m perimeter`
          : !devOk  ? `Device ${trust.replace(/_/g, ' ')} — gate locked`
                    : 'Location confirmed · Device certified',
  };
}

// ─── Employee Profiles ────────────────────────────────────────────────────────

const OFFICE_LAT = 12.9716, OFFICE_LON = 77.5946, GEOFENCE_R = 150;

const EMPLOYEES: Employee[] = [
  {
    id: 'priya', name: 'Priya Sharma', role: 'Principal Architect', department: 'Engineering',
    color: '#6366f1', initials: 'PS', grossIncome: 3_600_000, regime: 'new', deviceTrust: 'trusted',
    lat: 12.97152, lon: 77.59455, nexusDays: 45, windowDays: 180,
    compGap: 18, engagementDecay: 12, stagnationMonths: 8,
    country: 'India', tagline: 'Local · Low risk · Compliant device',
  },
  {
    id: 'rajiv', name: 'Rajiv Menon', role: 'Regional Director', department: 'Sales',
    color: '#f59e0b', initials: 'RM', grossIncome: 7_200_000, regime: 'old', deviceTrust: 'watch',
    lat: 1.3521, lon: 103.8198, nexusDays: 142, windowDays: 180,
    compGap: 32, engagementDecay: 48, stagnationMonths: 26,
    country: 'Singapore', tagline: 'Cross-border expat · Nexus watch',
  },
  {
    id: 'amit', name: 'Amit Dubey', role: 'Senior Developer', department: 'Product',
    color: '#ef4444', initials: 'AD', grossIncome: 1_800_000, regime: 'new', deviceTrust: 'non_compliant',
    lat: 12.9780, lon: 77.6012, nexusDays: 28, windowDays: 180,
    compGap: 68, engagementDecay: 74, stagnationMonths: 38,
    country: 'India', tagline: 'Non-compliant device · High flight risk',
  },
  {
    id: 'leila', name: 'Leila Nasseri', role: 'Chief Financial Officer', department: 'Finance',
    color: '#10b981', initials: 'LN', grossIncome: 12_000_000, regime: 'new', deviceTrust: 'trusted',
    lat: 12.9716, lon: 77.5946, nexusDays: 88, windowDays: 180,
    compGap: 5, engagementDecay: 7, stagnationMonths: 3,
    country: 'India', tagline: 'C-Suite · Fully compliant · Low risk',
  },
];

// ─── Design Tokens ────────────────────────────────────────────────────────────

const C = {
  canvas:  '#090b0f',
  surface: '#0d1017',
  card:    '#0e1117',
  cardHi:  '#111520',
  border:  'rgba(255,255,255,0.05)',
  borderHi:'rgba(255,255,255,0.09)',
  blue:    '#3b82f6',
  blueGlow:'rgba(59,130,246,0.15)',
  t1: '#f1f5f9', t2: '#94a3b8', t3: '#475569', t4: '#1e293b',
  emerald: '#34d399', emeraldBg: 'rgba(52,211,153,0.08)', emeraldBorder: 'rgba(52,211,153,0.2)',
  amber:   '#fbbf24', amberBg:   'rgba(251,191,36,0.08)',  amberBorder:   'rgba(251,191,36,0.2)',
  rose:    '#fb7185', roseBg:    'rgba(251,113,133,0.08)', roseBorder:    'rgba(251,113,133,0.2)',
  mono: "'JetBrains Mono','Fira Code','SF Mono',monospace",
};

// ─── Semantic colour resolvers ────────────────────────────────────────────────

function riskColor(level: RiskLevel) {
  return level === 'low' ? C.emerald : level === 'medium' ? C.amber :
         level === 'high' ? '#f97316' : C.rose;
}
function riskGlow(level: RiskLevel) {
  return level === 'low' ? C.emeraldBg : level === 'medium' ? C.amberBg :
         level === 'high' ? 'rgba(249,115,22,0.08)' : C.roseBg;
}
function nexusColor(s: NexusStatus) {
  return s === 'safe' ? C.emerald : s === 'watch' ? C.amber : C.rose;
}
function trustColor(t: DeviceTrust) {
  return t === 'trusted' ? C.emerald : t === 'watch' ? C.amber : C.rose;
}

// All sim-* CSS, animations, and slider styles live in globals.css

// ─── Atoms ────────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.t3, marginBottom: 8 }}>
      {children}
    </div>
  );
}

function Mono({ children, size = 12, color = C.t1 }: { children: React.ReactNode; size?: number; color?: string }) {
  return <span style={{ fontFamily: C.mono, fontSize: size, color, letterSpacing: '0.02em' }}>{children}</span>;
}

function PingDot({ color }: { color: string }) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: 7, height: 7, flexShrink: 0 }}>
      <span style={{
        position: 'absolute', inset: 0, borderRadius: '50%', background: color,
        animation: 'pingRing 1.6s ease-out infinite',
      }} />
      <span style={{ position: 'relative', width: 7, height: 7, borderRadius: '50%', background: color }} />
    </span>
  );
}

function Badge({ label, color, bg, border }: { label: string; color: string; bg: string; border: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 8px', borderRadius: 99,
      fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
      color, background: bg, border: `1px solid ${border}`,
    }}>
      <PingDot color={color} />
      {label}
    </span>
  );
}

function TrustBadge({ trust }: { trust: DeviceTrust }) {
  const map: Record<DeviceTrust, [string, string, string, string]> = {
    trusted:       ['TRUSTED',       C.emerald, C.emeraldBg, C.emeraldBorder],
    watch:         ['WATCH',         C.amber,   C.amberBg,   C.amberBorder],
    non_compliant: ['NON-COMPLIANT', C.rose,    C.roseBg,    C.roseBorder],
    revoked:       ['REVOKED',       C.rose,    C.roseBg,    C.roseBorder],
  };
  const [l, c, bg, bdr] = map[trust];
  return <Badge label={l} color={c} bg={bg} border={bdr} />;
}
function NexusBadge({ status }: { status: NexusStatus }) {
  const map: Record<NexusStatus, [string, string, string, string]> = {
    safe:      ['SAFE',      C.emerald, C.emeraldBg, C.emeraldBorder],
    watch:     ['WATCH',     C.amber,   C.amberBg,   C.amberBorder],
    at_risk:   ['AT RISK',   C.rose,    C.roseBg,    C.roseBorder],
    triggered: ['TRIGGERED', C.rose,    C.roseBg,    C.roseBorder],
  };
  const [l, c, bg, bdr] = map[status];
  return <Badge label={l} color={c} bg={bg} border={bdr} />;
}
function RiskBadge({ level }: { level: RiskLevel }) {
  const map: Record<RiskLevel, [string, string, string, string]> = {
    low:      ['LOW RISK',      C.emerald, C.emeraldBg, C.emeraldBorder],
    medium:   ['MEDIUM RISK',   C.amber,   C.amberBg,   C.amberBorder],
    high:     ['HIGH RISK',     '#f97316', 'rgba(249,115,22,0.08)', 'rgba(249,115,22,0.25)'],
    critical: ['CRITICAL',      C.rose,    C.roseBg,    C.roseBorder],
  };
  const [l, c, bg, bdr] = map[level];
  return <Badge label={l} color={c} bg={bg} border={bdr} />;
}

function Avatar({ emp, size = 36 }: { emp: Employee; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `radial-gradient(circle at 35% 35%, ${emp.color}cc, ${emp.color}55)`,
      border: `1.5px solid ${emp.color}44`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.33, fontWeight: 800, color: '#fff',
      boxShadow: `0 0 12px ${emp.color}30`,
    }}>{emp.initials}</div>
  );
}

function GlassCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 16, padding: 20, backdropFilter: 'blur(12px)',
      transition: 'border-color 200ms, box-shadow 200ms',
      ...style,
    }}>
      {children}
    </div>
  );
}

function CardHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
      <div style={{
        width: 30, height: 30, borderRadius: 9, flexShrink: 0,
        background: C.blueGlow, border: `1px solid rgba(59,130,246,0.2)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.blue,
      }}>{icon}</div>
      <span style={{ fontWeight: 700, fontSize: 13, color: C.t1, letterSpacing: '-0.01em' }}>{title}</span>
    </div>
  );
}

// ─── Premium Slider ───────────────────────────────────────────────────────────

function PremiumSlider({
  label, value, min, max, step = 1, onChange, unit = '',
  color = C.blue,
}: {
  label: string; value: number; min: number; max: number;
  step?: number; onChange: (v: number) => void; unit?: string; color?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 10, color: C.t3, fontWeight: 600, letterSpacing: '0.04em' }}>{label}</span>
        <Mono size={11} color={C.t2}>{value.toLocaleString('en-IN')}{unit}</Mono>
      </div>
      <input
        type="range" className="prem-slider"
        min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{
          background: `linear-gradient(to right, ${color} ${pct}%, rgba(255,255,255,0.06) ${pct}%)`,
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
        <Mono size={9} color={C.t3}>{min.toLocaleString('en-IN')}</Mono>
        <Mono size={9} color={C.t3}>{max.toLocaleString('en-IN')}</Mono>
      </div>
    </div>
  );
}

// ─── Tax Bracket Waterfall ────────────────────────────────────────────────────

const SLAB_COLORS = ['#1e3a5f', '#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe'];

function TaxWaterfall({ slabs }: { slabs: SlabRow[] }) {
  const activeTaxSlabs = slabs.filter(s => s.rate > 0 && s.tax > 0);
  const totalTax = activeTaxSlabs.reduce((s, r) => s + r.tax, 0) || 1;
  return (
    <div>
      <SectionLabel>Tax Slab Breakdown</SectionLabel>
      <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 1, marginBottom: 10 }}>
        {activeTaxSlabs.map((s, i) => (
          <div key={i} style={{
            flex: s.tax / totalTax, background: SLAB_COLORS[Math.min(i + 2, SLAB_COLORS.length - 1)],
            transition: 'flex 0.4s ease',
          }} />
        ))}
      </div>
      {slabs.map((s, i) => (
        <div key={i} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '4px 8px', marginBottom: 2, borderRadius: 6,
          background: s.tax > 0 ? 'rgba(59,130,246,0.04)' : 'transparent',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {s.tax > 0 && <div style={{ width: 6, height: 6, borderRadius: 1, background: SLAB_COLORS[Math.min(i + 2, SLAB_COLORS.length - 1)], flexShrink: 0 }} />}
            <Mono size={10} color={C.t3}>{s.label}</Mono>
            <Mono size={9} color={C.t3}>·{(s.rate * 100).toFixed(0)}%</Mono>
          </div>
          <Mono size={10} color={s.tax > 0 ? C.t2 : C.t3}>{rs(s.tax)}</Mono>
        </div>
      ))}
    </div>
  );
}

// ─── Animated Radar ───────────────────────────────────────────────────────────

function PremiumRadar({ distance, radius, allowed }: { distance: number; radius: number; allowed: boolean }) {
  const cx = 110, cy = 110, R = 90;
  const scale    = R / Math.max(radius * 3, distance * 1.5 || 1);
  const empR     = Math.min(Math.round(distance * scale), R - 6);
  const color    = allowed ? C.emerald : C.rose;
  const fenceR   = Math.min(Math.round(radius * scale), R);

  return (
    <svg viewBox="0 0 220 220" style={{ width: '100%', maxWidth: 220 }}>
      <defs>
        <radialGradient id="bgGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(59,130,246,0.04)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <radialGradient id="sweepGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={C.blue} stopOpacity="0.25" />
          <stop offset="100%" stopColor={C.blue} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Background */}
      <circle cx={cx} cy={cy} r={R} fill="url(#bgGrad)" />

      {/* Range rings */}
      {[0.33, 0.66, 1.0].map((f, i) => (
        <circle key={i} cx={cx} cy={cy} r={R * f}
          fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1"
          strokeDasharray={i === 2 ? undefined : '3 5'} />
      ))}
      {/* Cross-hairs */}
      <line x1={cx} y1={cy - R} x2={cx} y2={cy + R} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
      <line x1={cx - R} y1={cy} x2={cx + R} y2={cy} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />

      {/* Spinning sweep arm */}
      <g style={{ animation: 'radarSpin 3s linear infinite', transformOrigin: `${cx}px ${cy}px` }}>
        <path d={`M${cx},${cy} L${cx + R},${cy} A${R},${R} 0 0,1 ${cx + R * Math.cos(1.05)},${cy - R * Math.sin(1.05)} Z`}
          fill="url(#sweepGrad)" />
        <line x1={cx} y1={cy} x2={cx + R} y2={cy} stroke={C.blue} strokeWidth="1.5" opacity="0.6" />
      </g>

      {/* Geofence boundary */}
      <circle cx={cx} cy={cy} r={fenceR}
        fill={allowed ? 'rgba(52,211,153,0.05)' : 'rgba(251,113,133,0.05)'}
        stroke={color} strokeWidth="1.5" strokeDasharray="5 4" />

      {/* Office pin */}
      <circle cx={cx} cy={cy} r={6} fill={C.blue} />
      <circle cx={cx} cy={cy} r={10} fill="none" stroke={C.blue} strokeWidth="1" opacity="0.4" />
      <circle cx={cx} cy={cy} r={14} fill="none" stroke={C.blue} strokeWidth="0.5" opacity="0.2" />

      {/* Employee position */}
      <circle cx={cx + empR} cy={cy} r={7} fill={color} style={{ animation: 'simGlow 2s ease-in-out infinite' }} />
      <circle cx={cx + empR} cy={cy} r={12} fill="none" stroke={color} strokeWidth="1" opacity="0.4"
        style={{ animation: 'pingRing 2s ease-out infinite' }} />

      {/* Labels */}
      <text x={cx} y={cy + 18} textAnchor="middle" fill={C.blue} fontSize="8" fontWeight="800" fontFamily={C.mono}>HQ</text>
      <text x={cx + empR} y={cy + 21} textAnchor="middle" fill={color} fontSize="8" fontWeight="800" fontFamily={C.mono}>YOU</text>
      <text x={cx} y={cy + R + 14} textAnchor="middle" fill={C.t3} fontSize="9" fontFamily={C.mono}>{distance}m · fence {radius}m</text>
    </svg>
  );
}

// ─── Telemetry Terminal ───────────────────────────────────────────────────────

function TelemetryLog({ geo, trust }: { geo: GeoResult; trust: DeviceTrust }) {
  const now = new Date().toISOString().slice(11, 19);
  const lines = [
    { t: now, msg: 'GPS LOCK ACQUIRED', ok: true },
    { t: now, msg: `HAVERSINE COMPUTE → ${geo.distance}m`, ok: true },
    { t: now, msg: `FENCE RADIUS: ${GEOFENCE_R}m`, ok: geo.allowed },
    { t: now, msg: `DEVICE CERT: ${trust.toUpperCase()}`, ok: trust === 'trusted' || trust === 'watch' },
    { t: now, msg: geo.allowed ? 'GATE: OPEN — CLOCK-IN READY' : 'GATE: LOCKED — ACCESS DENIED', ok: geo.allowed },
  ];
  return (
    <div style={{
      background: '#040609', border: `1px solid rgba(59,130,246,0.12)`,
      borderRadius: 10, padding: '10px 12px', fontFamily: C.mono, fontSize: 10,
      color: C.t3, lineHeight: 2, maxHeight: 130, overflowY: 'auto',
    }}>
      {lines.map((l, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, animation: `slideUp 0.3s ease ${i * 0.08}s both` }}>
          <span style={{ color: '#2d4a6e', flexShrink: 0 }}>{l.t}</span>
          <span style={{ color: l.ok ? '#22d3ee' : C.rose }}>{'>'}</span>
          <span style={{ color: l.ok ? C.t2 : C.rose }}>{l.msg}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Risk Arc Gauge ───────────────────────────────────────────────────────────

function RiskArc({ score, level }: { score: number; level: RiskLevel }) {
  const color = riskColor(level);
  const r = 44, cx = 60, cy = 60;
  const circumference = Math.PI * r; // half circle
  const dashOffset    = circumference * (1 - score / 100);
  return (
    <svg viewBox="0 0 120 70" style={{ width: 120, height: 70 }}>
      {/* Track */}
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" strokeLinecap="round" />
      {/* Fill */}
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        style={{ transition: 'stroke-dashoffset 0.5s ease, stroke 0.4s ease' }} />
      {/* Score */}
      <text x={cx} y={cy - 2} textAnchor="middle" fill={color}
        fontSize="22" fontWeight="900" fontFamily={C.mono}>{score}</text>
      <text x={cx} y={cy + 12} textAnchor="middle" fill={C.t3} fontSize="8" fontFamily={C.mono}>/ 100</text>
    </svg>
  );
}

// ─── Device Trust Selector ────────────────────────────────────────────────────

function DeviceSelector({ value, onChange }: { value: DeviceTrust; onChange: (t: DeviceTrust) => void }) {
  const opts: DeviceTrust[] = ['trusted', 'watch', 'non_compliant', 'revoked'];
  return (
    <div>
      <SectionLabel>Device Trust State</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {opts.map(t => {
          const active = value === t;
          const color  = trustColor(t);
          return (
            <button key={t} onClick={() => onChange(t)} style={{
              padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
              border: `1.5px solid ${active ? color + '50' : C.border}`,
              background: active ? `${color}10` : 'transparent',
              color: active ? color : C.t3,
              fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
              transition: 'all 150ms',
            }}>{t.replace(/_/g, ' ').toUpperCase()}</button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Desktop Cards ────────────────────────────────────────────────────────────

function TaxCard({
  grossIncome, regime, oldDed, setGrossIncome, setRegime, setOldDed,
}: {
  grossIncome: number; regime: TaxRegime; oldDed: number;
  setGrossIncome: (v: number) => void; setRegime: (r: TaxRegime) => void; setOldDed: (v: number) => void;
}) {
  const t = useMemo(() => computeTax(grossIncome, regime, oldDed), [grossIncome, regime, oldDed]);
  return (
    <GlassCard>
      <CardHeader icon={<Calculator size={14} />} title="India Tax Engine — AY 2026-27" />

      {/* Regime toggle */}
      <div style={{ display: 'flex', background: '#060810', borderRadius: 10, padding: 3, marginBottom: 18, border: `1px solid ${C.border}` }}>
        {(['new', 'old'] as TaxRegime[]).map(r => (
          <button key={r} onClick={() => setRegime(r)} style={{
            flex: 1, padding: '6px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: regime === r ? C.blue : 'transparent',
            color: regime === r ? '#fff' : C.t3, fontWeight: 700, fontSize: 11,
            transition: 'all 180ms', boxShadow: regime === r ? `0 0 14px rgba(59,130,246,0.3)` : 'none',
          }}>{r === 'new' ? 'New Regime' : 'Old Regime'}</button>
        ))}
      </div>

      <PremiumSlider label="Annual Gross Income" value={grossIncome} min={300_000} max={20_000_000} step={50_000} onChange={setGrossIncome} />
      {regime === 'old' && <PremiumSlider label="80C/D Deductions" value={oldDed} min={0} max={500_000} step={10_000} onChange={setOldDed} />}

      {/* Hero metric */}
      <div style={{
        borderRadius: 12, padding: '14px 16px', marginBottom: 14,
        background: 'linear-gradient(135deg, rgba(52,211,153,0.07) 0%, rgba(16,185,129,0.03) 100%)',
        border: `1px solid ${C.emeraldBorder}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: 9, color: C.emerald, fontWeight: 700, letterSpacing: '0.1em', marginBottom: 3 }}>MONTHLY TAKE-HOME</div>
          <Mono size={22} color={C.emerald}>{rs(t.netMonthly)}</Mono>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 9, color: C.t3, marginBottom: 3 }}>Effective Rate</div>
          <Mono size={16} color={C.t2}>{(t.effectiveRate * 100).toFixed(2)}%</Mono>
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
        {[
          { l: 'Gross', v: rs(t.grossIncome) },
          { l: 'Taxable', v: rs(t.taxableIncome) },
          { l: 'Total Tax', v: rs(t.totalTax) },
        ].map(({ l, v }) => (
          <div key={l} style={{ background: C.surface, borderRadius: 8, padding: '8px 10px', border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 9, color: C.t3, marginBottom: 3 }}>{l}</div>
            <Mono size={11} color={C.t2}>{v}</Mono>
          </div>
        ))}
      </div>

      {t.rebate87A > 0 && (
        <div style={{ padding: '6px 10px', borderRadius: 8, background: C.amberBg, border: `1px solid ${C.amberBorder}`, marginBottom: 14 }}>
          <Mono size={10} color={C.amber}>⚡ Sec 87A rebate {rs(t.rebate87A)} applied — net income tax ₹0</Mono>
        </div>
      )}

      <TaxWaterfall slabs={t.slabs} />
    </GlassCard>
  );
}

function NexusCard({
  nexusDays, windowDays, setNexusDays, setWindowDays,
}: {
  nexusDays: number; windowDays: number;
  setNexusDays: (v: number) => void; setWindowDays: (v: number) => void;
}) {
  const n = useMemo(() => computeNexus(nexusDays, windowDays), [nexusDays, windowDays]);
  const pct = Math.min(100, n.utilization * 100);
  const color = nexusColor(n.status);
  return (
    <GlassCard>
      <CardHeader icon={<Globe size={14} />} title="Cross-Border Tax Nexus Tracker" />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <NexusBadge status={n.status} />
        <Mono size={12} color={C.t2}>{nexusDays} / 183 days</Mono>
      </div>

      {/* Utilization bar */}
      <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, marginBottom: 6, overflow: 'hidden', position: 'relative' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct}%`,
          background: `linear-gradient(90deg, ${color}88, ${color})`, borderRadius: 4, transition: 'width 0.4s ease' }} />
        {/* 183-day threshold markers */}
        {[0.5, 0.85].map((f, i) => (
          <div key={i} style={{ position: 'absolute', left: `${f * 100}%`, top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.2)' }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18 }}>
        <Mono size={9} color={C.t3}>0</Mono>
        <Mono size={9} color={C.amber}>50%</Mono>
        <Mono size={9} color={C.rose}>85%</Mono>
        <Mono size={9} color={C.t3}>183d</Mono>
      </div>

      <PremiumSlider label="Physical Presence Days (YTD)" value={nexusDays} min={0} max={200} onChange={setNexusDays} color={color} />
      <PremiumSlider label="Observation Window (days)" value={windowDays} min={90} max={365} onChange={setWindowDays} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[
          { l: 'Velocity (days/day)', v: n.ratePerDay.toFixed(3) },
          { l: 'Days to Trigger',     v: n.daysToTrigger.toString() },
          { l: 'Utilization',         v: `${(n.utilization * 100).toFixed(1)}%` },
          { l: 'Projected Trigger',   v: n.projectedDate ?? (n.status === 'triggered' ? '— TRIGGERED —' : 'N/A') },
        ].map(({ l, v }) => (
          <div key={l} style={{ background: C.surface, borderRadius: 8, padding: '9px 10px', border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 9, color: C.t3, marginBottom: 3 }}>{l}</div>
            <Mono size={11} color={n.status === 'triggered' ? C.rose : C.t2}>{v}</Mono>
          </div>
        ))}
      </div>

      {n.status === 'triggered' && (
        <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 10, background: C.roseBg, border: `1px solid ${C.roseBorder}` }}>
          <Mono size={10} color={C.rose}>⚠ 183-day threshold breached. Permanent establishment risk active. Escalate to tax counsel immediately.</Mono>
        </div>
      )}
    </GlassCard>
  );
}

function GeoCard({
  emp, geo, empLat, empLon, deviceTrust,
  setEmpLat, setEmpLon, setDeviceTrust,
}: {
  emp: Employee; geo: GeoResult; empLat: number; empLon: number; deviceTrust: DeviceTrust;
  setEmpLat: (v: number) => void; setEmpLon: (v: number) => void;
  setDeviceTrust: (t: DeviceTrust) => void;
}) {
  const LOCS = [
    { label: 'Inside HQ',  lat: 12.97152, lon: 77.59455 },
    { label: 'Near HQ',    lat: 12.97200, lon: 77.59500 },
    { label: 'Outside',    lat: 12.9780,  lon: 77.6012  },
    { label: emp.country !== 'India' ? emp.country : 'Remote', lat: emp.lat, lon: emp.lon },
  ];
  return (
    <GlassCard>
      <CardHeader icon={<Crosshair size={14} />} title="Geofenced Clock-In Verification" />
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <PremiumRadar distance={geo.distance} radius={GEOFENCE_R} allowed={geo.allowed} />
        <div style={{ flex: 1 }}>
          <SectionLabel>Simulate Location</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 14 }}>
            {LOCS.map(l => {
              const active = empLat === l.lat && empLon === l.lon;
              return (
                <button key={l.label} onClick={() => { setEmpLat(l.lat); setEmpLon(l.lon); }} style={{
                  padding: '6px 10px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                  border: `1px solid ${active ? C.blue + '60' : C.border}`,
                  background: active ? C.blueGlow : 'transparent',
                  color: active ? C.blue : C.t3, fontSize: 10, fontWeight: 600,
                  transition: 'all 150ms',
                }}>{l.label}</button>
              );
            })}
          </div>
          {/* Coord readout */}
          <div style={{ background: '#040609', borderRadius: 8, padding: '8px 10px', marginBottom: 14, border: `1px solid ${C.border}` }}>
            <Mono size={9} color={C.t3}>LAT  </Mono><Mono size={9} color="#22d3ee">{empLat.toFixed(4)}</Mono>
            <br />
            <Mono size={9} color={C.t3}>LON  </Mono><Mono size={9} color="#22d3ee">{empLon.toFixed(4)}</Mono>
            <br />
            <Mono size={9} color={C.t3}>DIST </Mono><Mono size={9} color={geo.allowed ? C.emerald : C.rose}>{geo.distance}m</Mono>
          </div>
          <DeviceSelector value={deviceTrust} onChange={setDeviceTrust} />
        </div>
      </div>

      {/* Gate status */}
      <div style={{
        marginTop: 14, borderRadius: 12, padding: '12px 16px',
        background: geo.allowed ? C.emeraldBg : C.roseBg,
        border: `1.5px solid ${geo.allowed ? C.emeraldBorder : C.roseBorder}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 13, color: geo.allowed ? C.emerald : C.rose, marginBottom: 2 }}>
            {geo.allowed ? '✓ CLOCK-IN GATE OPEN' : '✗ CLOCK-IN GATE LOCKED'}
          </div>
          <Mono size={10} color={C.t3}>{geo.reason}</Mono>
        </div>
        {geo.allowed ? <CheckCircle2 size={22} color={C.emerald} /> : <Lock size={22} color={C.rose} />}
      </div>
    </GlassCard>
  );
}

function RiskCard({
  compGap, engagementDecay, stagnMonths,
  setCompGap, setEngagementDecay, setStagnMonths,
}: {
  compGap: number; engagementDecay: number; stagnMonths: number;
  setCompGap: (v: number) => void; setEngagementDecay: (v: number) => void;
  setStagnMonths: (v: number) => void;
}) {
  const r = useMemo(() => computeFlightRisk(compGap, engagementDecay, stagnMonths), [compGap, engagementDecay, stagnMonths]);
  const color = riskColor(r.level);
  return (
    <GlassCard>
      <CardHeader icon={<TrendingDown size={14} />} title="Predictive Flight Risk Model" />

      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 18 }}>
        <RiskArc score={r.score} level={r.level} />
        <div style={{ flex: 1 }}>
          <RiskBadge level={r.level} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 12 }}>
            {[
              { l: 'Comp ×0.45',    v: r.compContrib.toFixed(1) },
              { l: 'Engage ×0.35',  v: r.engageContrib.toFixed(1) },
              { l: 'Stagn ×0.20',   v: r.stagnContrib.toFixed(1) },
            ].map(({ l, v }) => (
              <div key={l} style={{ background: C.surface, borderRadius: 6, padding: '6px 8px', textAlign: 'center', border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 8, color: C.t3, marginBottom: 2 }}>{l}</div>
                <Mono size={12} color={color}>{v}</Mono>
              </div>
            ))}
          </div>
        </div>
      </div>

      <PremiumSlider label="Compensation Gap vs Peers" value={compGap} min={0} max={100} onChange={setCompGap} unit="%" color={color} />
      <PremiumSlider label="Engagement Decay (neg. trend)" value={engagementDecay} min={0} max={100} onChange={setEngagementDecay} unit="%" color={color} />
      <PremiumSlider label="Months Since Last Promotion" value={stagnMonths} min={0} max={60} onChange={setStagnMonths} unit="mo" color={color} />

      {/* Contribution breakdown */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
        {[
          { l: 'Compensation Gap', v: r.compContrib, pct: r.compContrib },
          { l: 'Engagement Decay', v: r.engageContrib, pct: r.engageContrib },
          { l: 'Tenure Stagnation', v: r.stagnContrib, pct: r.stagnContrib },
        ].map(({ l, v, pct }) => (
          <div key={l}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <Mono size={9} color={C.t3}>{l}</Mono>
              <Mono size={9} color={C.t2}>{v.toFixed(1)}</Mono>
            </div>
            <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2 }}>
              <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 2, transition: 'width 0.4s, background 0.4s' }} />
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

// ─── Mobile Screens ───────────────────────────────────────────────────────────

function MobileHome({
  emp, taxResult, geo, nexus, risk, deviceTrust, setDeviceTrust, setTab,
}: {
  emp: Employee; taxResult: TaxResult; geo: GeoResult; nexus: NexusResult;
  risk: FlightResult; deviceTrust: DeviceTrust;
  setDeviceTrust: (t: DeviceTrust) => void; setTab: (t: MobileTab) => void;
}) {
  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Profile */}
      <div style={{
        background: C.cardHi, borderRadius: 16, padding: 14,
        border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <Avatar emp={emp} size={44} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: C.t1, marginBottom: 2 }}>{emp.name}</div>
          <div style={{ fontSize: 10, color: C.t3 }}>{emp.role}</div>
          <div style={{ marginTop: 5 }}><TrustBadge trust={deviceTrust} /></div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 9, color: C.t3, marginBottom: 3 }}>Net / mo</div>
          <Mono size={15} color={C.emerald}>{rs(taxResult.netMonthly)}</Mono>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[
          { label: 'Clock-In', value: geo.allowed ? 'Open' : 'Locked', color: geo.allowed ? C.emerald : C.rose, icon: <MapPin size={11} />, tab: 'clock' as MobileTab },
          { label: 'Nexus',    value: nexus.status.replace('_', ' ').toUpperCase(), color: nexusColor(nexus.status), icon: <Globe size={11} />, tab: 'nexus' as MobileTab },
          { label: 'Flight Risk', value: `${risk.score}/100`, color: riskColor(risk.level), icon: <Activity size={11} />, tab: 'risk' as MobileTab },
          { label: 'Eff. Tax', value: `${(taxResult.effectiveRate * 100).toFixed(1)}%`, color: C.blue, icon: <Coins size={11} />, tab: 'tax' as MobileTab },
        ].map(({ label, value, color, icon, tab }) => (
          <button key={label} onClick={() => setTab(tab)} style={{
            background: C.cardHi, borderRadius: 12, padding: '10px 12px',
            border: `1px solid ${C.border}`, cursor: 'pointer', textAlign: 'left',
            transition: 'border-color 150ms',
          }}>
            <div style={{ display: 'flex', gap: 4, color: C.t3, marginBottom: 5, alignItems: 'center' }}>
              {icon}<span style={{ fontSize: 9 }}>{label}</span>
            </div>
            <Mono size={13} color={color}>{value}</Mono>
          </button>
        ))}
      </div>

      {/* Device trust */}
      <div style={{ background: C.cardHi, borderRadius: 14, padding: 12, border: `1px solid ${C.border}` }}>
        <DeviceSelector value={deviceTrust} onChange={setDeviceTrust} />
      </div>
    </div>
  );
}

function MobileClock({
  geo, empLat, empLon, emp, deviceTrust, setEmpLat, setEmpLon,
}: {
  geo: GeoResult; empLat: number; empLon: number; emp: Employee;
  deviceTrust: DeviceTrust; setEmpLat: (v: number) => void; setEmpLon: (v: number) => void;
}) {
  const LOCS = [
    { label: 'Inside HQ', lat: 12.97152, lon: 77.59455 },
    { label: 'Near HQ',   lat: 12.97200, lon: 77.59500 },
    { label: 'Far',       lat: 12.9780,  lon: 77.6012  },
    { label: emp.country !== 'India' ? emp.country : 'Remote', lat: emp.lat, lon: emp.lon },
  ];
  return (
    <div style={{ padding: 14 }}>
      <SectionLabel>Geofence Terminal</SectionLabel>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
        <PremiumRadar distance={geo.distance} radius={GEOFENCE_R} allowed={geo.allowed} />
      </div>
      <TelemetryLog geo={geo} trust={deviceTrust} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 10, marginBottom: 10 }}>
        {LOCS.map(l => {
          const active = empLat === l.lat && empLon === l.lon;
          return (
            <button key={l.label} onClick={() => { setEmpLat(l.lat); setEmpLon(l.lon); }} style={{
              padding: '6px 8px', borderRadius: 8, cursor: 'pointer',
              border: `1px solid ${active ? C.blue + '60' : C.border}`,
              background: active ? C.blueGlow : 'transparent',
              color: active ? C.blue : C.t3, fontSize: 10, fontWeight: 600,
              transition: 'all 150ms',
            }}>{l.label}</button>
          );
        })}
      </div>
      <div style={{
        borderRadius: 12, padding: 12, textAlign: 'center',
        background: geo.allowed ? C.emeraldBg : C.roseBg,
        border: `1.5px solid ${geo.allowed ? C.emeraldBorder : C.roseBorder}`,
      }}>
        <div style={{ fontWeight: 800, fontSize: 13, color: geo.allowed ? C.emerald : C.rose }}>
          {geo.allowed ? '✓ CLOCK-IN OPEN' : '✗ CLOCK-IN LOCKED'}
        </div>
        <Mono size={9} color={C.t3}>{geo.reason}</Mono>
      </div>
    </div>
  );
}

function MobileTax({
  grossIncome, regime, oldDed, setGrossIncome, setRegime, setOldDed,
}: {
  grossIncome: number; regime: TaxRegime; oldDed: number;
  setGrossIncome: (v: number) => void; setRegime: (r: TaxRegime) => void; setOldDed: (v: number) => void;
}) {
  const t = useMemo(() => computeTax(grossIncome, regime, oldDed), [grossIncome, regime, oldDed]);
  return (
    <div style={{ padding: 14 }}>
      <SectionLabel>India Tax Engine — AY 2026-27</SectionLabel>
      <div style={{ display: 'flex', background: '#060810', borderRadius: 10, padding: 3, marginBottom: 14, border: `1px solid ${C.border}` }}>
        {(['new', 'old'] as TaxRegime[]).map(r => (
          <button key={r} onClick={() => setRegime(r)} style={{
            flex: 1, padding: '6px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: regime === r ? C.blue : 'transparent',
            color: regime === r ? '#fff' : C.t3, fontWeight: 700, fontSize: 11,
            transition: 'all 180ms',
          }}>{r === 'new' ? 'New Regime' : 'Old Regime'}</button>
        ))}
      </div>
      <PremiumSlider label="Annual Gross Income" value={grossIncome} min={300_000} max={20_000_000} step={50_000} onChange={setGrossIncome} />
      {regime === 'old' && <PremiumSlider label="80C/D Deductions" value={oldDed} min={0} max={500_000} step={10_000} onChange={setOldDed} />}
      <div style={{ background: C.cardHi, borderRadius: 12, padding: 12, border: `1px solid ${C.border}` }}>
        {[
          { l: 'Gross',         v: rs(t.grossIncome) },
          { l: 'Std Deduction', v: `−${rs(t.stdDed)}` },
          { l: 'Taxable',       v: rs(t.taxableIncome) },
          { l: 'Tax (pre-87A)', v: rs(t.taxBeforeRebate) },
          ...(t.rebate87A > 0 ? [{ l: '87A Rebate', v: `−${rs(t.rebate87A)}` }] : []),
          { l: 'Cess 4%',       v: rs(t.cess) },
          { l: 'Total Tax',     v: rs(t.totalTax) },
        ].map(({ l, v }) => (
          <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: `1px solid rgba(255,255,255,0.03)` }}>
            <Mono size={10} color={C.t3}>{l}</Mono>
            <Mono size={10} color={C.t2}>{v}</Mono>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
          <Mono size={11} color={C.t2}>Monthly Take-Home</Mono>
          <Mono size={15} color={C.emerald}>{rs(t.netMonthly)}</Mono>
        </div>
      </div>
    </div>
  );
}

function MobileNexus({
  nexusDays, windowDays, setNexusDays, setWindowDays,
}: {
  nexusDays: number; windowDays: number;
  setNexusDays: (v: number) => void; setWindowDays: (v: number) => void;
}) {
  const n = useMemo(() => computeNexus(nexusDays, windowDays), [nexusDays, windowDays]);
  const pct = Math.min(100, n.utilization * 100);
  const color = nexusColor(n.status);
  return (
    <div style={{ padding: 14 }}>
      <SectionLabel>Cross-Border Tax Nexus</SectionLabel>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <NexusBadge status={n.status} />
        <Mono size={11} color={C.t2}>{nexusDays} / 183 d</Mono>
      </div>
      <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden', marginBottom: 12 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width 0.4s, background 0.4s' }} />
      </div>
      <PremiumSlider label="Physical Presence Days" value={nexusDays} min={0} max={200} onChange={setNexusDays} color={color} />
      <PremiumSlider label="Observation Window (days)" value={windowDays} min={90} max={365} onChange={setWindowDays} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[
          { l: 'Rate / day',    v: n.ratePerDay.toFixed(3) },
          { l: 'Days left',     v: n.daysToTrigger.toString() },
          { l: 'Utilization',   v: `${(n.utilization * 100).toFixed(1)}%` },
          { l: 'Trigger date',  v: n.projectedDate ?? (n.status === 'triggered' ? 'TRIGGERED' : 'N/A') },
        ].map(({ l, v }) => (
          <div key={l} style={{ background: C.cardHi, borderRadius: 8, padding: '8px 10px', border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 9, color: C.t3, marginBottom: 2 }}>{l}</div>
            <Mono size={11} color={n.status === 'triggered' ? C.rose : C.t2}>{v}</Mono>
          </div>
        ))}
      </div>
    </div>
  );
}

function MobileRisk({
  compGap, engagementDecay, stagnMonths,
  setCompGap, setEngagementDecay, setStagnMonths,
}: {
  compGap: number; engagementDecay: number; stagnMonths: number;
  setCompGap: (v: number) => void; setEngagementDecay: (v: number) => void;
  setStagnMonths: (v: number) => void;
}) {
  const r = useMemo(() => computeFlightRisk(compGap, engagementDecay, stagnMonths), [compGap, engagementDecay, stagnMonths]);
  const color = riskColor(r.level);
  return (
    <div style={{ padding: 14 }}>
      <SectionLabel>Flight Risk Model</SectionLabel>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
        <RiskArc score={r.score} level={r.level} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
        <RiskBadge level={r.level} />
      </div>
      <PremiumSlider label="Compensation Gap ×0.45" value={compGap} min={0} max={100} onChange={setCompGap} unit="%" color={color} />
      <PremiumSlider label="Engagement Decay ×0.35" value={engagementDecay} min={0} max={100} onChange={setEngagementDecay} unit="%" color={color} />
      <PremiumSlider label="Stagnation Months ×0.20" value={stagnMonths} min={0} max={60} onChange={setStagnMonths} unit="mo" color={color} />
      {[
        { l: 'Comp contribution', v: r.compContrib.toFixed(1), pct: r.compContrib },
        { l: 'Engage contribution', v: r.engageContrib.toFixed(1), pct: r.engageContrib },
        { l: 'Stagn contribution', v: r.stagnContrib.toFixed(1), pct: r.stagnContrib },
      ].map(({ l, v, pct }) => (
        <div key={l} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <Mono size={9} color={C.t3}>{l}</Mono>
            <Mono size={9} color={C.t2}>{v}</Mono>
          </div>
          <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2 }}>
            <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 0.4s, background 0.4s' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Premium Mobile Bezel ─────────────────────────────────────────────────────

const MOBILE_TABS: { id: MobileTab; icon: React.ReactNode; label: string }[] = [
  { id: 'home',  icon: <Home size={15} />,       label: 'Main'  },
  { id: 'clock', icon: <Scan size={15} />,        label: 'Clock' },
  { id: 'tax',   icon: <Calculator size={15} />,  label: 'Tax'   },
  { id: 'nexus', icon: <Globe size={15} />,       label: 'Nexus' },
  { id: 'risk',  icon: <Activity size={15} />,    label: 'Risk'  },
];

function PremiumBezel({ children, tab, setTab, deviceTrust }: {
  children: React.ReactNode; tab: MobileTab; setTab: (t: MobileTab) => void;
  deviceTrust: DeviceTrust;
}) {
  const [tick, setTick] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setTick(new Date()), 1000); return () => clearInterval(id); }, []);
  const timeStr = tick.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const compromised = deviceTrust === 'non_compliant' || deviceTrust === 'revoked';

  return (
    <div className="sim-bezel" style={{
      background: 'linear-gradient(180deg, #1a1c1f 0%, #0f1012 100%)',
      borderRadius: 50, padding: 10,
      boxShadow: '0 0 0 1.5px rgba(255,255,255,0.07), 0 40px 100px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.06)',
      border: '1px solid #2a2d32',
    }}>
      {/* Device body */}
      <div className="sim-bezel-inner" style={{
        background: compromised ? 'linear-gradient(180deg, #120a0a 0%, #0c0608 100%)' : C.canvas,
        borderRadius: 42, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        border: `1px solid ${compromised ? 'rgba(251,113,133,0.12)' : 'rgba(255,255,255,0.04)'}`,
      }}>

        {/* Status bar */}
        <div style={{
          padding: '14px 20px 8px', flexShrink: 0,
          background: compromised ? 'rgba(251,113,133,0.05)' : 'transparent',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <Mono size={12} color={compromised ? C.rose : C.t1}>{timeStr}</Mono>

          {/* Dynamic island / notch */}
          <div style={{
            width: 110, height: 26, borderRadius: 14,
            background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            {/* Camera aperture */}
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#1a1a1a', border: '1px solid #333' }} />
            {/* Face ID sensor — glows blue if trusted */}
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: compromised ? C.rose : C.blue,
              boxShadow: `0 0 6px ${compromised ? C.rose : C.blue}`,
              animation: 'blinkDot 2s ease-in-out infinite',
            }} />
          </div>

          {/* Status icons */}
          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            {compromised
              ? <WifiOff size={12} color={C.rose} />
              : <Wifi size={12} color={C.t1} />}
            {/* Signal bars */}
            <div style={{ display: 'flex', gap: 1.5, alignItems: 'flex-end' }}>
              {[3, 5, 7, 9].map((h, i) => (
                <div key={i} style={{
                  width: 2.5, height: h, borderRadius: 1,
                  background: compromised && i > 1 ? 'rgba(251,113,133,0.3)' : (i < 3 ? C.t1 : 'rgba(255,255,255,0.2)'),
                }} />
              ))}
            </div>
            {compromised
              ? <BatteryWarning size={13} color={C.rose} />
              : <Battery size={13} color={C.t1} />}
          </div>
        </div>

        {/* Non-compliant warning banner */}
        {compromised && (
          <div style={{
            margin: '0 10px 6px', padding: '5px 10px', borderRadius: 8,
            background: C.roseBg, border: `1px solid ${C.roseBorder}`,
            display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
          }}>
            <AlertTriangle size={10} color={C.rose} />
            <Mono size={9} color={C.rose}>DEVICE {deviceTrust.replace('_', ' ').toUpperCase()} — SECURITY ALERT</Mono>
          </div>
        )}

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none' }}>
          {children}
        </div>

        {/* Tab bar */}
        <div style={{
          flexShrink: 0, paddingBottom: 12, paddingTop: 6,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(16px)',
          borderTop: `1px solid rgba(255,255,255,0.05)`,
          display: 'flex',
        }}>
          {MOBILE_TABS.map(({ id, icon, label }) => {
            const active = tab === id;
            return (
              <button key={id} onClick={() => setTab(id)} style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                padding: '4px 0', border: 'none', background: 'transparent', cursor: 'pointer',
                color: active ? C.blue : C.t3, transition: 'color 150ms',
              }}>
                <div style={{
                  padding: '4px 14px', borderRadius: 10,
                  background: active ? C.blueGlow : 'transparent',
                  transition: 'background 200ms',
                }}>{icon}</div>
                <span style={{ fontSize: 8, fontWeight: active ? 700 : 500 }}>{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main Simulator ───────────────────────────────────────────────────────────

export default function HRMSSimulator() {
  const [selectedId,     setSelectedId]     = useState('priya');
  const [viewMode,       setViewMode]       = useState<ViewMode>('desktop');
  const [mobileTab,      setMobileTab]      = useState<MobileTab>('home');
  const [grossIncome,    setGrossIncome]    = useState(3_600_000);
  const [taxRegime,      setTaxRegime]      = useState<TaxRegime>('new');
  const [oldDed,         setOldDed]         = useState(150_000);
  const [nexusDays,      setNexusDays]      = useState(45);
  const [windowDays,     setWindowDays]     = useState(180);
  const [compGap,        setCompGap]        = useState(18);
  const [engagementDecay,setEngagementDecay]= useState(12);
  const [stagnMonths,    setStagnMonths]    = useState(8);
  const [deviceTrust,    setDeviceTrust]    = useState<DeviceTrust>('trusted');
  const [empLat,         setEmpLat]         = useState(12.97152);
  const [empLon,         setEmpLon]         = useState(77.59455);

  const emp = useMemo(() => EMPLOYEES.find(e => e.id === selectedId)!, [selectedId]);

  useEffect(() => {
    setGrossIncome(emp.grossIncome); setTaxRegime(emp.regime);
    setNexusDays(emp.nexusDays);     setWindowDays(emp.windowDays);
    setCompGap(emp.compGap);         setEngagementDecay(emp.engagementDecay);
    setStagnMonths(emp.stagnationMonths); setDeviceTrust(emp.deviceTrust);
    setEmpLat(emp.lat);              setEmpLon(emp.lon);
  }, [emp]);

  const taxResult  = useMemo(() => computeTax(grossIncome, taxRegime, oldDed), [grossIncome, taxRegime, oldDed]);
  const nexusResult = useMemo(() => computeNexus(nexusDays, windowDays), [nexusDays, windowDays]);
  const flightRisk = useMemo(() => computeFlightRisk(compGap, engagementDecay, stagnMonths), [compGap, engagementDecay, stagnMonths]);
  const geo        = useMemo(() => computeGeo(empLat, empLon, OFFICE_LAT, OFFICE_LON, GEOFENCE_R, deviceTrust), [empLat, empLon, deviceTrust]);

  return (
    <div className="sim-root" style={{ background: C.canvas, color: C.t1, fontFamily: "'Inter',system-ui,sans-serif" }}>

        {/* ── Sidebar ─────────────────────────────────────────────────── */}
        <div className="sim-sidebar" style={{ background: C.surface, borderRight: `1px solid ${C.border}` }}>
          {/* "Employee Profiles" heading — hidden on mobile horizontal strip */}
          <div className="sim-sidebar-section-label" style={{ padding: '16px 16px 8px', flexShrink: 0 }}>
            <SectionLabel>Employee Profiles</SectionLabel>
          </div>

          <div className="sim-sidebar-items">
            {EMPLOYEES.map(e => {
              const trust = e.id === selectedId ? deviceTrust : e.deviceTrust;
              const nexusSt = computeNexus(e.nexusDays, e.windowDays).status;
              const active = selectedId === e.id;
              return (
                <button
                  key={e.id}
                  onClick={() => setSelectedId(e.id)}
                  className={`sim-sidebar-btn emp-card-hover${active ? ' sim-sidebar-btn--active' : ''}`}
                  style={{
                    background: active ? `${e.color}10` : 'transparent',
                    /* active indicator border applied via CSS class (flips axis on mobile) */
                    ['--emp-color' as string]: e.color,
                  }}
                >
                  {/* Avatar ring brightens when active */}
                  <div style={{ flexShrink: 0, borderRadius: '50%', boxShadow: active ? `0 0 0 2px ${e.color}` : 'none', transition: 'box-shadow 180ms' }}>
                    <Avatar emp={e} size={32} />
                  </div>
                  <div className="sim-sidebar-btn-label" style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: active ? C.t1 : C.t2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 3 }}>{e.name}</div>
                    <div style={{ fontSize: 9, color: C.t3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 4 }}>{e.role}</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      <TrustBadge trust={trust} />
                      <NexusBadge status={nexusSt} />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* View mode toggle */}
          <div className="sim-sidebar-footer" style={{ borderTop: `1px solid ${C.border}`, paddingBottom: 12 }}>
            <div className="sim-sidebar-section-label" style={{ padding: '10px 0 6px' }}>
              <SectionLabel>View</SectionLabel>
            </div>
            <div style={{ display: 'flex', gap: 4, background: '#060810', borderRadius: 10, padding: 3, border: `1px solid ${C.border}` }}>
              {([
                { id: 'desktop', icon: <Monitor size={12} />, label: 'Grid' },
                { id: 'mobile',  icon: <Smartphone size={12} />, label: 'Phone' },
              ] as { id: ViewMode; icon: React.ReactNode; label: string }[]).map(({ id, icon, label }) => (
                <button key={id} onClick={() => setViewMode(id)} style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  padding: '5px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: viewMode === id ? C.blue : 'transparent',
                  color: viewMode === id ? '#fff' : C.t3, fontSize: 9, fontWeight: 600,
                  boxShadow: viewMode === id ? '0 0 14px rgba(59,130,246,0.3)' : 'none',
                  transition: 'all 180ms',
                }}>{icon}{label}</button>
              ))}
            </div>
          </div>

          <div className="sim-sidebar-tagline">
            <Mono size={9} color={C.t3}>{emp.tagline}</Mono>
          </div>
        </div>

        {/* ── Main ─────────────────────────────────────────────────────── */}
        <div className="sim-main" style={{ padding: 24 }}>

          {/* Header */}
          <div className="sim-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 38, height: 38, borderRadius: 11, flexShrink: 0,
                background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 0 20px rgba(59,130,246,0.25)',
              }}><Zap size={18} color="#fff" /></div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: C.t1, letterSpacing: '-0.02em' }}>HRMS Simulator</div>
                <div style={{ fontSize: 10, color: C.t3 }}>Enterprise Intelligence Engine · {emp.name}</div>
              </div>
            </div>
            <div className="sim-badges">
              <TrustBadge trust={deviceTrust} />
              <NexusBadge status={nexusResult.status} />
              <RiskBadge level={flightRisk.level} />
            </div>
          </div>

          {/* Desktop grid */}
          {viewMode === 'desktop' && (
            <div className="sim-grid">
              <TaxCard grossIncome={grossIncome} regime={taxRegime} oldDed={oldDed}
                setGrossIncome={setGrossIncome} setRegime={setTaxRegime} setOldDed={setOldDed} />
              <NexusCard nexusDays={nexusDays} windowDays={windowDays}
                setNexusDays={setNexusDays} setWindowDays={setWindowDays} />
              <GeoCard emp={emp} geo={geo} empLat={empLat} empLon={empLon} deviceTrust={deviceTrust}
                setEmpLat={setEmpLat} setEmpLon={setEmpLon} setDeviceTrust={setDeviceTrust} />
              <RiskCard compGap={compGap} engagementDecay={engagementDecay} stagnMonths={stagnMonths}
                setCompGap={setCompGap} setEngagementDecay={setEngagementDecay} setStagnMonths={setStagnMonths} />
            </div>
          )}

          {/* Mobile simulator */}
          {viewMode === 'mobile' && (
            <div className="sim-bezel-wrap">
              <PremiumBezel tab={mobileTab} setTab={setMobileTab} deviceTrust={deviceTrust}>
                {mobileTab === 'home'  && <MobileHome emp={emp} taxResult={taxResult} geo={geo} nexus={nexusResult} risk={flightRisk} deviceTrust={deviceTrust} setDeviceTrust={setDeviceTrust} setTab={setMobileTab} />}
                {mobileTab === 'clock' && <MobileClock geo={geo} empLat={empLat} empLon={empLon} emp={emp} deviceTrust={deviceTrust} setEmpLat={setEmpLat} setEmpLon={setEmpLon} />}
                {mobileTab === 'tax'   && <MobileTax grossIncome={grossIncome} regime={taxRegime} oldDed={oldDed} setGrossIncome={setGrossIncome} setRegime={setTaxRegime} setOldDed={setOldDed} />}
                {mobileTab === 'nexus' && <MobileNexus nexusDays={nexusDays} windowDays={windowDays} setNexusDays={setNexusDays} setWindowDays={setWindowDays} />}
                {mobileTab === 'risk'  && <MobileRisk compGap={compGap} engagementDecay={engagementDecay} stagnMonths={stagnMonths} setCompGap={setCompGap} setEngagementDecay={setEngagementDecay} setStagnMonths={setStagnMonths} />}
              </PremiumBezel>
            </div>
          )}
        </div>
    </div>
  );
}
