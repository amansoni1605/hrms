'use client';

import { useState } from 'react';
import { Users, X, TrendingUp, BarChart3 } from 'lucide-react';
import type { EmployeePerformanceRecord } from './types';

// ─── Mock employee data ────────────────────────────────────────────────────────

const MOCK_EMPLOYEES: EmployeePerformanceRecord[] = [
  { id: 'e1',  name: 'Meera Iyer',     initials: 'MI', role: 'VP Engineering',      department: 'Engineering',  currentScore: 4.8, potentialScore: 4.9, nineBoxX: 3, nineBoxY: 3, goalsCompleted: 5, totalGoals: 5,  avatarColor: '#7C3AED' },
  { id: 'e2',  name: 'Dhruv Mehta',    initials: 'DM', role: 'Sr. Product Manager', department: 'Product',      currentScore: 4.5, potentialScore: 4.2, nineBoxX: 3, nineBoxY: 3, goalsCompleted: 4, totalGoals: 5,  avatarColor: '#1C509D' },
  { id: 'e3',  name: 'Aarav Shah',     initials: 'AS', role: 'Software Engineer',   department: 'Engineering',  currentScore: 3.8, potentialScore: 4.5, nineBoxX: 2, nineBoxY: 3, goalsCompleted: 3, totalGoals: 5,  avatarColor: '#0F7B6C' },
  { id: 'e4',  name: 'Priya Nair',     initials: 'PN', role: 'Data Scientist',      department: 'Analytics',    currentScore: 4.2, potentialScore: 3.9, nineBoxX: 3, nineBoxY: 2, goalsCompleted: 4, totalGoals: 5,  avatarColor: '#B45309' },
  { id: 'e5',  name: 'Rohan Gupta',    initials: 'RG', role: 'Sales Manager',       department: 'Sales',        currentScore: 3.5, potentialScore: 3.7, nineBoxX: 2, nineBoxY: 2, goalsCompleted: 3, totalGoals: 4,  avatarColor: '#DC2626' },
  { id: 'e6',  name: 'Ananya Sharma',  initials: 'AS', role: 'UX Designer',         department: 'Design',       currentScore: 2.9, potentialScore: 4.3, nineBoxX: 1, nineBoxY: 3, goalsCompleted: 2, totalGoals: 5,  avatarColor: '#0891B2' },
  { id: 'e7',  name: 'Kiran Rao',      initials: 'KR', role: 'DevOps Engineer',     department: 'Engineering',  currentScore: 3.9, potentialScore: 2.8, nineBoxX: 3, nineBoxY: 1, goalsCompleted: 4, totalGoals: 5,  avatarColor: '#059669' },
  { id: 'e8',  name: 'Neha Kapoor',    initials: 'NK', role: 'HR Manager',          department: 'HR',           currentScore: 3.6, potentialScore: 3.5, nineBoxX: 2, nineBoxY: 2, goalsCompleted: 3, totalGoals: 4,  avatarColor: '#D946EF' },
  { id: 'e9',  name: 'Vikram Singh',   initials: 'VS', role: 'Finance Analyst',     department: 'Finance',      currentScore: 2.4, potentialScore: 2.6, nineBoxX: 1, nineBoxY: 1, goalsCompleted: 2, totalGoals: 5,  avatarColor: '#64748B' },
  { id: 'e10', name: 'Tara Pillai',    initials: 'TP', role: 'Content Strategist',  department: 'Marketing',    currentScore: 4.0, potentialScore: 2.5, nineBoxX: 3, nineBoxY: 1, goalsCompleted: 4, totalGoals: 4,  avatarColor: '#EA580C' },
  { id: 'e11', name: 'Aditya Kumar',   initials: 'AK', role: 'Backend Engineer',    department: 'Engineering',  currentScore: 3.7, potentialScore: 4.6, nineBoxX: 2, nineBoxY: 3, goalsCompleted: 3, totalGoals: 5,  avatarColor: '#7C3AED' },
  { id: 'e12', name: 'Sonia Mehta',    initials: 'SM', role: 'Account Executive',   department: 'Sales',        currentScore: 2.8, potentialScore: 3.4, nineBoxX: 1, nineBoxY: 2, goalsCompleted: 1, totalGoals: 4,  avatarColor: '#B45309' },
];

// ─── 9-box cell definitions ────────────────────────────────────────────────────

