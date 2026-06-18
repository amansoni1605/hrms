'use client';

import { createContext, useContext, useMemo } from 'react';
import { DayPicker, type DayButtonProps } from 'react-day-picker';
import { format } from 'date-fns';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface LeaveSpan {
  _id:        string;
  startDate:  string;
  endDate:    string;
  totalDays:  number;
  status:     string;
  employeeId?: { employeeCode: string; jobTitle: string } | null;
}

export interface LeaveCalendarHeatmapProps {
  leaves:         LeaveSpan[];
  month:          number;   // 1-12
  year:           number;
  onMonthChange?: (month: number, year: number) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Context — shares bucket/max data with the custom DayButton without closures
// ─────────────────────────────────────────────────────────────────────────────

interface HeatmapData {
  buckets: Map<string, LeaveSpan[]>;
  max:     number;
}

const HeatmapCtx = createContext<HeatmapData>({ buckets: new Map(), max: 0 });

// ─────────────────────────────────────────────────────────────────────────────
// Custom DayButton — reads from context, renders count badge + heat colour
// ─────────────────────────────────────────────────────────────────────────────

function HeatmapDayButton({ day, modifiers, children, style, ...rest }: DayButtonProps) {
  const { buckets, max } = useContext(HeatmapCtx);

  const d   = day.date;
  const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  const entries = buckets.get(key) ?? [];
  const count   = entries.length;

  const intensity = max > 0 ? count / max : 0;
  const heatBg =
    count === 0 ? undefined :
    intensity < 0.34 ? 'var(--color-vr-blue-1)' :
    intensity < 0.67 ? 'var(--color-vr-blue-3)' :
                       'var(--color-vr-blue-6)';
  const textColor = intensity >= 0.67 ? 'var(--color-neutral-1)' : undefined;

  const tooltip = entries.length
    ? `${entries.length} on leave: ${entries.map((e) => e.employeeId?.employeeCode ?? '?').slice(0, 5).join(', ')}${entries.length > 5 ? '…' : ''}`
    : undefined;

  return (
    <button
      {...rest}
      title={tooltip}
      style={{
        ...style,
        background: heatBg ?? style?.background,
        color:      textColor ?? style?.color,
        position:   'relative',
      }}
    >
      {children}
      {count > 0 && (
        <span style={{
          position:   'absolute',
          bottom:     1,
          right:      2,
          fontSize:   8,
          fontWeight: 700,
          lineHeight: 1,
          opacity:    0.85,
        }}>
          {count}
        </span>
      )}
    </button>
  );
}

// Stable component ref — defined outside any render so react-day-picker
// never sees a new component type between re-renders.
const HEATMAP_COMPONENTS = { DayButton: HeatmapDayButton };

// ─────────────────────────────────────────────────────────────────────────────
// Build day→leave buckets using date-fns
// ─────────────────────────────────────────────────────────────────────────────

function buildBuckets(leaves: LeaveSpan[]): Map<string, LeaveSpan[]> {
  const map = new Map<string, LeaveSpan[]>();
  for (const l of leaves) {
    if (l.status !== 'approved') continue;
    const start = new Date(l.startDate);
    const end   = new Date(l.endDate);
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
      const arr = map.get(key) ?? [];
      arr.push(l);
      map.set(key, arr);
    }
  }
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function LeaveCalendarHeatmap({
  leaves, month, year, onMonthChange,
}: LeaveCalendarHeatmapProps) {
  const currentMonth = useMemo(() => new Date(year, month - 1, 1), [year, month]);

  const buckets = useMemo(() => buildBuckets(leaves), [leaves]);
  const max     = useMemo(
    () => Math.max(0, ...Array.from(buckets.values()).map((v) => v.length)),
    [buckets],
  );

  const ctxValue = useMemo(() => ({ buckets, max }), [buckets, max]);

  return (
    <div className="hrms-card" style={{ padding: '1.4rem 1.6rem' }}>
      <HeatmapCtx.Provider value={ctxValue}>
        <DayPicker
          month={currentMonth}
          onMonthChange={(m) => onMonthChange?.(m.getMonth() + 1, m.getFullYear())}
          components={HEATMAP_COMPONENTS}
          className="hrms-rdp hrms-heatmap-rdp"
          showOutsideDays={false}
          formatters={{
            formatCaption: (d) => format(d, 'MMMM yyyy'),
          }}
        />
      </HeatmapCtx.Provider>

      {/* Legend */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        gap: 8, marginTop: '0.8rem', fontSize: 10, color: 'var(--color-neutral-7)',
      }}>
        <span>Fewer</span>
        {(['var(--color-neutral-2)', 'var(--color-vr-blue-1)', 'var(--color-vr-blue-3)', 'var(--color-vr-blue-6)'] as const)
          .map((bg, i) => (
            <span key={i} style={{ width: 12, height: 12, borderRadius: 3, background: bg, border: '1px solid var(--color-stroke)' }} />
          ))}
        <span>More</span>
      </div>
    </div>
  );
}
