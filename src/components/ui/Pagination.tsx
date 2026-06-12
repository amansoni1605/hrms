'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface PaginationProps {
  page:        number;          // 1-indexed
  pageSize:    number;
  totalCount:  number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, pageSize, totalCount, onPageChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const startIdx   = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIdx     = Math.min(totalCount, page * pageSize);

  // Build a compact page list with ellipses (e.g. 1 … 4 5 6 … 20)
  const range: Array<number | '…'> = [];
  const push = (v: number | '…') => { if (range[range.length - 1] !== v) range.push(v); };
  push(1);
  for (let p = page - 1; p <= page + 1; p++) {
    if (p > 1 && p < totalPages) {
      if (p > 2 && range[range.length - 1] !== p - 1) push('…');
      push(p);
    }
  }
  if (page + 1 < totalPages - 1) push('…');
  if (totalPages > 1) push(totalPages);

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '1rem', padding: '0.8rem 1.2rem',
        background: 'var(--color-neutral-2)',
        borderTop: '1px solid var(--color-stroke)',
        fontSize: 'var(--text-fs-12)',
        color: 'var(--color-neutral-7)',
      }}
    >
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>
        Showing <strong style={{ color: 'var(--color-neutral-10)' }}>{startIdx}</strong>–
        <strong style={{ color: 'var(--color-neutral-10)' }}>{endIdx}</strong> of {totalCount.toLocaleString()}
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          aria-label="Previous page"
          className="hrms-btn-ghost"
          style={{ padding: '0.4rem 0.6rem', fontSize: 10 }}
        >
          <ChevronLeft size={12} />
        </button>

        {range.map((entry, i) =>
          entry === '…' ? (
            <span key={`e${i}`} style={{ padding: '0 0.4rem', color: 'var(--color-neutral-6)' }}>…</span>
          ) : (
            <button
              key={entry}
              onClick={() => onPageChange(entry)}
              aria-current={entry === page ? 'page' : undefined}
              style={{
                minWidth: 26, padding: '0.4rem 0.6rem', borderRadius: '0.6rem',
                background: entry === page ? 'var(--color-vr-blue-6)' : 'transparent',
                color:      entry === page ? 'var(--color-neutral-1)' : 'var(--color-neutral-8)',
                border: entry === page ? 'none' : '1px solid var(--color-stroke)',
                cursor: 'pointer', fontSize: 'var(--text-fs-12)',
                fontFamily: 'var(--font-in-sb)', fontWeight: 600,
                fontVariantNumeric: 'tabular-nums',
                transition: 'background 120ms ease, color 120ms ease',
              }}
            >
              {entry}
            </button>
          ),
        )}

        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          aria-label="Next page"
          className="hrms-btn-ghost"
          style={{ padding: '0.4rem 0.6rem', fontSize: 10 }}
        >
          <ChevronRight size={12} />
        </button>
      </div>
    </div>
  );
}
