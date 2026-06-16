'use client';

import { useState } from 'react';
import { Target, Settings, Grid3x3, ChevronRight, BarChart2 } from 'lucide-react';
import { GoalBuilder }       from '@/components/pms/GoalBuilder';
import { AdminPMSDashboard } from '@/components/pms/AdminPMSDashboard';
import { NineBoxGrid }       from '@/components/pms/NineBoxGrid';

// ─── Tab config ────────────────────────────────────────────────────────────────

const TABS = [
  {
    id:      'goals'  as const,
    label:   'My Goals',
    icon:    Target,
    desc:    'Set and track your performance goals for the current appraisal cycle.',
  },
  {
    id:      'admin'  as const,
    label:   'Admin Panel',
    icon:    Settings,
    desc:    'Configure appraisal policies, cut-off dates, and broadcast reminders.',
  },
  {
    id:      'calibration' as const,
    label:   'Calibration Grid',
    icon:    Grid3x3,
    desc:    'Visualise team distribution on the 9-box performance vs potential matrix.',
  },
] as const;

type TabId = typeof TABS[number]['id'];

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function PMSEnginePage() {
  const [activeTab, setActiveTab] = useState<TabId>('goals');

  const currentTab = TABS.find((t) => t.id === activeTab)!;

  return (
    <div style={{ padding: '2rem', maxWidth: 1300, margin: '0 auto' }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '2rem' }}>
        <div
          style={{
            width: 44, height: 44, borderRadius: '0.9rem', flexShrink: 0,
            background: 'linear-gradient(135deg, var(--color-vr-blue-6), #783489)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(28,80,157,0.25)',
          }}
        >
          <BarChart2 size={20} color="#fff" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.15rem' }}>
            <span style={{ fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-6)', fontFamily: 'var(--font-in-rg)' }}>
              Performance
            </span>
            <ChevronRight size={12} color="var(--color-neutral-6)" />
            <span style={{ fontSize: 'var(--text-fs-12)', color: 'var(--color-vr-blue-6)', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
              PMS Engine
            </span>
          </div>
          <h1
            style={{
              margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700,
              fontSize: 'var(--text-fs-22)', color: 'var(--color-neutral-10)',
              letterSpacing: '-0.01em',
            }}
          >
            Performance Management System
          </h1>
          <p
            style={{
              margin: '0.3rem 0 0', fontSize: 'var(--text-fs-13)',
              color: 'var(--color-neutral-7)', fontFamily: 'var(--font-in-rg)',
            }}
          >
            {currentTab.desc}
          </p>
        </div>

        {/* FY badge */}
        <div
          style={{
            padding: '0.5rem 1.1rem', borderRadius: '2rem', flexShrink: 0,
            background: 'var(--color-vr-blue-1)', border: '1px solid var(--color-vr-blue-2)',
            fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 700,
            color: 'var(--color-vr-blue-8)',
          }}
        >
          FY 2026-27
        </div>
      </div>

      {/* Tab bar */}
      <div
        style={{
          display: 'flex', gap: 3,
          background: 'var(--color-neutral-3)',
          padding: 4, borderRadius: '1rem',
          marginBottom: '1.8rem',
          width: 'fit-content',
        }}
      >
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.65rem 1.4rem', borderRadius: '0.8rem', border: 'none',
                cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 140ms ease',
                background:   active ? 'var(--color-neutral-1)' : 'transparent',
                color:        active ? 'var(--color-neutral-10)' : 'var(--color-neutral-7)',
                boxShadow:    active ? 'var(--shadow-card)' : 'none',
                fontSize:     'var(--text-fs-13)',
                fontFamily:   'var(--font-in-sb)',
                fontWeight:   600,
              }}
            >
              <Icon size={14} />
              {label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'goals'       && <GoalBuilder />}
      {activeTab === 'admin'       && <AdminPMSDashboard />}
      {activeTab === 'calibration' && <NineBoxGrid />}
    </div>
  );
}
