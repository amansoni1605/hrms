'use client';

import { useState, type FormEvent, type ChangeEvent } from 'react';
import { Target, Loader2, ChevronRight, ChevronLeft, Sliders } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

export interface CycleCreateModalProps {
  open:       boolean;
  onClose:    () => void;
  onCreated?: () => void;
}

interface Formula {
  selfPct:    number;
  managerPct: number;
  peerPct:    number;
}

const PRESETS: { label: string; self: number; manager: number; peer: number }[] = [
  { label: 'Standard (20/60/20)',    self: 20, manager: 60, peer: 20 },
  { label: 'Manager-heavy (10/80/10)', self: 10, manager: 80, peer: 10 },
  { label: 'Equal (33/33/34)',       self: 33, manager: 33, peer: 34 },
];

const TYPE_OPTIONS = [
  { value: 'annual',     label: 'Annual'    },
  { value: 'half_year',  label: 'Half Year' },
  { value: 'quarterly',  label: 'Quarterly' },
  { value: 'probation',  label: 'Probation' },
];

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--text-fs-12)',
  fontFamily: 'var(--font-in-sb)',
  fontWeight: 600,
  color: 'var(--color-neutral-9)',
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
};

function SliderRow({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
      <span
        style={{
          width: 96,
          flexShrink: 0,
          fontSize: 'var(--text-fs-12)',
          fontFamily: 'var(--font-in-sb)',
          fontWeight: 600,
          color: 'var(--color-neutral-9)',
        }}
      >
        {label}
      </span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(Number(e.target.value))}
        style={{ flex: 1, accentColor: 'var(--color-vr-blue-6)', cursor: disabled ? 'not-allowed' : 'pointer' }}
      />
      <span
        style={{
          width: 40,
          textAlign: 'right',
          fontFamily: 'var(--font-in-sb)',
          fontWeight: 700,
          fontSize: 'var(--text-fs-14)',
          color: 'var(--color-neutral-10)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}%
      </span>
    </div>
  );
}

export function CycleCreateModal({ open, onClose, onCreated }: CycleCreateModalProps) {
  const { push: pushToast } = useToast();
  const [step, setStep] = useState<1 | 2>(1);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  // Step 1 fields
  const [name, setName]             = useState('');
  const [type, setType]             = useState<string>('annual');
  const [startDate, setStartDate]   = useState('');
  const [endDate, setEndDate]       = useState('');
  const [enable360, setEnable360]   = useState(false);
  const [pipThreshold, setPipThreshold] = useState(2);

  // Step 2 formula
  const [formula, setFormula] = useState<Formula>({ selfPct: 20, managerPct: 60, peerPct: 20 });

  const formulaSum = formula.selfPct + formula.managerPct + formula.peerPct;

  const handleClose = () => {
    if (saving) return;
    setStep(1);
    setName(''); setType('annual'); setStartDate(''); setEndDate('');
    setEnable360(false); setPipThreshold(2);
    setFormula({ selfPct: 20, managerPct: 60, peerPct: 20 });
    setError('');
    onClose();
  };

  const handleStep1Submit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Cycle name is required.'); return; }
    if (!startDate || !endDate) { setError('Start and end dates are required.'); return; }
    if (new Date(endDate) < new Date(startDate)) { setError('End date must be on or after start date.'); return; }
    setStep(2);
  };

  const applyPreset = (self: number, manager: number, peer: number) => {
    setFormula({ selfPct: self, managerPct: manager, peerPct: peer });
  };

  const setSlider = (field: keyof Formula, val: number) => {
    setFormula((prev) => ({ ...prev, [field]: val }));
  };

  const handleCreate = async (skipFormula = false) => {
    setSaving(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        type,
        startDate,
        endDate,
        enable360,
        pipThreshold,
      };
      if (!skipFormula) {
        if (formulaSum !== 100) {
          setError(`Weights must sum to 100 (currently ${formulaSum}).`);
          setSaving(false);
          return;
        }
        body.formulaConfig = {
          components: [
            { source: 'self',    weight: formula.selfPct    / 100 },
            { source: 'manager', weight: formula.managerPct / 100 },
            { source: 'peer',    weight: formula.peerPct    / 100 },
          ],
          scale: { min: 1, max: 5 },
        };
      }
      const res  = await fetch('/api/ws/performance/cycles', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? 'Failed to create cycle.'); return; }
      pushToast({ kind: 'success', title: `Cycle "${name.trim()}" created.` });
      handleClose();
      onCreated?.();
    } catch {
      setError('Network error — please try again.');
    } finally {
      setSaving(false);
    }
  };

  const stepIndicator = (n: 1 | 2) => {
    const active  = step === n;
    const past    = step > n;
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 'var(--text-fs-12)',
          fontFamily: 'var(--font-in-sb)',
          fontWeight: active ? 700 : 500,
          color: active ? 'var(--color-vr-blue-6)' : past ? 'var(--color-neutral-7)' : 'var(--color-neutral-6)',
        }}
      >
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 700,
            background: active ? 'var(--color-vr-blue-6)' : past ? 'var(--color-neutral-4)' : 'var(--color-neutral-3)',
            color: active ? '#fff' : past ? 'var(--color-neutral-8)' : 'var(--color-neutral-6)',
          }}
        >
          {n}
        </span>
        {n === 1 ? 'Basic Info' : 'Scoring Formula'}
      </div>
    );
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Target size={15} />
          New Appraisal Cycle
        </span>
      }
      subtitle="Create a new PMS cycle. You can configure the scoring formula in the next step."
      width={540}
      closeOnBackdrop={!saving}
      footer={
        step === 1 ? (
          <>
            <button type="button" className="hrms-btn-ghost" onClick={handleClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" form="cycle-step1-form" className="hrms-btn-primary" disabled={saving}>
              Next
              <ChevronRight size={13} style={{ marginLeft: 4 }} />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="hrms-btn-ghost"
              onClick={() => { setStep(1); setError(''); }}
              disabled={saving}
              style={{ marginRight: 'auto' }}
            >
              <ChevronLeft size={13} style={{ marginRight: 4 }} />
              Back
            </button>
            <button
              type="button"
              className="hrms-btn-ghost"
              onClick={() => handleCreate(true)}
              disabled={saving}
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : 'Skip & Create'}
            </button>
            <button
              type="button"
              className="hrms-btn-primary"
              onClick={() => handleCreate(false)}
              disabled={saving || formulaSum !== 100}
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : 'Create Cycle'}
            </button>
          </>
        )
      }
    >
      {/* Step indicator */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1.6rem',
          marginBottom: '1.6rem',
          paddingBottom: '1.2rem',
          borderBottom: '1px solid var(--color-neutral-4)',
        }}
      >
        {stepIndicator(1)}
        <div style={{ flex: 1, height: 1, background: 'var(--color-neutral-4)' }} />
        {stepIndicator(2)}
      </div>

      {step === 1 && (
        <form id="cycle-step1-form" onSubmit={handleStep1Submit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>

            <div>
              <label style={labelStyle}>Cycle name *</label>
              <input
                className="hrms-input"
                style={inputStyle}
                placeholder="e.g. Annual Review FY2027"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div>
              <label style={labelStyle}>Type *</label>
              <select
                className="hrms-input"
                style={inputStyle}
                value={type}
                onChange={(e) => setType(e.target.value)}
                required
              >
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem' }}>
              <div>
                <label style={labelStyle}>Start date *</label>
                <input
                  className="hrms-input"
                  style={inputStyle}
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </div>
              <div>
                <label style={labelStyle}>End date *</label>
                <input
                  className="hrms-input"
                  style={inputStyle}
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                padding: '1rem 1.2rem',
                background: 'var(--color-neutral-2)',
                borderRadius: '0.8rem',
                border: '1px solid var(--color-neutral-4)',
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  fontSize: 'var(--text-fs-12)',
                  fontFamily: 'var(--font-in-sb)',
                  fontWeight: 600,
                  color: 'var(--color-neutral-9)',
                }}
              >
                <input
                  type="checkbox"
                  checked={enable360}
                  onChange={(e) => setEnable360(e.target.checked)}
                  style={{ width: 14, height: 14, accentColor: 'var(--color-vr-blue-6)' }}
                />
                Enable 360° peer feedback
              </label>

              <div>
                <label style={labelStyle}>
                  Auto-trigger PIP below score
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                  <input
                    className="hrms-input"
                    style={{ width: 80, boxSizing: 'border-box' }}
                    type="number"
                    min={1}
                    max={5}
                    step={0.5}
                    value={pipThreshold}
                    onChange={(e) => setPipThreshold(Number(e.target.value))}
                  />
                  <span style={{ fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-7)' }}>
                    out of 5
                  </span>
                </div>
              </div>
            </div>

            {error && (
              <p
                style={{
                  margin: 0,
                  fontSize: 'var(--text-fs-12)',
                  color: '#DC2626',
                  background: '#FFF5F5',
                  border: '1px solid #FFCDD2',
                  borderRadius: '0.6rem',
                  padding: '0.8rem 1rem',
                }}
              >
                {error}
              </p>
            )}
          </div>
        </form>
      )}

      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '0.8rem 1rem',
              background: 'var(--color-neutral-3)',
              borderRadius: '0.8rem',
              fontSize: 'var(--text-fs-12)',
              color: 'var(--color-neutral-7)',
            }}
          >
            <Sliders size={14} style={{ flexShrink: 0 }} />
            Set how self, manager, and peer scores are weighted. Weights must sum to 100.
          </div>

          {/* Presets */}
          <div>
            <label style={{ ...labelStyle, marginBottom: 8 }}>Quick presets</label>
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPreset(p.self, p.manager, p.peer)}
                  style={{
                    padding: '0.4rem 0.9rem',
                    borderRadius: '0.6rem',
                    border: '1px solid var(--color-neutral-4)',
                    background:
                      formula.selfPct === p.self &&
                      formula.managerPct === p.manager &&
                      formula.peerPct === p.peer
                        ? 'var(--color-vr-blue-6)'
                        : 'var(--color-neutral-1)',
                    color:
                      formula.selfPct === p.self &&
                      formula.managerPct === p.manager &&
                      formula.peerPct === p.peer
                        ? '#fff'
                        : 'var(--color-neutral-8)',
                    fontSize: 'var(--text-fs-12)',
                    fontFamily: 'var(--font-in-sb)',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 120ms ease',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Sliders */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '1.2rem',
              padding: '1.2rem',
              background: 'var(--color-neutral-2)',
              borderRadius: '0.8rem',
              border: '1px solid var(--color-neutral-4)',
            }}
          >
            <SliderRow label="Self"    value={formula.selfPct}    onChange={(v) => setSlider('selfPct', v)} />
            <SliderRow label="Manager" value={formula.managerPct} onChange={(v) => setSlider('managerPct', v)} />
            <SliderRow label="Peer"    value={formula.peerPct}    onChange={(v) => setSlider('peerPct', v)} />

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: '0.5rem',
                paddingTop: '0.8rem',
                borderTop: '1px solid var(--color-neutral-4)',
                fontSize: 'var(--text-fs-12)',
                fontFamily: 'var(--font-in-sb)',
                fontWeight: 700,
              }}
            >
              <span style={{ color: 'var(--color-neutral-7)' }}>Total:</span>
              <span
                style={{
                  color: formulaSum === 100 ? 'var(--color-neutral-10)' : '#DC2626',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {formulaSum}%
              </span>
              {formulaSum !== 100 && (
                <span style={{ color: '#DC2626', fontSize: 11 }}>
                  (must equal 100)
                </span>
              )}
            </div>
          </div>

          {error && (
            <p
              style={{
                margin: 0,
                fontSize: 'var(--text-fs-12)',
                color: '#DC2626',
                background: '#FFF5F5',
                border: '1px solid #FFCDD2',
                borderRadius: '0.6rem',
                padding: '0.8rem 1rem',
              }}
            >
              {error}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
