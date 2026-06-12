'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Bell, X, CheckCheck, Loader2, ExternalLink,
  AlertTriangle, CheckCircle, Info, DollarSign,
  Calendar, Shield, Globe, TrendingUp,
} from 'lucide-react';
import { formatRelativeTime } from '@/lib/format';

// ─────────────────────────────────────────────────────────────────────────────
// NotificationDrawer — right-slide notification inbox.
// Polls every 30 seconds for unread count.  Opens as a side panel.
// ─────────────────────────────────────────────────────────────────────────────

interface InAppNotif {
  _id:       string;
  type:      string;
  title:     string;
  body?:     string;
  actionUrl?: string;
  isRead:    boolean;
  priority:  'low' | 'normal' | 'high' | 'critical';
  createdAt: string;
}

const TYPE_ICON: Record<string, React.ElementType> = {
  leave_approved:    CheckCircle,
  leave_rejected:    AlertTriangle,
  leave_request:     Calendar,
  payroll_ready:     DollarSign,
  payroll_approved:  DollarSign,
  payroll_reversed:  AlertTriangle,
  device_warning:    Shield,
  access_revoked:    Shield,
  liveness_required: Shield,
  visa_expiry:       Globe,
  immigration_alert: Globe,
  equity_vest:       TrendingUp,
  equity_exercise:   TrendingUp,
  system_message:    Info,
  announcement:      Info,
  task_assigned:     CheckCircle,
};

const TYPE_COLOR: Record<string, string> = {
  leave_approved:    'var(--color-semantics-green-7)',
  leave_rejected:    'var(--color-semantics-red-6)',
  payroll_reversed:  'var(--color-semantics-red-6)',
  device_warning:    'var(--color-semantics-orange-7)',
  access_revoked:    'var(--color-semantics-red-6)',
  liveness_required: 'var(--color-semantics-orange-7)',
  visa_expiry:       'var(--color-semantics-orange-7)',
  immigration_alert: 'var(--color-semantics-orange-7)',
  equity_vest:       'var(--color-semantics-green-7)',
};

const PRIORITY_DOT: Record<string, string> = {
  critical: 'var(--color-semantics-red-6)',
  high:     'var(--color-semantics-orange-7)',
  normal:   'var(--color-vr-blue-6)',
  low:      'var(--color-neutral-6)',
};

// ── Bell button with badge ───────────────────────────────────────────────────

interface NotificationBellProps {
  onClick: () => void;
}

