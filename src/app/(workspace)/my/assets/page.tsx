'use client';

import { useEffect, useState } from 'react';
import { Loader2 }             from 'lucide-react';
import { AssetsRegistry, type AssetRef } from '@/components/widgets/AssetsRegistry';
import { useToast }            from '@/components/ui/Toast';

export default function MyAssetsPage() {
  const [assets,  setAssets]  = useState<AssetRef[]>([]);
  const [loading, setLoading] = useState(true);
  const toast                  = useToast();

  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((d) => setAssets(d.data?.provisionedAssets ?? []))
      .finally(() => setLoading(false));
  }, []);

  const raiseTicket = (assetId: string) => {
    // In production, this would open a service-desk ticket via BullMQ job
    toast.push({
      kind:  'info',
      title: 'IT Ticket Raised',
      desc:  `Support request submitted for asset ${assetId}.`,
      ttl:   5000,
    });
  };

  return (
    <div style={{ padding: '2rem', maxWidth: 900 }}>
      <div style={{ marginBottom: '1.6rem' }}>
        <h2 style={{
          margin: 0, color: 'var(--color-neutral-10)',
          fontFamily: 'var(--font-jk-bd)', fontWeight: 700,
          fontSize: 'var(--text-fs-20)',
        }}>
          My Assets
        </h2>
        <p style={{ margin: 0, marginTop: 4, color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
          Hardware, SaaS identities, and access credentials issued to you.
        </p>
      </div>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
          <Loader2 size={22} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
        </div>
      ) : (
        <AssetsRegistry assets={assets} onRaiseTicket={raiseTicket} />
      )}
    </div>
  );
}