type BoxCell = {
  x:         1 | 2 | 3;
  y:         1 | 2 | 3;
  label:     string;
  sublabel:  string;
  bg:        string;
  border:    string;
  color:     string;
  tagBg:     string;
};

const NINE_BOX_CELLS: BoxCell[] = [
  // Y=3 (top row)
  { x: 1, y: 3, label: 'Enigma',          sublabel: 'Low Perf · High Pot', bg: '#F3E8FF', border: '#C4B5FD', color: '#6D28D9', tagBg: '#7C3AED' },
  { x: 2, y: 3, label: 'High Potential',  sublabel: 'Mid Perf · High Pot', bg: '#CFFAFE', border: '#67E8F9', color: '#0E7490', tagBg: '#0891B2' },
  { x: 3, y: 3, label: 'Top Talent',      sublabel: 'High Perf · High Pot', bg: '#D1FAE5', border: '#6EE7B7', color: '#065F46', tagBg: '#059669' },
  // Y=2 (middle row)
  { x: 1, y: 2, label: 'Inconsistent',    sublabel: 'Low Perf · Mid Pot',  bg: '#FEF3C7', border: '#FCD34D', color: '#92400E', tagBg: '#D97706' },
  { x: 2, y: 2, label: 'Key Player',      sublabel: 'Mid Perf · Mid Pot',  bg: '#EEF2FF', border: '#A5B4FC', color: '#3730A3', tagBg: '#4F46E5' },
  { x: 3, y: 2, label: 'Current Star',    sublabel: 'High Perf · Mid Pot', bg: '#ECFDF5', border: '#6EE7B7', color: '#065F46', tagBg: '#10B981' },
  // Y=1 (bottom row)
  { x: 1, y: 1, label: 'Underperformer',  sublabel: 'Low Perf · Low Pot',  bg: '#FEE2E2', border: '#FCA5A5', color: '#991B1B', tagBg: '#DC2626' },
  { x: 2, y: 1, label: 'Core Employee',   sublabel: 'Mid Perf · Low Pot',  bg: '#FFF7ED', border: '#FED7AA', color: '#9A3412', tagBg: '#EA580C' },
  { x: 3, y: 1, label: 'Strong Performer',sublabel: 'High Perf · Low Pot', bg: '#F0FDF4', border: '#86EFAC', color: '#14532D', tagBg: '#16A34A' },
];

// ─── EmployeeAvatar ───────────────────────────────────────────────────────────

