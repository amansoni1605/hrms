'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Loader2 }    from 'lucide-react';
import { StatusBadge }      from '@/components/ui/Badge';
import { StatCard }         from '@/components/ui/StatCard';
import { FileUpload }       from '@/components/ui/FileUpload';
import { Modal }            from '@/components/ui/Modal';
import { useToast }         from '@/components/ui/Toast';
import { formatDate }       from '@/lib/format';
import { Calendar, AlertCircle } from 'lucide-react';

interface LeaveRecord {
  _id: string; leaveType: string; startDate: string; endDate: string;
  totalDays: number; status: string; reason: string;
}
interface LeaveBalance {
  annual: number; sick: number; earned: number; usedAnnual: number; remaining: number;
}

export default function MyLeavesPage() {
  const [leaves,  setLeaves]  = useState<LeaveRecord[]>([]);
  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm]   = useState({ leaveType: 'annual', startDate: '', endDate: '', reason: '' });
  const [attachments, setAttachments] = useState<File[]>([]);
  const [submitting, setSubmitting]   = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const res  = await fetch('/api/me/leaves');
    const json = await res.json();
    setLeaves(json.data ?? []);
    setBalance(json.balance ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async () => {
    if (!form.startDate || !form.endDate || !form.reason) {
      toast.push({ kind: 'error', title: 'Missing fields', desc: 'All fields are required.' });
      return;
    }
    setSubmitting(true);
    const res  = await fetch('/api/me/leaves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const json = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      toast.push({ kind: 'error', title: 'Submission failed', desc: json.error ?? '' });
      return;
    }
    toast.push({ kind: 'success', title: 'Leave request submitted', desc: 'Your request will be reviewed by your manager first, then HR.' });
    setShowModal(false);
    setForm({ leaveType: 'annual', startDate: '', endDate: '', reason: '' });
    setAttachments([]);
    await load();
  };

  return (
    <div style={{ padding: '2rem', maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.6rem' }}>
        <div style={{ flex: 1 }}>
          <h2 style={{
            margin: 0, color: 'var(--color-neutral-10)',
            fontFamily: 'var(--font-jk-bd)', fontWeight: 700,
            fontSize: 'var(--text-fs-20)',
          }}>My Leaves</h2>
          <p style={{ margin: 0, marginTop: 4, color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
            Track your leave balance and submit new requests.
          </p>
        </div>
        <button onClick={() => setShowModal(true)} className="hrms-btn-primary">
          <Plus size={14} /> Request Leave
        </button>
      </div>

      {/* Balance strip */}
      {balance && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '1rem', marginBottom: '1.6rem',
        }}>
          <StatCard title="Annual Remaining" value={balance.remaining}    icon={Calendar}      accent="blue"  subtitle={`of ${balance.annual} days`} />
          <StatCard title="Sick Leave"        value={balance.sick}         icon={AlertCircle}   accent="amber" subtitle="days entitlement" />
          <StatCard title="Earned Leave"      value={balance.earned}       icon={Calendar}      accent="green" subtitle="accrued" />
          <StatCard title="Used This Year"    value={balance.usedAnnual}   icon={Calendar}      accent="red"   subtitle="annual days used" />
        </div>
      )}

      {/* Leave history */}
      <div className="hrms-card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-fs-12)' }}>
          <thead>
            <tr>
              {['Type','Reason','From','To','Days','Status'].map((h) => (
                <th key={h} className="hrms-th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '3rem' }}>
                <Loader2 size={18} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
              </td></tr>
            ) : leaves.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-neutral-7)' }}>
                No leave history yet.
              </td></tr>
            ) : leaves.map((l) => (
              <tr key={l._id}>
                <td className="hrms-td" style={{ textTransform: 'capitalize' }}>{l.leaveType.replace('_',' ')}</td>
                <td className="hrms-td" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-neutral-7)' }}>{l.reason}</td>
                <td className="hrms-td" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatDate(l.startDate)}</td>
                <td className="hrms-td" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatDate(l.endDate)}</td>
                <td className="hrms-td" style={{ textAlign: 'center', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>{l.totalDays}</td>
                <td className="hrms-td"><StatusBadge status={l.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Request modal */}
      <Modal
        open={showModal}
        onClose={() => { setShowModal(false); setForm({ leaveType: 'annual', startDate: '', endDate: '', reason: '' }); setAttachments([]); }}
        title="Request Leave"
        subtitle="Your request will be sent to HR for approval."
        footer={
          <>
            <button onClick={() => setShowModal(false)} className="hrms-btn-ghost">Cancel</button>
            <button onClick={handleSubmit} disabled={submitting} className="hrms-btn-primary">
              {submitting ? <Loader2 size={12} className="animate-spin" /> : null}
              Submit Request
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          <div>
            <label className="hrms-section-label" style={{ display: 'block', marginBottom: 4 }}>Leave Type</label>
            <select value={form.leaveType} onChange={(e) => setForm({ ...form, leaveType: e.target.value })} className="hrms-input">
              <option value="annual">Annual Leave</option>
              <option value="sick">Sick Leave</option>
              <option value="compensatory">Compensatory</option>
              <option value="maternity">Maternity</option>
              <option value="paternity">Paternity</option>
              <option value="unpaid">Unpaid</option>
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
            <div>
              <label className="hrms-section-label" style={{ display: 'block', marginBottom: 4 }}>Start Date</label>
              <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="hrms-input" />
            </div>
            <div>
              <label className="hrms-section-label" style={{ display: 'block', marginBottom: 4 }}>End Date</label>
              <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="hrms-input" />
            </div>
          </div>
          <div>
            <label className="hrms-section-label" style={{ display: 'block', marginBottom: 4 }}>Reason</label>
            <textarea
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              rows={3} className="hrms-input" style={{ resize: 'vertical' }}
              placeholder="Briefly describe the reason for your leave…"
            />
          </div>
          <div>
            <label className="hrms-section-label" style={{ display: 'block', marginBottom: 4 }}>Supporting Documents (optional)</label>
            <FileUpload
              accept=".pdf,.jpg,.jpeg,.png"
              maxSizeMB={5}
              multiple
              onFilesChange={setAttachments}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
