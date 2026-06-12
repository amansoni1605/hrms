'use client';

import { useEffect, useState } from 'react';
import { Loader2 }             from 'lucide-react';
import { EquityVestingTimeline, type VestingGrant } from '@/components/widgets/EquityVestingTimeline';

export default function MyEquityPage() {
  const [grants,  setGrants]  = useState<VestingGrant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((d) => {
        const emp = d.data;
        setGrants(emp?.vestingSchedules ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ padding: '2rem', maxWidth: 900 }}>
      <div style={{ marginBottom: '1.6rem' }}>
        <h2 style={{
          margin: 0, color: 'var(--color-neutral-10)',
          fontFamily: 'var(--font-jk-bd)', fontWeight: 700,
          fontSize: 'var(--text-fs-20)',
        }}>
          My Equity
        </h2>
        <p style={{ margin: 0, marginTop: 4, color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
          ESOP · RSU · SAR — vesting schedule and exercise window.
        </p>
      </div>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
          <Loader2 size={22} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
        </div>
      ) : (
        <EquityVestingTimeline grants={grants} />
      )}
    </div>
  );
}
