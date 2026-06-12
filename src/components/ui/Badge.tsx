'use client';

import { type ReactNode } from 'react';

// ── Token-anchored variants ──────────────────────────────────────────────────
// All colours trace back to globals.css design-system tokens.
// ─────────────────────────────────────────────────────────────────────────────

export type BadgeVariant =
  | 'success' | 'warning' | 'danger' | 'info' | 'neutral'
  | 'purple'  | 'cyan'    | 'default';

const VARIANT_CLASS: Record<BadgeVariant, string> = {
  success: 'hrms-badge hrms-badge--success',
  warning: 'hrms-badge hrms-badge--warning',
  danger:  'hrms-badge hrms-badge--danger',
  info:    'hrms-badge hrms-badge--info',
  neutral: 'hrms-badge hrms-badge--neutral',
  default: 'hrms-badge hrms-badge--neutral',
  purple:  'hrms-badge',
  cyan:    'hrms-badge',
};

// Purple + Cyan sit outside the standard semantic palette so we render inline
const VARIANT_INLINE: Partial<Record<BadgeVariant, React.CSSProperties>> = {
  purple: { color: '#783489', backgroundColor: '#F6EDF9' },   // fund-advisor-8 / -1
  cyan:   { color: '#537791', backgroundColor: '#E5F4FF' },   // semantics-aqua
};

const DOT_COLOR: Record<BadgeVariant, string> = {
  success: 'var(--color-semantics-green-7)',
  warning: 'var(--color-semantics-orange-7)',
  danger:  'var(--color-semantics-red-6)',
  info:    'var(--color-semantics-blue-7)',
  neutral: 'var(--color-neutral-8)',
  default: 'var(--color-neutral-8)',
  purple:  '#783489',
  cyan:    '#537791',
};

function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }}
    />
  );
}

export interface BadgeProps {
  variant?:   BadgeVariant;
  dot?:       boolean;
  children:   ReactNode;
  className?: string;
}

export function Badge({ variant = 'neutral', dot = false, children, className = '' }: BadgeProps) {
  return (
    <span
      className={`${VARIANT_CLASS[variant]} ${className}`.trim()}
      style={VARIANT_INLINE[variant]}
    >
      {dot && <Dot color={DOT_COLOR[variant]} />}
      {children}
    </span>
  );
}

// ── StatusBadge — maps domain enum strings to the right variant ──────────────

const STATUS_MAP: Record<string, { variant: BadgeVariant; label: string; dot?: boolean }> = {
  active:         { variant: 'success', label: 'Active',        dot: true  },
  on_leave:       { variant: 'warning', label: 'On leave'                  },
  pre_hire:       { variant: 'info',    label: 'Pre-hire'                  },
  probation:      { variant: 'warning', label: 'Probation'                 },
  pip:            { variant: 'danger',  label: 'PIP'                       },
  suspended:      { variant: 'danger',  label: 'Suspended'                 },
  terminated:     { variant: 'neutral', label: 'Terminated'                },
  retired:        { variant: 'neutral', label: 'Retired'                   },
  pending:          { variant: 'warning', label: 'Pending',        dot: true  },
  pending_manager:  { variant: 'warning', label: 'Mgr Pending',    dot: true  },
  pending_hr:       { variant: 'info',    label: 'HR Pending',     dot: true  },
  approved:         { variant: 'success', label: 'Approved'                   },
  rejected:         { variant: 'danger',  label: 'Rejected'                   },
  cancelled:        { variant: 'neutral', label: 'Cancelled'                  },
  draft:                { variant: 'neutral', label: 'Draft'                   },
  agentic_audit_queued: { variant: 'info',    label: 'Audit queued'            },
  audit_passed:         { variant: 'success', label: 'Audit passed'            },
  audit_failed:         { variant: 'danger',  label: 'Audit failed'            },
  processing:           { variant: 'info',    label: 'Processing',  dot: true  },
  paid:                 { variant: 'success', label: 'Paid'                    },
  reversed:             { variant: 'warning', label: 'Reversed'                },
  synced:         { variant: 'success', label: 'Synced'                   },
  syncing:        { variant: 'info',    label: 'Syncing',     dot: true  },
  disabled:       { variant: 'neutral', label: 'Disabled'                 },
  not_configured: { variant: 'neutral', label: 'Not set up'               },
  failed:         { variant: 'danger',  label: 'Failed'                   },
  trusted:        { variant: 'success', label: 'Trusted'                  },
  conditional:    { variant: 'warning', label: 'Conditional'              },
  non_compliant:  { variant: 'danger',  label: 'Non-compliant', dot: true },
  revoked:        { variant: 'danger',  label: 'Revoked'                  },
  unknown:        { variant: 'neutral', label: 'Unknown'                  },
  safe:           { variant: 'success', label: 'Safe'                     },
  watch:          { variant: 'info',    label: 'Watch'                    },
  at_risk:        { variant: 'warning', label: 'At risk'                  },
  triggered:      { variant: 'danger',  label: 'Triggered'                },
  // PMS — performance review lifecycle
  self_assessment:{ variant: 'info',    label: 'Self-assessment', dot: true },
  manager_review: { variant: 'warning', label: 'Manager review',  dot: true },
  finalized:      { variant: 'success', label: 'Finalized'                },
  acknowledged:   { variant: 'success', label: 'Acknowledged'             },
  not_started:    { variant: 'neutral', label: 'Not started'              },
  in_progress:    { variant: 'info',    label: 'In progress'              },
  achieved:       { variant: 'success', label: 'Achieved'                 },
  missed:         { variant: 'danger',  label: 'Missed'                   },
  // PMS — compensation decision
  accepted:       { variant: 'success', label: 'Accepted'                 },
};

export function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_MAP[status] ?? {
    variant: 'neutral' as BadgeVariant,
    label:   status.replace(/_/g, ' '),
    dot:     false,
  };
  return <Badge variant={cfg.variant} dot={cfg.dot}>{cfg.label}</Badge>;
}
