'use client';

import { useRef, useCallback, useMemo, type ReactNode } from 'react';
import { useVirtualizer }           from '@tanstack/react-virtual';
import { ChevronUp, ChevronDown, ChevronsUpDown, Loader2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';

// ─────────────────────────────────────────────────────────────────────────────
// DataGrid — high-density Jira-style virtualised table.
//
// Spec:
//   • Sticky 1-row header (`.hrms-th`)
//   • Virtualised body via @tanstack/react-virtual — tested at >10k rows
//   • Server-side pagination via fetchNextPage() when scroll within 300px of end
//   • Sortable columns (click header to toggle asc/desc)
//   • Multi-row selection with indeterminate "select all" checkbox
//   • Fixed-pin checkbox column (40px)
//   • Footer with selection count / total / DOM-node count
// ─────────────────────────────────────────────────────────────────────────────

export interface GridColumn<T> {
  key:        string;
  label:      string;
  width:      number;                    // px
  minWidth?:  number;
  sortable?:  boolean;                   // default true
  align?:     'left' | 'right' | 'center';
  render?:    (row: T) => ReactNode;
}

interface DataGridProps<T extends { _id: string }> {
  data:               T[];
  columns:            GridColumn<T>[];
  totalCount:         number;
  isLoading:          boolean;
  isFetchingNextPage: boolean;
  sortColumn:         string;
  sortDir:            'asc' | 'desc';
  onSortChange:       (col: string, dir: 'asc' | 'desc') => void;
  selectedIds:        Set<string>;
  onSelectToggle:     (id: string) => void;
  onSelectAll:        () => void;
  onRowClick?:        (row: T) => void;
  fetchNextPage?:     () => void;
  rowHeight?:         number;
  emptyMessage?:      string;
}

export function DataGrid<T extends { _id: string }>({
  data, columns, totalCount, isLoading, isFetchingNextPage,
  sortColumn, sortDir, onSortChange,
  selectedIds, onSelectToggle, onSelectAll,
  onRowClick, fetchNextPage,
  rowHeight = 44,
  emptyMessage = 'No records found',
}: DataGridProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count:            data.length,
    getScrollElement: () => scrollRef.current,
    estimateSize:     () => rowHeight,
    overscan:         20,
    measureElement:   (el) => el.getBoundingClientRect().height,
  });

  const handleScroll = useCallback(() => {
    if (!scrollRef.current || !fetchNextPage || isFetchingNextPage) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    if (scrollHeight - scrollTop - clientHeight < 300) fetchNextPage();
  }, [fetchNextPage, isFetchingNextPage]);

  const handleSort = useCallback((key: string) => {
    const dir = key === sortColumn && sortDir === 'asc' ? 'desc' : 'asc';
    onSortChange(key, dir);
  }, [sortColumn, sortDir, onSortChange]);

  const allSelected  = data.length > 0 && selectedIds.size === data.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  if (isLoading) {
    return (
      <div className="hrms-card" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '4rem',
      }}>
        <Loader2 size={20} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
      </div>
    );
  }

  return (
    <div
      className="hrms-card"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', padding: 0 }}
    >
      {/* ── Sticky Header ──────────────────────────────────────────────── */}
      <div
        style={{
          display:       'flex',
          flexShrink:    0,
          background:    'var(--color-neutral-2)',
          borderBottom:  '1px solid var(--color-stroke)',
        }}
      >
        {/* Checkbox column */}
        <div style={{ width: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => { if (el) el.indeterminate = someSelected; }}
            onChange={onSelectAll}
            style={{ accentColor: 'var(--color-vr-blue-6)', cursor: 'pointer', width: 14, height: 14 }}
          />
        </div>

        {columns.map((col) => (
          <div
            key={col.key}
            style={{
              width:     col.width,
              minWidth:  col.minWidth ?? 80,
              padding:   '1rem 1.6rem',
              cursor:    col.sortable !== false ? 'pointer' : 'default',
              display:   'flex',
              alignItems:'center',
              gap:       4,
              justifyContent: col.align === 'right' ? 'flex-end' : col.align === 'center' ? 'center' : 'flex-start',
              color:           'var(--color-neutral-7)',
              fontFamily:      'var(--font-in-sb)',
              fontSize:        'var(--text-fs-12)',
              fontWeight:      600,
              letterSpacing:   '0.04em',
              userSelect:      'none',
            }}
            onClick={() => col.sortable !== false && handleSort(col.key)}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {col.label}
            </span>
            {col.sortable !== false && (
              sortColumn === col.key
                ? sortDir === 'asc'
                  ? <ChevronUp   size={11} style={{ color: 'var(--color-vr-blue-6)' }} />
                  : <ChevronDown size={11} style={{ color: 'var(--color-vr-blue-6)' }} />
                : <ChevronsUpDown size={11} style={{ color: 'var(--color-neutral-6)' }} />
            )}
          </div>
        ))}
      </div>

      {/* ── Virtualised Body ───────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="custom-scroll"
        style={{ flex: 1, overflow: 'auto', background: 'var(--color-neutral-1)' }}
      >
        {data.length === 0 ? (
          <div style={{
            padding: '4rem 2rem', textAlign: 'center',
            color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-14)',
          }}>
            {emptyMessage}
          </div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((vRow) => {
              const row = data[vRow.index];
              if (!row) return null;
              const selected = selectedIds.has(row._id);

              return (
                <div
                  key={row._id}
                  data-index={vRow.index}
                  ref={virtualizer.measureElement}
                  onClick={() => onRowClick?.(row)}
                  style={{
                    position:    'absolute',
                    top:         0,
                    left:        0,
                    width:       '100%',
                    transform:   `translateY(${vRow.start}px)`,
                    display:     'flex',
                    alignItems:  'center',
                    borderBottom:'1px solid var(--color-neutral-4)',
                    background:  selected ? 'var(--color-vr-blue-1)' : 'transparent',
                    cursor:      onRowClick ? 'pointer' : 'default',
                    transition:  'background 80ms ease',
                  }}
                  onMouseEnter={(e) => { if (!selected) (e.currentTarget as HTMLDivElement).style.background = 'var(--color-neutral-2)'; }}
                  onMouseLeave={(e) => { if (!selected) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                >
                  {/* Checkbox cell */}
                  <div
                    style={{ width: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                    onClick={(e) => { e.stopPropagation(); onSelectToggle(row._id); }}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => onSelectToggle(row._id)}
                      style={{ accentColor: 'var(--color-vr-blue-6)', cursor: 'pointer', width: 14, height: 14 }}
                    />
                  </div>

                  {columns.map((col) => (
                    <div
                      key={col.key}
                      style={{
                        width:     col.width,
                        minWidth:  col.minWidth ?? 80,
                        padding:   '0.8rem 1.6rem',
                        color:     'var(--color-neutral-9)',
                        fontFamily:'var(--font-in-rg)',
                        fontSize:  'var(--text-fs-12)',
                        overflow:  'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        textAlign:  col.align ?? 'left',
                      }}
                    >
                      {col.render
                        ? col.render(row)
                        : String((row as Record<string, unknown>)[col.key] ?? '—')}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {isFetchingNextPage && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1.2rem', gap: '0.6rem',
            color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)',
          }}>
            <Loader2 size={12} className="animate-spin" />
            Loading more…
          </div>
        )}
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          padding:        '0.6rem 1.6rem',
          background:     'var(--color-neutral-2)',
          borderTop:      '1px solid var(--color-stroke)',
          flexShrink:     0,
          fontSize:       'var(--text-fs-12)',
          color:          'var(--color-neutral-7)',
        }}
      >
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {selectedIds.size > 0 && (
            <span style={{ color: 'var(--color-vr-blue-7)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, marginRight: 8 }}>
              {selectedIds.size} selected ·
            </span>
          )}
          {data.length.toLocaleString()} / {totalCount.toLocaleString()} rows
        </span>
        <span style={{ color: 'var(--color-neutral-6)' }}>
          {virtualizer.getVirtualItems().length} in DOM
        </span>
      </div>
    </div>
  );
}

// ── URL-native filter state hook ─────────────────────────────────────────────

export function useGridFilters<T extends Record<string, string | undefined>>(defaults: T) {
  const router = useRouter();
  const params = useSearchParams();

  const filters = useMemo((): T => {
    const r: Record<string, string | undefined> = { ...defaults };
    for (const k of Object.keys(defaults)) {
      const v = params.get(k);
      if (v !== null) r[k] = v;
    }
    return r as T;
  }, [params, defaults]);

  const setFilter = useCallback((patch: Partial<T>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (!v) next.delete(k);
      else    next.set(k, v as string);
    }
    next.set('page', '1');
    router.push(`?${next.toString()}`, { scroll: false });
  }, [router, params]);

  const reset = useCallback(() => router.push('?', { scroll: false }), [router]);
  return { filters, setFilter, reset };
}
