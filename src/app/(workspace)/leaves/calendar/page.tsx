'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { LeaveCalendarHeatmap, type LeaveSpan } from '@/components/widgets/LeaveCalendarHeatmap';

export default function LeaveCalendarPage() {
  const now   = new Date();
  const [month,   setMonth]   = useState(now.getMonth() + 1);
  const [year,    setYear]    = useState(now.getFullYear());
  const [leaves,  setLeaves]  = useState<LeaveSpan[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (m: number, y: number) => {
    setLoading(true);
    // Fetch leaves for a 3-month window centred on current month for context
    const from = new Date(y, m - 2, 1).toISOString().slice(0, 10);
    const to   = new Date(y, m + 1, 0).toISOString().slice(0, 10);
    const res  = await fetch(`/api/leaves?limit=200&status=approved&from=${from}&to=${to}`);
    const json = await res.json();
    setLeaves(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(month, year); }, [month, year, load]);

  const handleMonthChange = (m: number, y: number) => {
    setMonth(m); setYear(y);
  };

  return (
    <div style={{ padding: '2rem', maxWidth: 900 }}>
      <div style={{ marginBottom: '1.6rem' }}>
        <h2 style={{
          margin: 0, color: 'var(--color-neutral-10)',
          fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-20)',
        }}>
          Leave Calendar
        </h2>
        <p style={{ margin: 0, marginTop: 4, color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
          Approved leaves per day. Hover a cell to see employee codes on leave.
        </p>
      </div>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
          <Loader2 size={22} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
        </div>
      ) : (
        <LeaveCalendarHeatmap
          leaves={leaves}
          month={month}
          year={year}
          onMonthChange={handleMonthChange}
        />
      )}
    </div>
  );
}
