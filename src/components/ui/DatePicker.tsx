'use client';

import { useState, useRef, useEffect } from 'react';
import { DayPicker } from 'react-day-picker';
import { format, parse, isValid } from 'date-fns';
import { CalendarDays } from 'lucide-react';

interface DatePickerProps {
  value: string;                    // YYYY-MM-DD
  onChange: (v: string) => void;
  min?: string;                     // YYYY-MM-DD — earliest selectable day
  max?: string;                     // YYYY-MM-DD — latest selectable day
  disabled?: boolean;
  placeholder?: string;
  style?: React.CSSProperties;
  className?: string;
}

function parseYMD(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  const d = parse(s, 'yyyy-MM-dd', new Date());
  return isValid(d) ? d : undefined;
}

export function DatePicker({
  value, onChange, min, max, disabled = false,
  placeholder = 'Select date', style, className = '',
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected  = parseYMD(value);
  const fromDate  = parseYMD(min);
  const toDate    = parseYMD(max);

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const disabledMatchers = [
    ...(fromDate ? [{ before: fromDate }] : []),
    ...(toDate   ? [{ after:  toDate   }] : []),
  ];

  return (
    <div ref={wrapRef} style={{ position: 'relative', ...style }}>
      <button
        type="button"
        className={`hrms-input hrms-datepicker-trigger ${className}`}
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
      >
        <CalendarDays size={14} style={{ color: 'var(--color-neutral-6)', flexShrink: 0 }} />
        <span style={{ flex: 1, textAlign: 'left', color: selected ? 'var(--color-neutral-10)' : 'var(--color-neutral-5)' }}>
          {selected ? format(selected, 'd MMM yyyy') : placeholder}
        </span>
      </button>

      {open && (
        <div className="hrms-datepicker-popover">
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={(d) => {
              if (d) { onChange(format(d, 'yyyy-MM-dd')); setOpen(false); }
            }}
            disabled={disabledMatchers.length ? disabledMatchers : undefined}
            defaultMonth={selected ?? fromDate ?? new Date()}
            captionLayout="dropdown"
            startMonth={fromDate ?? new Date(1950, 0, 1)}
            endMonth={toDate ?? new Date(2100, 11, 31)}
            className="hrms-rdp"
          />
        </div>
      )}
    </div>
  );
}
