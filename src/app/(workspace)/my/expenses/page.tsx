'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Loader2, Receipt, Trash2, Send, ChevronDown, ChevronUp } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

interface ExpenseItem { date: string; expenseType: string; amount: number; description: string; }
interface ExpenseClaim {
  _id: string; status: string; totalClaimed: number; totalSanctioned: number;
  items: ExpenseItem[]; notes: string; month: string; createdAt: string;
  rejectedReason?: string;
}

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  draft:             { bg: '#F5F5F5', fg: 'var(--color-neutral-7)',    label: 'Draft' },
  submitted:         { bg: '#E8EEF5', fg: 'var(--color-vr-blue-6)',    label: 'Submitted' },
  manager_approved:  { bg: '#FFF3CD', fg: '#856404',                   label: 'Mgr Approved' },
  finance_approved:  { bg: 'var(--color-semantics-green-1)', fg: 'var(--color-semantics-green-7)', label: 'Approved' },
  rejected:          { bg: 'var(--color-semantics-red-1)',   fg: 'var(--color-semantics-red-6)',   label: 'Rejected' },
  paid:              { bg: 'var(--color-semantics-green-1)', fg: 'var(--color-semantics-green-7)', label: 'Paid' },
};

const EXPENSE_TYPES = ['Travel - Local','Travel - Outstation','Meals & Entertainment',
  'Training & Certification','Internet & Communication','Office Supplies','Accommodation','Medical'];

