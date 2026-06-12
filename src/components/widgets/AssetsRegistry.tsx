'use client';

import { Laptop, Key, ShieldAlert, CheckCircle, Loader2 } from 'lucide-react';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { EmptyState }         from '@/components/ui/EmptyState';
import { formatRelativeTime } from '@/lib/format';

export interface AssetRef {
  assetId:       string;
  assetCategory: 'saas_identity' | 'hardware' | string;
  provider?:     string;
  state:         'pending' | 'provisioned' | 'suspended' | 'deprovisioned' | 'failed' | string;
  syncedAt?:     string;
  // Optional enriched fields from joined Asset doc
  name?:         string;
  serialNumber?: string;
  model?:        string;
}

export interface AssetsRegistryProps {
  assets:           AssetRef[];
  onRaiseTicket?:   (assetId: string) => void;
}

const CATEGORY_ICON: Record<string, typeof Laptop> = {
  hardware:      Laptop,
  saas_identity: Key,
};

const STATE_VARIANT_MAP: Record<string, 'success'|'warning'|'danger'|'neutral'|'info'> = {
  provisioned:    'success',
  pending:        'warning',
  suspended:      'warning',
  deprovisioned:  'neutral',
  failed:         'danger',
};

export function AssetsRegistry({ assets, onRaiseTicket }: AssetsRegistryProps) {
  if (assets.length === 0) {
    return (
      <EmptyState
        icon={Laptop}
        title="No assets assigned"
        message="Hardware, SaaS access, and identity credentials issued to you will appear here."
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
      {assets.map((a) => {
        const Icon  = CATEGORY_ICON[a.assetCategory] ?? Laptop;
        const stateVariant = STATE_VARIANT_MAP[a.state] ?? 'neutral';
        const isHealthy    = a.state === 'provisioned';

        return (
          <div
            key={a.assetId}
            className="hrms-card"
            style={{
              padding: '1rem 1.2rem',
              display: 'flex', alignItems: 'center', gap: '1rem',
            }}
          >
            <div
              style={{
                width: 36, height: 36, borderRadius: '0.8rem',
                background: isHealthy ? 'var(--color-vr-blue-1)' : 'var(--color-neutral-3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Icon size={16} style={{
                color: isHealthy ? 'var(--color-vr-blue-7)' : 'var(--color-neutral-6)',
              }} />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                <p style={{
                  margin: 0, color: 'var(--color-neutral-10)',
                  fontFamily: 'var(--font-in-sb)', fontWeight: 600,
                  fontSize: 'var(--text-fs-12)',
                }}>
                  {a.name ?? a.assetId}
                </p>
                <Badge variant={stateVariant}>
                  {a.state.replace(/_/g, ' ')}
                </Badge>
              </div>
              <p style={{
                margin: 0, marginTop: 2,
                color: 'var(--color-neutral-7)', fontSize: 10,
              }}>
                {[
                  a.assetCategory.replace(/_/g, ' '),
                  a.provider,
                  a.model,
                  a.serialNumber ? `S/N ${a.serialNumber}` : null,
                ].filter(Boolean).join(' · ')}
              </p>
              {a.syncedAt && (
                <p style={{ margin: 0, color: 'var(--color-neutral-6)', fontSize: 10 }}>
                  Synced {formatRelativeTime(a.syncedAt)}
                </p>
              )}
            </div>

            {/* CTA / status */}
            {a.state === 'provisioned' && (
              <CheckCircle size={14} style={{ color: 'var(--color-semantics-green-7)', flexShrink: 0 }} />
            )}
            {a.state === 'pending' && (
              <Loader2 size={14} className="animate-spin" style={{ color: 'var(--color-semantics-orange-7)', flexShrink: 0 }} />
            )}
            {a.state === 'failed' && (
              <ShieldAlert size={14} style={{ color: 'var(--color-semantics-red-6)', flexShrink: 0 }} />
            )}

            {onRaiseTicket && (
              <button
                onClick={() => onRaiseTicket(a.assetId)}
                className="hrms-btn-ghost"
                style={{ padding: '0.4rem 0.8rem', fontSize: 10, flexShrink: 0 }}
              >
                Raise IT ticket
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
