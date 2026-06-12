'use client';

// Initials avatar with deterministic color from a string hash.

export interface AvatarProps {
  name:     string;
  size?:    'xs' | 'sm' | 'md' | 'lg';
  src?:     string;
  status?:  'online' | 'away' | 'offline';
}

const SIZE_PX: Record<NonNullable<AvatarProps['size']>, number> = {
  xs: 20, sm: 28, md: 36, lg: 48,
};

const SIZE_FONT: Record<NonNullable<AvatarProps['size']>, string> = {
  xs: '0.9rem', sm: '1.1rem', md: '1.3rem', lg: '1.6rem',
};

// Deterministic accent palette drawn from design-system tokens.
const PALETTE = [
  { bg: '#E8EEF5', fg: '#1C509D' },   // VR Blue
  { bg: '#E7F6ED', fg: '#0E883F' },   // Green
  { bg: '#FFF6E6', fg: '#D98C00' },   // Orange
  { bg: '#F6EDF9', fg: '#783489' },   // Purple
  { bg: '#E5F4FF', fg: '#3759BF' },   // Aqua
  { bg: '#FDE6E6', fg: '#A90000' },   // Red
];

function pickPalette(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

const STATUS_DOT_COLOR: Record<NonNullable<AvatarProps['status']>, string> = {
  online:  'var(--color-semantics-green-6)',
  away:    'var(--color-semantics-orange-6)',
  offline: 'var(--color-neutral-6)',
};

export function Avatar({ name, size = 'md', src, status }: AvatarProps) {
  const px      = SIZE_PX[size];
  const font    = SIZE_FONT[size];
  const palette = pickPalette(name);

  return (
    <div style={{ position: 'relative', width: px, height: px, flexShrink: 0 }}>
      <div
        title={name}
        style={{
          width: px, height: px, borderRadius: '50%',
          background: src ? 'transparent' : palette.bg,
          color: palette.fg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-jk-bd)', fontWeight: 700,
          fontSize: font,
          overflow: 'hidden',
          border: '1px solid var(--color-stroke)',
        }}
      >
        {src
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={src} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span>{initials(name)}</span>}
      </div>
      {status && (
        <span
          aria-label={status}
          style={{
            position: 'absolute', bottom: 0, right: 0,
            width: Math.max(8, px * 0.25), height: Math.max(8, px * 0.25),
            borderRadius: '50%',
            background: STATUS_DOT_COLOR[status],
            border: '2px solid var(--color-neutral-1)',
          }}
        />
      )}
    </div>
  );
}