export function NotificationBell({ onClick }: NotificationBellProps) {
  const [unread, setUnread] = useState(0);

  const poll = useCallback(() => {
    fetch('/api/notifications?unreadOnly=true&limit=1')
      .then((r) => r.json())
      .then((d) => setUnread(d.unreadCount ?? 0))
      .catch(() => null);
  }, []);

  useEffect(() => {
    poll();
    const id = setInterval(poll, 30_000);
    return () => clearInterval(id);
  }, [poll]);

  return (
    <button
      onClick={onClick}
      aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}
      style={{
        position: 'relative', padding: 8, borderRadius: '0.6rem',
        background: 'transparent', border: 'none', cursor: 'pointer',
        color: 'var(--color-neutral-7)',
        transition: 'background 120ms ease',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-neutral-3)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <Bell size={16} />
      {unread > 0 && (
        <span
          style={{
            position: 'absolute', top: 5, right: 5,
            minWidth: unread > 9 ? 16 : 14, height: 14,
            borderRadius: 99, padding: '0 3px',
            background: 'var(--color-semantics-red-6)',
            color: 'var(--color-neutral-1)',
            fontSize: 9, fontFamily: 'var(--font-in-sb)', fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            lineHeight: 1,
            border: '1.5px solid var(--color-neutral-1)',
          }}
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  );
}

// ── Drawer ───────────────────────────────────────────────────────────────────

interface NotificationDrawerProps {
  open:    boolean;
  onClose: () => void;
}

export function NotificationDrawer({ open, onClose }: NotificationDrawerProps) {
  const [items,   setItems]   = useState<InAppNotif[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter,  setFilter]  = useState<'all' | 'unread'>('all');
  const unreadCount = items.filter((n) => !n.isRead).length;

  const load = useCallback(async () => {
    setLoading(true);
    const qs = filter === 'unread' ? '?unreadOnly=true&limit=30' : '?limit=30';
    const res  = await fetch(`/api/notifications${qs}`);
    const json = await res.json();
    setItems(json.data ?? []);
    setLoading(false);
  }, [filter]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const markRead = async (id: string) => {
    setItems((prev) => prev.map((n) => n._id === id ? { ...n, isRead: true } : n));
    await fetch(`/api/notifications/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isRead: true }),
    });
  };

  const markAllRead = async () => {
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    await fetch('/api/notifications/mark-all-read', { method: 'POST' });
  };

  const dismiss = async (id: string) => {
    setItems((prev) => prev.filter((n) => n._id !== id));
    await fetch(`/api/notifications/${id}`, { method: 'DELETE' });
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', justifyContent: 'flex-end' }}>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(33,36,39,0.35)',
          backdropFilter: 'blur(2px)',
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'relative', width: 400, height: '100vh',
        background: 'var(--color-neutral-1)',
        borderLeft: '1px solid var(--color-stroke)',
        display: 'flex', flexDirection: 'column',
        boxShadow: '-4px 0 20px rgba(0,0,0,0.08)',
        animation: 'slideInRight 180ms cubic-bezier(0.16,1,0.3,1)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.8rem',
          padding: '1.2rem 1.4rem',
          borderBottom: '1px solid var(--color-stroke)',
          flexShrink: 0,
        }}>
          <Bell size={16} style={{ color: 'var(--color-vr-blue-6)' }} />
          <h2 style={{
            margin: 0, flex: 1,
            color: 'var(--color-neutral-10)',
            fontFamily: 'var(--font-jk-bd)', fontWeight: 700,
            fontSize: 'var(--text-fs-16)',
          }}>
            Notifications
          </h2>
          {unreadCount > 0 && (
            <span style={{
              padding: '0.2rem 0.6rem', borderRadius: 99,
              background: 'var(--color-semantics-red-1)',
              color: 'var(--color-semantics-red-6)',
              fontSize: 10, fontFamily: 'var(--font-in-sb)', fontWeight: 700,
            }}>
              {unreadCount} unread
            </span>
          )}
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--color-neutral-7)', padding: 4,
          }}>
            <X size={15} />
          </button>
        </div>

        {/* Toolbar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.6rem',
          padding: '0.8rem 1.4rem',
          borderBottom: '1px solid var(--color-stroke)',
          background: 'var(--color-neutral-2)',
          flexShrink: 0,
        }}>
          {(['all', 'unread'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '0.3rem 0.8rem', borderRadius: '0.6rem',
                background: filter === f ? 'var(--color-vr-blue-6)' : 'transparent',
                color: filter === f ? 'var(--color-neutral-1)' : 'var(--color-neutral-7)',
                border: filter === f ? 'none' : '1px solid var(--color-stroke)',
                cursor: 'pointer', fontSize: 'var(--text-fs-12)',
                fontFamily: 'var(--font-in-sb)', fontWeight: 600,
                textTransform: 'capitalize',
                transition: 'all 120ms ease',
              }}
            >
              {f}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--color-vr-blue-6)',
                fontSize: 'var(--text-fs-12)',
                fontFamily: 'var(--font-in-sb)', fontWeight: 600,
              }}
            >
              <CheckCheck size={13} />
              Mark all read
            </button>
          )}
        </div>

        {/* List */}
        <div className="custom-scroll" style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
              <Loader2 size={18} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
            </div>
          ) : items.length === 0 ? (
            <div style={{ padding: '3rem 2rem', textAlign: 'center' }}>
              <Bell size={32} style={{ color: 'var(--color-neutral-5)', margin: '0 auto 1rem', display: 'block' }} />
              <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-14)' }}>
                {filter === 'unread' ? 'All caught up!' : 'No notifications yet'}
              </p>
              <p style={{ margin: '0.4rem 0 0', color: 'var(--color-neutral-6)', fontSize: 'var(--text-fs-12)' }}>
                {filter === 'unread' ? 'No unread notifications.' : 'System notifications will appear here.'}
              </p>
            </div>
          ) : (
            items.map((n) => {
              const Icon  = TYPE_ICON[n.type] ?? Bell;
              const color = TYPE_COLOR[n.type] ?? 'var(--color-vr-blue-6)';
              return (
                <div
                  key={n._id}
                  onClick={() => { if (!n.isRead) markRead(n._id); }}
                  style={{
                    display: 'flex', gap: '0.8rem',
                    padding: '0.8rem 1.2rem',
                    borderBottom: '1px solid var(--color-neutral-4)',
                    background: n.isRead ? 'transparent' : 'var(--color-vr-blue-1)',
                    cursor: n.isRead ? 'default' : 'pointer',
                    transition: 'background 80ms ease',
                    position: 'relative',
                  }}
                >
                  {/* Priority dot */}
                  {!n.isRead && (
                    <div style={{
                      position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)',
                      width: 6, height: 6, borderRadius: '50%',
                      background: PRIORITY_DOT[n.priority] ?? 'var(--color-vr-blue-6)',
                    }} />
                  )}

                  {/* Icon */}
                  <div style={{
                    width: 34, height: 34, borderRadius: '0.6rem',
                    background: n.isRead ? 'var(--color-neutral-3)' : 'var(--color-vr-blue-1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <Icon size={15} style={{ color }} />
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      margin: 0, fontSize: 'var(--text-fs-12)',
                      fontFamily: n.isRead ? 'var(--font-in-rg)' : 'var(--font-in-sb)',
                      fontWeight: n.isRead ? 400 : 600,
                      color: 'var(--color-neutral-10)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {n.title}
                    </p>
                    {n.body && (
                      <p style={{
                        margin: '0.2rem 0 0', fontSize: 11,
                        color: 'var(--color-neutral-7)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {n.body}
                      </p>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: '0.3rem' }}>
                      <span style={{ color: 'var(--color-neutral-6)', fontSize: 10 }}>
                        {formatRelativeTime(n.createdAt)}
                      </span>
                      {n.actionUrl && (
                        <a href={n.actionUrl} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                          color: 'var(--color-vr-blue-6)', fontSize: 10,
                          fontFamily: 'var(--font-in-sb)', fontWeight: 600,
                          textDecoration: 'none',
                        }}
                        onClick={(e) => e.stopPropagation()}>
                          View <ExternalLink size={9} />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Dismiss */}
                  <button
                    onClick={(e) => { e.stopPropagation(); dismiss(n._id); }}
                    aria-label="Dismiss"
                    style={{
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      color: 'var(--color-neutral-5)', padding: 2, flexShrink: 0,
                      alignSelf: 'flex-start', marginTop: 4,
                    }}
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(40px); opacity: 0; }
          to   { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
