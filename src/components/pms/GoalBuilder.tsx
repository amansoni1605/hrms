'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  Plus, Trash2, Edit2, X, Save, CheckCircle2, AlertTriangle,
  DollarSign, Users, Settings2, BookOpen, ChevronDown, ChevronUp,
  Info, Target, Loader2,
} from 'lucide-react';
import {
  type GoalSchema, type GoalPerspective, type GoalStatus,
  PERSPECTIVE_THRESHOLDS,
} from './types';

// ─── Constants ─────────────────────────────────────────────────────────────────

const PERSPECTIVES: GoalPerspective[] = [
  'Financial', 'Customer', 'Operational', 'Learning & Growth',
];

type PerspectiveMeta = {
  color:       string;
  light:       string;
  border:      string;
  icon:        React.ElementType;
  description: string;
};

const P_META: Record<GoalPerspective, PerspectiveMeta> = {
  Financial: {
    color: '#1C509D', light: '#EBF0F9', border: '#B9C9E1',
    icon: DollarSign,
    description: 'Revenue, cost reduction, EBITDA & profitability targets',
  },
  Customer: {
    color: '#0F7B6C', light: '#E7F6ED', border: '#99D6B1',
    icon: Users,
    description: 'CSAT, NPS, retention and account-growth objectives',
  },
  Operational: {
    color: '#B45309', light: '#FEF3C7', border: '#FCD34D',
    icon: Settings2,
    description: 'Process efficiency, delivery quality and SLA adherence',
  },
  'Learning & Growth': {
    color: '#7C3AED', light: '#F3E8FF', border: '#C4B5FD',
    icon: BookOpen,
    description: 'Skills development, certifications and team capability',
  },
};

const UOM_OPTIONS = [
  'Number', '%', 'INR (₹)', 'USD ($)', 'Score (1–5)',
  'Score (1–10)', 'NPS', 'Days', 'Hours', 'Units', 'Rating',
];

