'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Target, Loader2 } from 'lucide-react';
import { Modal }    from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

export interface AddReviewModalProps {
  open:       boolean;
  onClose:    () => void;
  onCreated?: () => void;
}

interface EmployeeOption { _id: string; employeeCode: string; jobTitle: string }

// Default cycle label derived from today, e.g. "H1 2026" / "H2 2026".
function defaultCycle(): string {
  const now   = new Date();
  const half  = now.getMonth() < 6 ? 'H1' : 'H2';
  return `${half} ${now.getFullYear()}`;
}

export function AddReviewModal({ open, onClose, onCreated }: AddReviewModalProps) {
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [employeeId, setEmployeeId] = useState('');
  const [cycleLabel, setCycleLabel] = useState(defaultCycle());
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd]   = useState('');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const { push: pushToast }   = useToast();

  useEffect(() => {
    if (!open) return;
    fetch('/api/employees?limit=500')
      .then((r) => r.json())
      .then((d) => setEmployees(d.data ?? []))
      .catch(() => setEmployees([]));
  }, [open]);

  const handleClose = () => {
    if (saving) return;
    setEmployeeId(''); setCycleLabel(defaultCycle());
    setPeriodStart(''); setPeriodEnd(''); setError('');
    onClose();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!employeeId || !cycleLabel || !periodStart || !periodEnd) {
      setError('All fields are required.');
      return;
    }
    if (new Date(periodEnd) < new Date(periodStart)) {
      setError('Period end must be on or after the start date.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/performance', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, cycleLabel, periodStart, periodEnd }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? 'Failed to open review.'); return; }
      pushToast({ kind: 'success', title: `Review opened for ${cycleLabel}.` });
      handleClose();
      onCreated?.();
    } catch {
      setError('Network error — please try again.');
    } finally {
      setSaving(false);
    }
  };

  const labelStyle: React.CSSProperties = { fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-9)' };
  const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box' };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Target size={15} />Open Performance Review</span>}
      subtitle="Start a review cycle for an employee. They'll be notified to complete a self-assessment."
      width={520}
      footer={
        <>
          <button type="button" className="hrms-btn-ghost" onClick={handleClose} disabled={saving}>Cancel</button>
          <button type="submit" form="add-review-form" className="hrms-btn-primary" disabled={saving}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : 'Open Review'}
          </button>
        </>
      }
    >
      <form id="add-review-form" onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={labelStyle}>Employee *</label>
            <select className="hrms-input" style={inputStyle} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required autoFocus>
              <option value="">Select an employee…</option>
              {employees.map((emp) => (
                <option key={emp._id} value={emp._id}>{emp.employeeCode} · {emp.jobTitle}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={labelStyle}>Cycle Label *</label>
            <input className="hrms-input" style={inputStyle} placeholder="H1 2026" value={cycleLabel} onChange={(e) => setCycleLabel(e.target.value)} required />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={labelStyle}>Period Start *</label>
              <input className="hrms-input" style={inputStyle} type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} required />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={labelStyle}>Period End *</label>
              <input className="hrms-input" style={inputStyle} type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} required />
            </div>
          </div>

          {error && (
            <p style={{ margin: 0, fontSize: 'var(--text-fs-12)', color: 'var(--color-semantics-red-6)', background: '#FFF5F5', border: '1px solid #FFCDD2', borderRadius: '0.6rem', padding: '0.8rem 1rem' }}>
              {error}
            </p>
          )}

        </div>
      </form>
    </Modal>
  );
}