export default function MyExpensesPage() {
  const toast = useToast();
  const [claims,     setClaims]     = useState<ExpenseClaim[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [showForm,   setShowForm]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expanded,   setExpanded]   = useState<string | null>(null);
  const [items,      setItems]      = useState<ExpenseItem[]>([
    { date: new Date().toISOString().slice(0, 10), expenseType: EXPENSE_TYPES[0]!, amount: 0, description: '' },
  ]);
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const res  = await fetch('/api/me/expenses');
    const json = await res.json();
    setClaims(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalAmount = items.reduce((s, i) => s + Number(i.amount), 0);

  const addItem = () => setItems((prev) => [...prev, { date: new Date().toISOString().slice(0, 10), expenseType: EXPENSE_TYPES[0]!, amount: 0, description: '' }]);
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));
  const patchItem = (i: number, key: keyof ExpenseItem, val: string | number) =>
    setItems((prev) => prev.map((item, idx) => idx === i ? { ...item, [key]: val } : item));

  const submit = async (asDraft: boolean) => {
    if (!asDraft && items.some((i) => i.amount <= 0)) {
      toast.push({ kind: 'error', title: 'All items must have a valid amount' }); return;
    }
    setSubmitting(true);
    const res = await fetch('/api/me/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, notes, submit: !asDraft }),
    });
    setSubmitting(false);
    if (res.ok) {
      toast.push({ kind: 'success', title: asDraft ? 'Saved as draft' : 'Expense claim submitted' });
      setShowForm(false); setItems([{ date: new Date().toISOString().slice(0, 10), expenseType: EXPENSE_TYPES[0]!, amount: 0, description: '' }]); setNotes('');
      load();
    } else {
      toast.push({ kind: 'error', title: 'Failed to submit' });
    }
  };

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><Loader2 size={22} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} /></div>;

  return (
    <div style={{ padding: '2rem', maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.6rem' }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-20)', color: 'var(--color-neutral-10)' }}>My Expenses</h2>
          <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>{claims.length} claims</p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="hrms-btn-primary">
          <Plus size={13} /> New Claim
        </button>
      </div>

      {/* New claim form */}
      {showForm && (
        <div className="hrms-card" style={{ padding: '1.6rem', marginBottom: '1.6rem' }}>
          <h3 style={{ margin: '0 0 1.2rem', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-16)', color: 'var(--color-neutral-10)' }}>New Expense Claim</h3>
          {items.map((item, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 120px 1fr 36px', gap: '0.6rem', marginBottom: '0.6rem', alignItems: 'end' }}>
              <div><label style={labelStyle}>Date</label><input type="date" value={item.date} onChange={(e) => patchItem(i, 'date', e.target.value)} className="hrms-input" /></div>
              <div><label style={labelStyle}>Type</label>
                <select value={item.expenseType} onChange={(e) => patchItem(i, 'expenseType', e.target.value)} className="hrms-input">
                  {EXPENSE_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div><label style={labelStyle}>Amount (₹)</label><input type="number" min={0} value={item.amount} onChange={(e) => patchItem(i, 'amount', Number(e.target.value))} className="hrms-input" /></div>
              <div><label style={labelStyle}>Description</label><input value={item.description} onChange={(e) => patchItem(i, 'description', e.target.value)} className="hrms-input" placeholder="Purpose…" /></div>
              <button onClick={() => removeItem(i)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-semantics-red-6)', padding: '0.4rem' }} title="Remove">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.8rem' }}>
            <button onClick={addItem} className="hrms-btn-ghost" style={{ fontSize: 'var(--text-fs-12)' }}><Plus size={12} /> Add Item</button>
            <span style={{ fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-16)', color: 'var(--color-neutral-10)' }}>
              Total: ₹{totalAmount.toLocaleString('en-IN')}
            </span>
          </div>
          <div style={{ marginTop: '1rem' }}>
            <label style={labelStyle}>Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="hrms-input" rows={2} placeholder="Any additional notes…" style={{ width: '100%', resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: '0.8rem', marginTop: '1.2rem', justifyContent: 'flex-end' }}>
            <button onClick={() => submit(true)} disabled={submitting} className="hrms-btn-ghost">Save Draft</button>
            <button onClick={() => submit(false)} disabled={submitting} className="hrms-btn-primary">
              {submitting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Submit Claim
            </button>
          </div>
        </div>
      )}

      {/* Claims list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
        {claims.length === 0 && <p style={{ textAlign: 'center', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)', padding: '2rem' }}>No expense claims yet</p>}
        {claims.map((claim) => {
          const s = STATUS_STYLE[claim.status] ?? STATUS_STYLE['draft']!;
          const isOpen = expanded === claim._id;
          return (
            <div key={claim._id} className="hrms-card" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '1.2rem 1.6rem', display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer' }}
                   onClick={() => setExpanded(isOpen ? null : claim._id)}>
                <Receipt size={16} style={{ color: 'var(--color-vr-blue-6)', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontFamily: 'var(--font-in-sb)', fontWeight: 600, fontSize: 'var(--text-fs-14)', color: 'var(--color-neutral-10)' }}>
                    {claim.month} · {claim.items.length} item{claim.items.length !== 1 ? 's' : ''}
                  </p>
                  <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
                    Submitted {new Date(claim.createdAt).toLocaleDateString('en-IN')}
                  </p>
                </div>
                <span style={{ fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-16)', color: 'var(--color-neutral-10)' }}>
                  ₹{claim.totalClaimed.toLocaleString('en-IN')}
                </span>
                <span style={{ padding: '0.2rem 0.8rem', borderRadius: 99, background: s.bg, color: s.fg, fontSize: 11, fontFamily: 'var(--font-in-sb)', fontWeight: 600, whiteSpace: 'nowrap' }}>{s.label}</span>
                {isOpen ? <ChevronUp size={14} style={{ flexShrink: 0 }} /> : <ChevronDown size={14} style={{ flexShrink: 0 }} />}
              </div>
              {isOpen && (
                <div style={{ padding: '0 1.6rem 1.2rem', borderTop: '1px solid var(--color-stroke)' }}>
                  {claim.rejectedReason && (
                    <p style={{ margin: '0.8rem 0', padding: '0.8rem', borderRadius: '0.8rem', background: 'var(--color-semantics-red-1)', color: 'var(--color-semantics-red-6)', fontSize: 'var(--text-fs-12)' }}>
                      Rejected: {claim.rejectedReason}
                    </p>
                  )}
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.8rem' }}>
                    <thead><tr>{['Date','Type','Amount','Description'].map((h) => <th key={h} className="hrms-th">{h}</th>)}</tr></thead>
                    <tbody>
                      {claim.items.map((item, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--color-stroke)' }}>
                          <td className="hrms-td">{new Date(item.date).toLocaleDateString('en-IN')}</td>
                          <td className="hrms-td">{item.expenseType}</td>
                          <td className="hrms-td">₹{Number(item.amount).toLocaleString('en-IN')}</td>
                          <td className="hrms-td">{item.description || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', marginBottom: 4,
  color: 'var(--color-neutral-8)', fontSize: 10,
  fontFamily: 'var(--font-in-sb)', fontWeight: 600,
  letterSpacing: '0.07em', textTransform: 'uppercase',
};