const SEED_GOALS: GoalSchema[] = [
  {
    id: 'g1', perspective: 'Financial',
    goalName: 'Achieve Quarterly ARR Target',
    measureOfPerformance: 'Annual Recurring Revenue (ARR)',
    description: 'Drive new contract closures and expand existing accounts to hit the Q2 ARR milestone.',
    unitOfMeasurement: 'INR (₹)', target: '5,00,00,000',
    weightage: 25, status: 'approved',
  },
  {
    id: 'g2', perspective: 'Customer',
    goalName: 'Improve NPS to 72+',
    measureOfPerformance: 'Net Promoter Score (quarterly survey)',
    description: 'Reduce detractors through proactive support escalations and quarterly business reviews.',
    unitOfMeasurement: 'NPS', target: '72',
    weightage: 20, status: 'approved',
  },
  {
    id: 'g3', perspective: 'Operational',
    goalName: 'Reduce P1 SLA Breach Rate',
    measureOfPerformance: 'P1 tickets breaching 4-hour SLA / total P1 tickets',
    description: '',
    unitOfMeasurement: '%', target: '< 5%',
    weightage: 20, status: 'pending_approval',
  },
  {
    id: 'g4', perspective: 'Learning & Growth',
    goalName: 'Complete AWS Solutions Architect Cert',
    measureOfPerformance: 'Certification status',
    description: 'Earn AWS-SAA-C03 by end of Q3 to unblock cloud migration project.',
    unitOfMeasurement: 'Number', target: '1',
    weightage: 15, status: 'draft',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function genId(): string {
  return `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function grandTotal(goals: GoalSchema[]): number {
  return goals.reduce((s, g) => s + (g.weightage || 0), 0);
}

function perspectiveTotal(goals: GoalSchema[], p: GoalPerspective): number {
  return goals.filter((g) => g.perspective === p).reduce((s, g) => s + (g.weightage || 0), 0);
}

function emptyGoal(perspective: GoalPerspective): GoalSchema {
  return {
    id: genId(), perspective,
    goalName: '', measureOfPerformance: '', description: '',
    unitOfMeasurement: 'Number', target: '',
    weightage: 0, status: 'draft',
  };
}

const STATUS_CHIP: Record<GoalStatus, { bg: string; color: string; label: string }> = {
  draft:            { bg: '#F3F4F6', color: '#6B7280', label: 'Draft'           },
  pending_approval: { bg: '#FEF3C7', color: '#B45309', label: 'Pending Approval'},
  approved:         { bg: '#D1FAE5', color: '#065F46', label: 'Approved'        },
  rejected:         { bg: '#FEE2E2', color: '#991B1B', label: 'Rejected'        },
};

// ─── WeightageBar ─────────────────────────────────────────────────────────────

function WeightageBar({ goals }: { goals: GoalSchema[] }) {
  const total  = grandTotal(goals);
  const isOk   = total === 100;
  const isOver = total > 100;

  return (
    <div
      className="hrms-card"
      style={{ padding: '1.4rem 1.8rem', marginBottom: '1.6rem' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div>
          <p style={{ margin: 0, fontSize: 'var(--text-fs-13)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-8)' }}>
            Total Weightage Allocation
          </p>
          <p style={{ margin: '0.2rem 0 0', fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-7)' }}>
            Grand total across all perspectives must equal exactly 100%.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span
            style={{
              fontSize: 'var(--text-fs-28)', fontFamily: 'var(--font-jk-bd)', fontWeight: 700,
              color: isOver ? '#DC2626' : isOk ? '#065F46' : 'var(--color-neutral-10)',
            }}
          >
            {total}%
          </span>
          {isOk   && <CheckCircle2 size={20} color="#065F46" />}
          {isOver && <AlertTriangle size={20} color="#DC2626" />}
          {!isOk && !isOver && (
            <span style={{ fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-6)', fontFamily: 'var(--font-in-rg)' }}>
              / 100%
            </span>
          )}
        </div>
      </div>

      {/* Stacked bar */}
      <div
        style={{
          height: 12, borderRadius: 9999,
          background: 'var(--color-neutral-4)',
          overflow: 'hidden', display: 'flex',
        }}
      >
        {PERSPECTIVES.map((p) => {
          const w = perspectiveTotal(goals, p);
          if (!w) return null;
          return (
            <div
              key={p}
              title={`${p}: ${w}%`}
              style={{
                width: `${Math.min(w, 100)}%`,
                background: P_META[p].color,
                transition: 'width 300ms ease',
                opacity: 0.85,
              }}
            />
          );
        })}
        {total < 100 && (
          <div style={{ flex: 1, background: 'var(--color-neutral-4)' }} />
        )}
      </div>

      {/* Per-perspective legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.2rem', marginTop: '0.9rem' }}>
        {PERSPECTIVES.map((p) => {
          const w   = perspectiveTotal(goals, p);
          const cfg = PERSPECTIVE_THRESHOLDS[p];
          const ok  = w >= cfg.minWeight && w <= cfg.maxWeight;
          return (
            <div key={p} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div
                style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: P_META[p].color, flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: P_META[p].color }}>
                {p}
              </span>
              <span style={{ fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-7)' }}>
                {w}%
              </span>
              <span style={{
                fontSize: 10, fontFamily: 'var(--font-in-sb)', fontWeight: 600,
                padding: '1px 6px', borderRadius: 99,
                background: ok ? '#D1FAE5' : w === 0 ? 'var(--color-neutral-4)' : '#FEE2E2',
                color: ok ? '#065F46' : w === 0 ? 'var(--color-neutral-7)' : '#991B1B',
              }}>
                {cfg.minWeight}–{cfg.maxWeight}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── GoalFormPanel ─────────────────────────────────────────────────────────────

interface GoalFormPanelProps {
  initial:      GoalSchema;
  perspective:  GoalPerspective;
  allGoals:     GoalSchema[];
  onSave:       (g: GoalSchema) => void;
  onCancel:     () => void;
}

type FormErrors = Partial<Record<keyof GoalSchema | '_perspective', string>>;

function GoalFormPanel({ initial, perspective, allGoals, onSave, onCancel }: GoalFormPanelProps) {
  const [form, setForm]     = useState<GoalSchema>({ ...initial });
  const [errors, setErrors] = useState<FormErrors>({});

  const meta = P_META[perspective];

  // Budget remaining = 100 - (all other goals' total)
  const otherTotal = useMemo(
    () => allGoals.filter((g) => g.id !== form.id).reduce((s, g) => s + (g.weightage || 0), 0),
    [allGoals, form.id],
  );
  const remainingBudget = 100 - otherTotal;

  // Current perspective total excluding this goal
  const otherPerspectiveTotal = useMemo(
    () =>
      allGoals
        .filter((g) => g.id !== form.id && g.perspective === perspective)
        .reduce((s, g) => s + (g.weightage || 0), 0),
    [allGoals, form.id, perspective],
  );

  const setField = <K extends keyof GoalSchema>(k: K, v: GoalSchema[K]) => {
    setForm((prev) => ({ ...prev, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const validateAndSave = () => {
    const errs: FormErrors = {};
    if (!form.goalName.trim())             errs.goalName = 'Goal name is required.';
    if (!form.measureOfPerformance.trim()) errs.measureOfPerformance = 'MoP is required.';
    if (!form.target.trim())               errs.target = 'Target value is required.';

    if (!form.weightage || form.weightage <= 0) {
      errs.weightage = 'Weightage must be greater than 0.';
    } else if (form.weightage > remainingBudget) {
      errs.weightage = `Only ${remainingBudget}% remaining in the 100% budget.`;
    } else {
      const cfg = PERSPECTIVE_THRESHOLDS[perspective];
      const newPTotal = otherPerspectiveTotal + form.weightage;
      if (newPTotal < cfg.minWeight) {
        errs._perspective = `${perspective} total (${newPTotal}%) is below the minimum ${cfg.minWeight}%.`;
      } else if (newPTotal > cfg.maxWeight) {
        errs._perspective = `${perspective} total (${newPTotal}%) exceeds the maximum ${cfg.maxWeight}%.`;
      }
    }

    setErrors(errs);
    if (Object.keys(errs).length === 0) onSave(form);
  };

  const inp: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    padding: '0.8rem 1rem', borderRadius: '0.7rem',
    border: '1.5px solid var(--color-stroke)',
    background: '#fff', fontSize: 'var(--text-fs-13)',
    color: 'var(--color-neutral-10)', outline: 'none',
    fontFamily: 'var(--font-in-rg)', transition: 'border-color 150ms',
  };

  const inpErr: React.CSSProperties = { ...inp, borderColor: '#DC2626' };

  const lbl: React.CSSProperties = {
    display: 'block', marginBottom: 4,
    fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)',
    fontWeight: 600, color: 'var(--color-neutral-8)',
  };

  const errTxt: React.CSSProperties = {
    marginTop: 3, fontSize: 'var(--text-fs-11)',
    color: '#DC2626', fontFamily: 'var(--font-in-rg)',
  };

  return (
    <div
      style={{
        marginTop: '0.8rem', padding: '1.4rem',
        border: `1.5px solid ${meta.color}40`,
        borderRadius: '0.9rem', background: meta.light,
      }}
    >
      <p style={{ margin: '0 0 1.2rem', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-14)', color: meta.color }}>
        {initial.goalName ? 'Edit Goal' : `New ${perspective} Goal`}
      </p>

      {errors._perspective && (
        <div style={{ display: 'flex', gap: '0.5rem', padding: '0.7rem 1rem', marginBottom: '1rem', borderRadius: '0.7rem', background: '#FEE2E2', border: '1px solid #FECACA', fontSize: 'var(--text-fs-12)', color: '#991B1B' }}>
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          {errors._perspective}
        </div>
      )}

      {/* Row 1 — Name + Weightage */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 128px', gap: '0.8rem', marginBottom: '0.8rem' }}>
        <div>
          <label style={lbl}>Goal Name *</label>
          <input
            style={errors.goalName ? inpErr : inp}
            value={form.goalName}
            placeholder="e.g. Achieve ₹5 Cr ARR"
            onChange={(e) => setField('goalName', e.target.value)}
            onFocus={(e) => (e.target.style.borderColor = meta.color)}
            onBlur={(e)  => (e.target.style.borderColor = errors.goalName ? '#DC2626' : 'var(--color-stroke)')}
          />
          {errors.goalName && <p style={errTxt}>{errors.goalName}</p>}
        </div>
        <div>
          <label style={lbl}>
            Weightage (%) *
            <span style={{ fontSize: 10, fontFamily: 'var(--font-in-rg)', fontWeight: 400, color: 'var(--color-neutral-6)', marginLeft: 6 }}>
              max {remainingBudget}%
            </span>
          </label>
          <input
            type="number" min={1} max={remainingBudget}
            style={errors.weightage ? inpErr : inp}
            value={form.weightage || ''}
            placeholder="e.g. 20"
            onChange={(e) => setField('weightage', parseFloat(e.target.value) || 0)}
            onFocus={(e) => (e.target.style.borderColor = meta.color)}
            onBlur={(e)  => (e.target.style.borderColor = errors.weightage ? '#DC2626' : 'var(--color-stroke)')}
          />
          {errors.weightage && <p style={errTxt}>{errors.weightage}</p>}
        </div>
      </div>

      {/* Row 2 — MoP + UoM + Target */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 148px 148px', gap: '0.8rem', marginBottom: '0.8rem' }}>
        <div>
          <label style={lbl}>Measure of Performance (MoP) *</label>
          <input
            style={errors.measureOfPerformance ? inpErr : inp}
            value={form.measureOfPerformance}
            placeholder="e.g. Monthly recurring revenue"
            onChange={(e) => setField('measureOfPerformance', e.target.value)}
            onFocus={(e) => (e.target.style.borderColor = meta.color)}
            onBlur={(e)  => (e.target.style.borderColor = errors.measureOfPerformance ? '#DC2626' : 'var(--color-stroke)')}
          />
          {errors.measureOfPerformance && <p style={errTxt}>{errors.measureOfPerformance}</p>}
        </div>
        <div>
          <label style={lbl}>Unit (UoM)</label>
          <select
            style={inp}
            value={form.unitOfMeasurement}
            onChange={(e) => setField('unitOfMeasurement', e.target.value)}
            onFocus={(e) => (e.target.style.borderColor = meta.color)}
            onBlur={(e)  => (e.target.style.borderColor = 'var(--color-stroke)')}
          >
            {UOM_OPTIONS.map((u) => <option key={u}>{u}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Target *</label>
          <input
            style={errors.target ? inpErr : inp}
            value={form.target}
            placeholder="e.g. 5,00,00,000"
            onChange={(e) => setField('target', e.target.value)}
            onFocus={(e) => (e.target.style.borderColor = meta.color)}
            onBlur={(e)  => (e.target.style.borderColor = errors.target ? '#DC2626' : 'var(--color-stroke)')}
          />
          {errors.target && <p style={errTxt}>{errors.target}</p>}
        </div>
      </div>

      {/* Row 3 — Description */}
      <div style={{ marginBottom: '1.1rem' }}>
        <label style={lbl}>Description</label>
        <textarea
          style={{ ...inp, resize: 'vertical', minHeight: 64 }}
          value={form.description}
          placeholder="Additional context, milestones, or dependencies…"
          onChange={(e) => setField('description', e.target.value)}
          onFocus={(e) => (e.target.style.borderColor = meta.color)}
          onBlur={(e)  => (e.target.style.borderColor = 'var(--color-stroke)')}
        />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '0.6rem 1.1rem', borderRadius: '0.7rem',
            border: '1.5px solid var(--color-stroke)', background: '#fff',
            fontSize: 'var(--text-fs-13)', cursor: 'pointer',
            fontFamily: 'var(--font-in-sb)', fontWeight: 600,
            color: 'var(--color-neutral-8)',
          }}
        >
          <X size={13} /> Cancel
        </button>
        <button
          onClick={validateAndSave}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '0.6rem 1.3rem', borderRadius: '0.7rem',
            border: 'none', background: meta.color,
            fontSize: 'var(--text-fs-13)', cursor: 'pointer',
            fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: '#fff',
          }}
        >
          <Save size={13} /> Save Goal
        </button>
      </div>
    </div>
  );
}

// ─── PerspectiveCard ──────────────────────────────────────────────────────────

interface PerspectiveCardProps {
  perspective: GoalPerspective;
  goals:       GoalSchema[];
  allGoals:    GoalSchema[];
  editingId:   string | null;
  addingTo:    GoalPerspective | null;
  onAddGoal:   (p: GoalPerspective) => void;
  onEdit:      (id: string) => void;
  onDelete:    (id: string) => void;
  onSave:      (g: GoalSchema) => void;
  onCancel:    () => void;
  collapsed:   boolean;
  onToggle:    () => void;
}

function PerspectiveCard({
  perspective, goals, allGoals, editingId, addingTo,
  onAddGoal, onEdit, onDelete, onSave, onCancel, collapsed, onToggle,
}: PerspectiveCardProps) {
  const meta       = P_META[perspective];
  const Icon       = meta.icon;
  const cfg        = PERSPECTIVE_THRESHOLDS[perspective];
  const pTotal     = perspectiveTotal(allGoals, perspective);
  const inRange    = goals.length > 0 && pTotal >= cfg.minWeight && pTotal <= cfg.maxWeight;
  const outOfRange = goals.length > 0 && (pTotal < cfg.minWeight || pTotal > cfg.maxWeight);
  const isAdding   = addingTo === perspective;

  return (
    <div
      className="hrms-card"
      style={{
        padding: 0, overflow: 'hidden', marginBottom: '1.2rem',
        border: outOfRange ? `1.5px solid #FCA5A5` : `1px solid var(--color-stroke)`,
      }}
    >
      {/* Card header */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: '0.9rem',
          padding: '1.1rem 1.6rem',
          background: `linear-gradient(135deg, ${meta.light}, #fff)`,
          borderBottom: collapsed ? 'none' : `1px solid ${meta.border}40`,
          cursor: 'pointer',
        }}
        onClick={onToggle}
      >
        <div
          style={{
            width: 36, height: 36, borderRadius: '0.7rem', flexShrink: 0,
            background: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Icon size={16} color="#fff" />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <h3
              style={{
                margin: 0, fontSize: 'var(--text-fs-14)', fontFamily: 'var(--font-jk-bd)',
                fontWeight: 700, color: 'var(--color-neutral-10)',
              }}
            >
              {perspective}
            </h3>
            {inRange && (
              <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: '#D1FAE5', color: '#065F46', fontFamily: 'var(--font-in-sb)', fontWeight: 700 }}>
                ✓ In range
              </span>
            )}
            {outOfRange && (
              <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: '#FEE2E2', color: '#991B1B', fontFamily: 'var(--font-in-sb)', fontWeight: 700 }}>
                ⚠ Out of range
              </span>
            )}
          </div>
          <p style={{ margin: 0, fontSize: 'var(--text-fs-11)', color: 'var(--color-neutral-7)' }}>
            {meta.description}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: 0, fontSize: 'var(--text-fs-20)', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, color: meta.color, lineHeight: 1 }}>
              {pTotal}%
            </p>
            <p style={{ margin: 0, fontSize: 10, color: 'var(--color-neutral-6)' }}>
              Range: {cfg.minWeight}–{cfg.maxWeight}%
            </p>
          </div>
          <div style={{ color: 'var(--color-neutral-6)' }}>
            {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </div>
        </div>
      </div>

      {/* Content */}
      {!collapsed && (
        <div style={{ padding: '0 1.6rem 1.4rem' }}>
          {/* Goals table */}
          {goals.length > 0 && (
            <div style={{ overflowX: 'auto', marginTop: '0.8rem', marginBottom: '0.4rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-fs-12)' }}>
                <thead>
                  <tr>
                    {['Goal Name', 'MoP', 'Target', 'UoM', 'Weight', 'Status', ''].map((h, i) => (
                      <th key={i} className="hrms-th" style={{ background: meta.light, fontSize: 11 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {goals.map((goal) => {
                    if (editingId === goal.id) {
                      return (
                        <tr key={goal.id}>
                          <td colSpan={7} style={{ padding: '0.4rem 0' }}>
                            <GoalFormPanel
                              initial={goal}
                              perspective={perspective}
                              allGoals={allGoals}
                              onSave={onSave}
                              onCancel={onCancel}
                            />
                          </td>
                        </tr>
                      );
                    }

                    const chip = STATUS_CHIP[goal.status];
                    return (
                      <tr key={goal.id} style={{ transition: 'background 120ms' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = meta.light + '88')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                      >
                        <td className="hrms-td" style={{ maxWidth: 200 }}>
                          <p style={{ margin: 0, fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-10)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {goal.goalName}
                          </p>
                          {goal.description && (
                            <p style={{ margin: '1px 0 0', fontSize: 10, color: 'var(--color-neutral-6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                              {goal.description}
                            </p>
                          )}
                        </td>
                        <td className="hrms-td" style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {goal.measureOfPerformance}
                        </td>
                        <td className="hrms-td" style={{ fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
                          {goal.target}
                        </td>
                        <td className="hrms-td" style={{ whiteSpace: 'nowrap' }}>
                          {goal.unitOfMeasurement}
                        </td>
                        <td className="hrms-td">
                          <span style={{ fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-14)', color: meta.color }}>
                            {goal.weightage}%
                          </span>
                        </td>
                        <td className="hrms-td">
                          <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 10, fontFamily: 'var(--font-in-sb)', fontWeight: 700, background: chip.bg, color: chip.color, whiteSpace: 'nowrap' }}>
                            {chip.label}
                          </span>
                        </td>
                        <td className="hrms-td" style={{ width: 64, textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'flex-end' }}>
                            <button
                              title="Edit"
                              onClick={() => onEdit(goal.id)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--color-neutral-7)', borderRadius: '0.4rem', display: 'flex', alignItems: 'center' }}
                              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = meta.light; (e.currentTarget as HTMLButtonElement).style.color = meta.color; }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-neutral-7)'; }}
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              title="Delete"
                              onClick={() => onDelete(goal.id)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--color-neutral-7)', borderRadius: '0.4rem', display: 'flex', alignItems: 'center' }}
                              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#FEE2E2'; (e.currentTarget as HTMLButtonElement).style.color = '#DC2626'; }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-neutral-7)'; }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {goals.length === 0 && !isAdding && (
            <div style={{ padding: '1.6rem', textAlign: 'center', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
              No goals for this perspective yet. Add your first goal below.
            </div>
          )}

          {/* Inline add form */}
          {isAdding && (
            <GoalFormPanel
              initial={emptyGoal(perspective)}
              perspective={perspective}
              allGoals={allGoals}
              onSave={onSave}
              onCancel={onCancel}
            />
          )}

          {/* Add goal button */}
          {!isAdding && editingId === null && (
            <button
              onClick={() => onAddGoal(perspective)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '0.5rem 1rem', borderRadius: '0.6rem',
                border: `1.5px dashed ${meta.color}60`,
                background: 'transparent', cursor: 'pointer',
                fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)',
                fontWeight: 600, color: meta.color, marginTop: '0.6rem',
                transition: 'background 150ms',
              }}
              onMouseEnter={(e) => (e.currentTarget as HTMLButtonElement).style.background = meta.light}
              onMouseLeave={(e) => (e.currentTarget as HTMLButtonElement).style.background = 'transparent'}
            >
              <Plus size={13} /> Add {perspective} Goal
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── GoalBuilder ──────────────────────────────────────────────────────────────

export interface GoalBuilderProps {
  initialGoals?: GoalSchema[];
  onSubmit?:     (goals: GoalSchema[]) => Promise<void>;
  readOnly?:     boolean;
}

export function GoalBuilder({ initialGoals = SEED_GOALS, onSubmit, readOnly = false }: GoalBuilderProps) {
  const [goals,     setGoals]     = useState<GoalSchema[]>(initialGoals);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingTo,  setAddingTo]  = useState<GoalPerspective | null>(null);
  const [collapsed, setCollapsed] = useState<Record<GoalPerspective, boolean>>({
    Financial: false, Customer: false, Operational: false, 'Learning & Growth': false,
  });
  const [saving,       setSaving]       = useState(false);
  const [submitError,  setSubmitError]  = useState<string | null>(null);
  const [submitOk,     setSubmitOk]     = useState(false);

  const total = grandTotal(goals);

  // Validation for full submit
  const getSubmitErrors = useCallback((): string[] => {
    const errs: string[] = [];
    if (total !== 100) {
      errs.push(`Total weightage is ${total}%. It must equal exactly 100%.`);
    }
    for (const p of PERSPECTIVES) {
      const pT  = perspectiveTotal(goals, p);
      const cfg = PERSPECTIVE_THRESHOLDS[p];
      const cnt = goals.filter((g) => g.perspective === p).length;
      if (cnt > 0) {
        if (pT < cfg.minWeight) errs.push(`${p}: total weightage ${pT}% is below minimum ${cfg.minWeight}%.`);
        if (pT > cfg.maxWeight) errs.push(`${p}: total weightage ${pT}% exceeds maximum ${cfg.maxWeight}%.`);
      }
    }
    return errs;
  }, [goals, total]);

  const handleSaveGoal = useCallback((g: GoalSchema) => {
    setGoals((prev) => {
      const exists = prev.find((x) => x.id === g.id);
      return exists ? prev.map((x) => (x.id === g.id ? g : x)) : [...prev, g];
    });
    setEditingId(null);
    setAddingTo(null);
    setSubmitOk(false);
  }, []);

  const handleDelete = useCallback((id: string) => {
    setGoals((prev) => prev.filter((g) => g.id !== id));
    if (editingId === id) setEditingId(null);
    setSubmitOk(false);
  }, [editingId]);

  const handleCancel = useCallback(() => {
    setEditingId(null);
    setAddingTo(null);
  }, []);

  const handleToggle = useCallback((p: GoalPerspective) => {
    setCollapsed((c) => ({ ...c, [p]: !c[p] }));
  }, []);

  const handleSubmit = async () => {
    const errs = getSubmitErrors();
    if (errs.length) {
      setSubmitError(errs.join(' '));
      return;
    }
    setSaving(true);
    setSubmitError(null);
    try {
      if (onSubmit) await onSubmit(goals);
      setSubmitOk(true);
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const submitErrors = getSubmitErrors();
  const canSubmit    = submitErrors.length === 0 && !readOnly;

  return (
    <div>
      <WeightageBar goals={goals} />

      {PERSPECTIVES.map((p) => (
        <PerspectiveCard
          key={p}
          perspective={p}
          goals={goals.filter((g) => g.perspective === p)}
          allGoals={goals}
          editingId={editingId}
          addingTo={addingTo}
          onAddGoal={(perspective) => { setAddingTo(perspective); setEditingId(null); setCollapsed((c) => ({ ...c, [perspective]: false })); }}
          onEdit={(id) => { setEditingId(id); setAddingTo(null); setCollapsed((c) => ({ ...c, [p]: false })); }}
          onDelete={handleDelete}
          onSave={handleSaveGoal}
          onCancel={handleCancel}
          collapsed={collapsed[p]}
          onToggle={() => handleToggle(p)}
        />
      ))}

      {/* Submit panel */}
      {!readOnly && (
        <div
          className="hrms-card"
          style={{ padding: '1.2rem 1.6rem', display: 'flex', alignItems: 'center', gap: '1rem' }}
        >
          <div style={{ flex: 1 }}>
            {submitOk && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#065F46', fontSize: 'var(--text-fs-13)', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
                <CheckCircle2 size={15} /> Goals saved successfully.
              </div>
            )}
            {submitError && !submitOk && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', color: '#991B1B', fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-rg)' }}>
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                {submitError}
              </div>
            )}
            {!submitOk && !submitError && submitErrors.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-rg)' }}>
                <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                {submitErrors[0]}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.6rem', flexShrink: 0 }}>
            <span style={{ fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-7)', alignSelf: 'center', fontFamily: 'var(--font-in-rg)' }}>
              {goals.length} goal{goals.length !== 1 ? 's' : ''} · {total}% allocated
            </span>
            <button
              className="hrms-btn-primary"
              disabled={!canSubmit || saving}
              onClick={handleSubmit}
              style={{ padding: '0.65rem 1.4rem', fontSize: 'var(--text-fs-13)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              {saving ? <><Loader2 size={13} className="animate-spin" /> Saving…</> : <><Target size={13} /> Submit Goals</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