function EmployeeAvatar({
  emp, size = 26, onClick, selected,
}: {
  emp:       EmployeePerformanceRecord;
  size?:     number;
  onClick?:  () => void;
  selected?: boolean;
}) {
  return (
    <div
      title={`${emp.name} — ${emp.role}`}
      onClick={onClick}
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        background: emp.avatarColor + '20',
        border: `2px solid ${selected ? emp.avatarColor : emp.avatarColor + '70'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-jk-bd)', fontWeight: 700,
        fontSize: Math.round(size * 0.38),
        color: emp.avatarColor, cursor: onClick ? 'pointer' : 'default',
        transition: 'all 140ms',
        boxShadow: selected ? `0 0 0 2.5px ${emp.avatarColor}` : 'none',
        transform: selected ? 'scale(1.15)' : 'scale(1)',
      }}
    >
      {emp.initials}
    </div>
  );
}

// ─── GridCell ─────────────────────────────────────────────────────────────────

function GridCell({
  cell, employees, selected, onClick,
}: {
  cell:      BoxCell;
  employees: EmployeePerformanceRecord[];
  selected:  boolean;
  onClick:   () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: cell.bg,
        border: `1.5px solid ${selected ? cell.color : cell.border}`,
        borderRadius: '0.8rem',
        padding: '0.9rem',
        cursor: 'pointer',
        transition: 'all 150ms',
        boxShadow: selected ? `0 0 0 2px ${cell.color}, 0 4px 12px ${cell.color}30` : 'none',
        display: 'flex', flexDirection: 'column', gap: '0.5rem',
        minHeight: 110,
      }}
      onMouseEnter={(e) => {
        if (!selected) (e.currentTarget as HTMLDivElement).style.borderColor = cell.color;
      }}
      onMouseLeave={(e) => {
        if (!selected) (e.currentTarget as HTMLDivElement).style.borderColor = cell.border;
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <p style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-12)', color: cell.color, lineHeight: 1.2 }}>
            {cell.label}
          </p>
          <p style={{ margin: '0.15rem 0 0', fontSize: 10, color: cell.color, opacity: 0.7, fontFamily: 'var(--font-in-rg)' }}>
            {cell.sublabel}
          </p>
        </div>
        <span
          style={{
            minWidth: 20, height: 20, borderRadius: 99,
            background: cell.tagBg, color: '#fff',
            fontSize: 10, fontFamily: 'var(--font-jk-bd)', fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 5px', flexShrink: 0,
          }}
        >
          {employees.length}
        </span>
      </div>

      {/* Avatars */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', flex: 1, alignContent: 'flex-end' }}>
        {employees.slice(0, 6).map((emp) => (
          <EmployeeAvatar key={emp.id} emp={emp} size={24} />
        ))}
        {employees.length > 6 && (
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontFamily: 'var(--font-in-sb)', fontWeight: 700, color: cell.color }}>
            +{employees.length - 6}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── EmployeeCard ─────────────────────────────────────────────────────────────

function EmployeeCard({ emp }: { emp: EmployeePerformanceRecord }) {
  const cellDef = NINE_BOX_CELLS.find((c) => c.x === emp.nineBoxX && c.y === emp.nineBoxY)!;
  const completionPct = emp.totalGoals > 0 ? Math.round((emp.goalsCompleted / emp.totalGoals) * 100) : 0;

  return (
    <tr
      style={{ transition: 'background 100ms' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-neutral-2)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = '')}
    >
      <td className="hrms-td">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <EmployeeAvatar emp={emp} size={32} />
          <div>
            <p style={{ margin: 0, fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-10)', fontSize: 'var(--text-fs-13)' }}>
              {emp.name}
            </p>
            <p style={{ margin: '1px 0 0', fontSize: 10, color: 'var(--color-neutral-6)' }}>
              {emp.role}
            </p>
          </div>
        </div>
      </td>
      <td className="hrms-td">
        <span style={{ padding: '2px 7px', borderRadius: 99, background: 'var(--color-neutral-3)', fontSize: 10, fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-8)', whiteSpace: 'nowrap' }}>
          {emp.department}
        </span>
      </td>
      <td className="hrms-td" style={{ fontVariantNumeric: 'tabular-nums' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ flex: 1, height: 5, borderRadius: 99, background: 'var(--color-neutral-4)', overflow: 'hidden', minWidth: 60 }}>
            <div style={{ height: '100%', width: `${(emp.currentScore / 5) * 100}%`, borderRadius: 99, background: 'var(--color-vr-blue-6)' }} />
          </div>
          <span style={{ fontFamily: 'var(--font-in-sb)', fontWeight: 700, fontSize: 'var(--text-fs-12)', color: 'var(--color-vr-blue-6)', whiteSpace: 'nowrap' }}>
            {emp.currentScore}/5
          </span>
        </div>
      </td>
      <td className="hrms-td" style={{ fontVariantNumeric: 'tabular-nums' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ flex: 1, height: 5, borderRadius: 99, background: 'var(--color-neutral-4)', overflow: 'hidden', minWidth: 60 }}>
            <div style={{ height: '100%', width: `${(emp.potentialScore / 5) * 100}%`, borderRadius: 99, background: '#7C3AED' }} />
          </div>
          <span style={{ fontFamily: 'var(--font-in-sb)', fontWeight: 700, fontSize: 'var(--text-fs-12)', color: '#7C3AED', whiteSpace: 'nowrap' }}>
            {emp.potentialScore}/5
          </span>
        </div>
      </td>
      <td className="hrms-td">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ fontFamily: 'var(--font-in-sb)', fontWeight: 600, fontSize: 'var(--text-fs-12)' }}>
            {emp.goalsCompleted}/{emp.totalGoals}
          </span>
          <span style={{ fontSize: 10, color: completionPct >= 80 ? '#065F46' : 'var(--color-neutral-6)' }}>
            ({completionPct}%)
          </span>
        </div>
      </td>
      <td className="hrms-td">
        <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 10, fontFamily: 'var(--font-in-sb)', fontWeight: 700, background: cellDef.bg, color: cellDef.color, border: `1px solid ${cellDef.border}`, whiteSpace: 'nowrap' }}>
          {cellDef.label}
        </span>
      </td>
    </tr>
  );
}

// ─── NineBoxGrid ──────────────────────────────────────────────────────────────

export interface NineBoxGridProps {
  employees?: EmployeePerformanceRecord[];
}

export function NineBoxGrid({ employees = MOCK_EMPLOYEES }: NineBoxGridProps) {
  const [selectedCell, setSelectedCell] = useState<{ x: 1 | 2 | 3; y: 1 | 2 | 3 } | null>(null);

  const handleCellClick = (x: 1 | 2 | 3, y: 1 | 2 | 3) => {
    setSelectedCell((prev) =>
      prev && prev.x === x && prev.y === y ? null : { x, y },
    );
  };

  const filteredEmployees = selectedCell
    ? employees.filter((e) => e.nineBoxX === selectedCell.x && e.nineBoxY === selectedCell.y)
    : employees;

  const selectedCellDef = selectedCell
    ? NINE_BOX_CELLS.find((c) => c.x === selectedCell.x && c.y === selectedCell.y) ?? null
    : null;

  return (
    <div>
      {/* Summary KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.4rem' }}>
        {[
          { label: 'Total Employees', value: employees.length, icon: Users, color: 'var(--color-vr-blue-6)', bg: 'var(--color-vr-blue-1)' },
          { label: 'Top Talent (9/9)', value: employees.filter((e) => e.nineBoxX === 3 && e.nineBoxY === 3).length, icon: TrendingUp, color: '#065F46', bg: '#D1FAE5' },
          { label: 'High Potential',   value: employees.filter((e) => e.nineBoxY === 3).length,                      icon: BarChart3, color: '#0891B2', bg: '#CFFAFE' },
          { label: 'At-Risk',          value: employees.filter((e) => e.nineBoxX === 1 && e.nineBoxY === 1).length, icon: Users, color: '#991B1B', bg: '#FEE2E2' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="hrms-card" style={{ padding: '1.1rem 1.4rem', display: 'flex', gap: '0.9rem', alignItems: 'center' }}>
            <div style={{ width: 36, height: 36, borderRadius: '0.7rem', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon size={16} color={color} />
            </div>
            <div>
              <p style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-22)', color, lineHeight: 1 }}>{value}</p>
              <p style={{ margin: '0.2rem 0 0', fontSize: 'var(--text-fs-11)', color: 'var(--color-neutral-7)' }}>{label}</p>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.4rem', alignItems: 'start' }}>

        {/* Left: The Grid */}
        <div className="hrms-card" style={{ padding: '1.4rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
            <p style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-14)', color: 'var(--color-neutral-10)' }}>
              9-Box Calibration Matrix
            </p>
            {selectedCell && (
              <button
                onClick={() => setSelectedCell(null)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '0.3rem 0.7rem', borderRadius: '0.5rem', border: '1px solid var(--color-stroke)', background: 'var(--color-neutral-3)', cursor: 'pointer', fontSize: 'var(--text-fs-11)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-8)' }}
              >
                <X size={10} /> Clear filter
              </button>
            )}
          </div>

          {/* Axis labels */}
          <div style={{ display: 'flex', marginBottom: '0.4rem' }}>
            <div style={{ width: 28 }} />
            {(['Low', 'Medium', 'High'] as const).map((l) => (
              <div key={l} style={{ flex: 1, textAlign: 'center', fontSize: 10, fontFamily: 'var(--font-in-sb)', fontWeight: 700, color: 'var(--color-neutral-7)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                {l}
              </div>
            ))}
          </div>

          {/* Rows (Y=3 top to Y=1 bottom) */}
          {([3, 2, 1] as const).map((y) => (
            <div key={y} style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.4rem', alignItems: 'stretch' }}>
              {/* Y-axis label */}
              <div style={{ width: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span
                  style={{
                    fontSize: 9, fontFamily: 'var(--font-in-sb)', fontWeight: 700,
                    color: 'var(--color-neutral-6)', letterSpacing: '0.05em', textTransform: 'uppercase',
                    writingMode: 'vertical-rl', transform: 'rotate(180deg)', textAlign: 'center',
                  }}
                >
                  {y === 3 ? 'High' : y === 2 ? 'Mid' : 'Low'}
                </span>
              </div>

              {([1, 2, 3] as const).map((x) => {
                const cellDef = NINE_BOX_CELLS.find((c) => c.x === x && c.y === y)!;
                const emps    = employees.filter((e) => e.nineBoxX === x && e.nineBoxY === y);
                const isSel   = selectedCell?.x === x && selectedCell?.y === y;
                return (
                  <div key={x} style={{ flex: 1 }}>
                    <GridCell
                      cell={cellDef}
                      employees={emps}
                      selected={isSel}
                      onClick={() => handleCellClick(x, y)}
                    />
                  </div>
                );
              })}
            </div>
          ))}

          {/* X-axis label */}
          <div style={{ display: 'flex', marginTop: '0.4rem' }}>
            <div style={{ width: 28 }} />
            <p style={{ flex: 1, textAlign: 'center', margin: 0, fontSize: 10, fontFamily: 'var(--font-in-sb)', fontWeight: 700, color: 'var(--color-neutral-7)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              ← PERFORMANCE →
            </p>
          </div>
          <div style={{ textAlign: 'center', marginTop: '0.15rem', fontSize: 10, color: 'var(--color-neutral-6)' }}>
            Click any cell to filter the employee list
          </div>
        </div>

        {/* Right: Legend */}
        <div className="hrms-card" style={{ padding: '1.4rem' }}>
          <p style={{ margin: '0 0 1rem', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-14)', color: 'var(--color-neutral-10)' }}>
            Quadrant Legend
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {NINE_BOX_CELLS.slice().reverse().map((cell) => {
              const count = employees.filter((e) => e.nineBoxX === cell.x && e.nineBoxY === cell.y).length;
              const isSel = selectedCell?.x === cell.x && selectedCell?.y === cell.y;
              return (
                <div
                  key={`${cell.x}-${cell.y}`}
                  onClick={() => handleCellClick(cell.x, cell.y)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.7rem',
                    padding: '0.6rem 0.8rem', borderRadius: '0.6rem',
                    background: isSel ? cell.bg : 'transparent',
                    border: `1px solid ${isSel ? cell.border : 'transparent'}`,
                    cursor: 'pointer', transition: 'all 120ms',
                  }}
                  onMouseEnter={(e) => { if (!isSel) (e.currentTarget as HTMLDivElement).style.background = cell.bg + '80'; }}
                  onMouseLeave={(e) => { if (!isSel) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                >
                  <div style={{ width: 10, height: 10, borderRadius: '0.2rem', background: cell.tagBg, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: cell.color }}>
                      {cell.label}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--color-neutral-6)', marginLeft: 6 }}>
                      {cell.sublabel}
                    </span>
                  </div>
                  <span style={{ fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, color: count > 0 ? cell.color : 'var(--color-neutral-6)', flexShrink: 0 }}>
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Employee list (filtered) */}
      <div className="hrms-card" style={{ marginTop: '1.4rem', padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', padding: '1rem 1.6rem', borderBottom: '1px solid var(--color-stroke)' }}>
          <p style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-14)', color: 'var(--color-neutral-10)' }}>
            {selectedCellDef ? (
              <span>
                {selectedCellDef.label}{' '}
                <span style={{ fontFamily: 'var(--font-in-rg)', fontWeight: 400, color: 'var(--color-neutral-6)', fontSize: 'var(--text-fs-12)' }}>
                  — {selectedCellDef.sublabel}
                </span>
              </span>
            ) : (
              'All Employees'
            )}
          </p>
          {selectedCellDef && (
            <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 10, fontFamily: 'var(--font-in-sb)', fontWeight: 700, background: selectedCellDef.bg, color: selectedCellDef.color, border: `1px solid ${selectedCellDef.border}` }}>
              {filteredEmployees.length} employee{filteredEmployees.length !== 1 ? 's' : ''}
            </span>
          )}
          {selectedCell && (
            <button
              onClick={() => setSelectedCell(null)}
              style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, padding: '0.3rem 0.7rem', borderRadius: '0.5rem', border: '1px solid var(--color-stroke)', background: 'none', cursor: 'pointer', fontSize: 'var(--text-fs-11)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-8)' }}
            >
              <X size={10} /> Show all
            </button>
          )}
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-fs-12)' }}>
          <thead>
            <tr>
              {['Employee', 'Department', 'Performance', 'Potential', 'Goals', 'Box Segment'].map((h) => (
                <th key={h} className="hrms-th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-13)' }}>
                  No employees in this segment.
                </td>
              </tr>
            ) : (
              filteredEmployees.map((emp) => <EmployeeCard key={emp.id} emp={emp} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
