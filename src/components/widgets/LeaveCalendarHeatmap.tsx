'use client';

import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// LeaveCalendarHeatmap — month grid showing approved leaves per day.
// Cell intensity scales with the number of employees on leave that day.
// ─────────────────────────────────────────────────────────────────────────────

export interface LeaveSpan {
  _id:        string;
  startDate:  string;
  endDate:    string;
  totalDays:  number;
  status:     string;          // only 'approved' is counted
  employeeId?: { employeeCode: string; jobTitle: string } | null;
}

export interface LeaveCalendarHeatmapProps {
  leaves:        LeaveSpan[];
  month:         number;       // 1-12
  year:          number;
  onMonthChange?: (month: number, year: number) => void;
}

const DAY_LABEL = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function buildDayBuckets(leaves: LeaveSpan[], month: number, year: number) {
  const buckets = new Map<string, LeaveSpan[]>();
  for (const l of leaves) {
    if (l.status !== 'approved') continue;
    const start = new Date(l.startDate);
    const end   = new Date(l.endDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (d.getFullYear() !== year || d.getMonth() + 1 !== month) continue;
      const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
      const arr = buckets.get(key) ?? [];
      arr.push(l);
      buckets.set(key, arr);
    }
  }
  return buckets;
}

function intensityColor(count: number, max: number): string {
  if (count === 0) return 'var(--color-neutral-2)';
  const ratio = Math.min(1, count / Math.max(1, max));
  if (ratio < 0.34) return 'var(--color-vr-blue-1)';
  if (ratio < 0.67) return 'var(--color-vr-blue-3)';
  return 'var(--color-vr-blue-6)';
}

export function LeaveCalendarHeatmap({
  leaves, month, year, onMonthChange,
}: LeaveCalendarHeatmapProps) {
  const buckets = useMemo(() => buildDayBuckets(leaves, month, year), [leaves, month, year]);
  const max     = useMemo(() => Math.max(0, ...Array.from(buckets.values()).map((v) => v.length)), [buckets]);

  // Calendar grid: 6 weeks × 7 days
  const firstDow    = new Date(year, month - 1, 1).getDay();           // 0..6
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: Array<{ day: number | null; count: number; entries: LeaveSpan[] }> = [];
  for (let i = 0; i < firstDow; i++) cells.push({ day: null, count: 0, entries: [] });
  for (let d = 1; d <= daysInMonth; d++) {
    const key     = `${year}-${month}-${d}`;
    const entries = buckets.get(key) ?? [];
    cells.push({ day: d, count: entries.length, entries });
  }
  while (cells.length % 7 !== 0) cells.push({ day: null, count: 0, entries: [] });

  const monthName = new Date(year, month - 1, 1).toLocaleDateString('en-US', {
    month: 'long', year: 'numeric',
  });

  const go = (delta: number) => {
    if (!onMonthChange) return;
    const d = new Date(year, month - 1 + delta, 1);
    onMonthChange(d.getMonth() + 1, d.getFullYear());
  };

  return (
    <div className="hrms-card" style={{ padding: '1.4rem 1.6rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
        <button
          onClick={() => go(-1)}
          aria-label="Previous month"
          className="hrms-btn-ghost"
          style={{ padding: '0.4rem 0.6rem' }}
        >
          <ChevronLeft size={13} />
        </button>
        <h3 style={{
          margin: 0, flex: 1, textAlign: 'center',
          color: 'var(--color-neutral-10)',
          fontFamily: 'var(--font-jk-bd)', fontWeight: 700,
          fontSize: 'var(--text-fs-14)',
        }}>
          {monthName}
        </h3>
        <button
          onClick={() => go(1)}
          aria-label="Next month"
          className="hrms-btn-ghost"
          style={{ padding: '0.4rem 0.6rem' }}
        >
          <ChevronRight size={13} />
        </button>
      </div>

      {/* Day-of-week headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
        gap: 4, marginBottom: 4,
      }}>
        {DAY_LABEL.map((d) => (
          <div key={d} style={{
            textAlign: 'center', color: 'var(--color-neutral-7)',
            fontSize: 10, fontFamily: 'var(--font-in-sb)', fontWeight: 600,
            letterSpacing: '0.08em', textTransform: 'uppercase',
          }}>
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {cells.map((c, i) => {
          const today = new Date();
          const isToday = c.day === today.getDate()
                       && month   === today.getMonth() + 1
                       && year    === today.getFullYear();

          return (
            <div
              key={i}
              title={c.entries.length
                ? `${c.entries.length} on leave: ${c.entries.map((e) => e.employeeId?.employeeCode ?? '?').slice(0, 5).join(', ')}${c.entries.length > 5 ? '…' : ''}`
                : undefined}
              style={{
                aspectRatio: '1 / 1',
                borderRadius: '0.4rem',
                background: c.day === null ? 'transparent' : intensityColor(c.count, max),
                border: isToday ? '2px solid var(--color-vr-blue-6)' : '1px solid var(--color-stroke)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 'var(--text-fs-12)',
                color: c.count > Math.ceil(max / 2)
                  ? 'var(--color-neutral-1)'
                  : 'var(--color-neutral-9)',
                fontFamily: isToday ? 'var(--font-in-sb)' : 'var(--font-in-rg)',
                fontWeight:  isToday ? 600 : 400,
                position: 'relative',
                cursor: c.entries.length ? 'help' : 'default',
              }}
            >
              {c.day}
              {c.count > 0 && (
                <span style={{
                  position: 'absolute', bottom: 2, right: 4,
                  fontSize: 9, fontVariantNumeric: 'tabular-nums',
                  fontFamily: 'var(--font-in-sb)', fontWeight: 600,
                  opacity: 0.7,
                }}>
                  {c.count}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        gap: 8, marginTop: '1rem', fontSize: 10, color: 'var(--color-neutral-7)',
      }}>
        <span>Fewer</span>
        {['var(--color-neutral-2)','var(--color-vr-blue-1)','var(--color-vr-blue-3)','var(--color-vr-blue-6)']
          .map((bg, i) => (
            <span key={i} style={{
              width: 12, height: 12, borderRadius: 3, background: bg,
              border: '1px solid var(--color-stroke)',
            }} />
          ))}
        <span>More</span>
      </div>
    </div>
  );
}
