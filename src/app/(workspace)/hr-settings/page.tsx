'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Calendar, DollarSign, Clock, Gift, FileText, Settings2,
  Save, Loader2, Plus, Trash2, RefreshCw, CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { Tabs } from '@/components/ui/Tabs';
import { useToast } from '@/components/ui/Toast';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface LeavePolicy {
  leaveType: string; annualDays: number; carryForward: boolean;
  maxCarryDays: number; encashable: boolean; isActive: boolean;
}
interface SalaryBand { band: string; minBase: number; maxBase: number; travelAllowance: number; }
interface SalaryFormula { basicPercent: number; hraPercent: number; medicalAllowance: number; profTax: number; pfPercent: number; }
interface Holiday { date: string; name: string; type: string; }
interface ExpenseType { name: string; description: string; isActive: boolean; }
interface HRSettings {
  leavePolicy: LeavePolicy[];
  salaryBands: SalaryBand[];
  salaryFormula: SalaryFormula;
  workingDaysPerWeek: number;
  probationPeriodDays: number;
  noticePeriodDays: number;
  holidays: Holiday[];
  expenseTypes: ExpenseType[];
  offboardingTemplate: string[];
}

const TABS = [
  { key: 'leave',      label: 'Leave Policy',      icon: Calendar },
  { key: 'salary',     label: 'Salary Bands',       icon: DollarSign },
  { key: 'payroll',    label: 'Payroll Rules',       icon: Settings2 },
  { key: 'shifts',     label: 'Shift Types',         icon: Clock },
  { key: 'holidays',   label: 'Holidays',            icon: Gift },
  { key: 'expenses',   label: 'Expense Types',       icon: FileText },
  { key: 'offboarding',label: 'Offboarding',         icon: FileText },
];

const HOLIDAY_TYPES = ['national','optional','restricted'];

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function HRSettingsPage() {
  const toast = useToast();
  const [settings, setSettings] = useState<HRSettings | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [dirty,    setDirty]    = useState(false);
  const [tab,      setTab]      = useState('leave');

  // Shift types state (separate API)
  const [shifts,     setShifts]      = useState<Array<{ _id: string; name: string; code: string; startTime: string; endTime: string; gracePeriodMinutes: number; isWfh: boolean }>>([]);
  const [shiftForm,  setShiftForm]   = useState({ name: '', code: '', startTime: '09:30', endTime: '18:30', gracePeriodMinutes: 15, isWfh: false });
  const [addingShift, setAddingShift]= useState(false);
  const [shiftSaving, setShiftSaving]= useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [settRes, shiftRes] = await Promise.all([
      fetch('/api/hr-settings'),
      fetch('/api/attendance/shifts'),
    ]);
    const [settJson, shiftJson] = await Promise.all([settRes.json(), shiftRes.json()]);
    setSettings(settJson.data ?? null);
    setShifts(shiftJson.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const patch = <K extends keyof HRSettings>(key: K, value: HRSettings[K]) => {
    setSettings((prev) => prev ? { ...prev, [key]: value } : prev);
    setDirty(true);
  };

  const patchFormula = (key: keyof SalaryFormula, value: number) => {
    setSettings((prev) => prev ? { ...prev, salaryFormula: { ...prev.salaryFormula, [key]: value } } : prev);
    setDirty(true);
  };

  const save = async () => {
    if (!settings || !dirty) return;
    setSaving(true);
    const res = await fetch('/api/hr-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    setSaving(false);
    if (res.ok) {
      toast.push({ kind: 'success', title: 'HR settings saved' });
      setDirty(false);
    } else {
      toast.push({ kind: 'error', title: 'Save failed' });
    }
  };

  const addShift = async () => {
    if (!shiftForm.name || !shiftForm.code) { toast.push({ kind: 'error', title: 'Name and code required' }); return; }
    setShiftSaving(true);
    const res = await fetch('/api/attendance/shifts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(shiftForm),
    });
    setShiftSaving(false);
    if (res.ok) {
      toast.push({ kind: 'success', title: 'Shift type created' });
      setAddingShift(false);
      setShiftForm({ name: '', code: '', startTime: '09:30', endTime: '18:30', gracePeriodMinutes: 15, isWfh: false });
      load();
    } else {
      toast.push({ kind: 'error', title: 'Failed to create shift' });
    }
  };

  if (loading || !settings) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
        <Loader2 size={22} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
      </div>
    );
  }

  // Pre-compute salary preview for the formula tab
  const previewBase = 55000;
  const { basicPercent, hraPercent, medicalAllowance, profTax, pfPercent } = settings.salaryFormula;
  const basic = previewBase * basicPercent / 100;
  const hra   = previewBase * hraPercent / 100;
  const ta    = 1600;
  const sa    = previewBase - basic - hra - medicalAllowance - ta;
  const epf   = basic * pfPercent / 100;
  const net   = previewBase - epf - profTax;

  return (
    <div style={{ padding: '2rem', maxWidth: 1000 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.6rem' }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-20)', color: 'var(--color-neutral-10)' }}>
            HR Configuration
          </h2>
          <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
            Organisation-level HR policies, payroll rules, and operational settings.
          </p>
        </div>
        {dirty && (
          <button onClick={save} disabled={saving} className="hrms-btn-primary">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        )}
      </div>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      <div style={{ marginTop: '1.6rem' }}>

        {/* ── LEAVE POLICY ──────────────────────────────────────────── */}
        {tab === 'leave' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            <div className="hrms-card" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '1.2rem 1.6rem', borderBottom: '1px solid var(--color-stroke)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-14)', color: 'var(--color-neutral-10)' }}>Leave Types</h3>
                <button onClick={() => {
                  patch('leavePolicy', [...settings.leavePolicy, { leaveType: 'New Leave', annualDays: 5, carryForward: false, maxCarryDays: 0, encashable: false, isActive: true }]);
                }} className="hrms-btn-ghost" style={{ fontSize: 11 }}><Plus size={12} /> Add Type</button>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Leave Type', 'Annual Days', 'Carry Forward', 'Max Carry', 'Encashable', 'Active', ''].map((h) => (
                      <th key={h} className="hrms-th">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {settings.leavePolicy.map((lp, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--color-stroke)' }}>
                      <td className="hrms-td">
                        <input value={lp.leaveType} onChange={(e) => {
                          const updated = [...settings.leavePolicy];
                          updated[i] = { ...lp, leaveType: e.target.value };
                          patch('leavePolicy', updated);
                        }} className="hrms-input" style={{ width: 160 }} />
                      </td>
                      <td className="hrms-td">
                        <input type="number" min={0} max={365} value={lp.annualDays} onChange={(e) => {
                          const updated = [...settings.leavePolicy];
                          updated[i] = { ...lp, annualDays: Number(e.target.value) };
                          patch('leavePolicy', updated);
                        }} className="hrms-input" style={{ width: 80 }} />
                      </td>
                      <td className="hrms-td" style={{ textAlign: 'center' }}>
                        <ToggleSwitch checked={lp.carryForward} onChange={(v) => {
                          const updated = [...settings.leavePolicy];
                          updated[i] = { ...lp, carryForward: v };
                          patch('leavePolicy', updated);
                        }} />
                      </td>
                      <td className="hrms-td">
                        <input type="number" min={0} value={lp.maxCarryDays} disabled={!lp.carryForward} onChange={(e) => {
                          const updated = [...settings.leavePolicy];
                          updated[i] = { ...lp, maxCarryDays: Number(e.target.value) };
                          patch('leavePolicy', updated);
                        }} className="hrms-input" style={{ width: 80, opacity: lp.carryForward ? 1 : 0.4 }} />
                      </td>
                      <td className="hrms-td" style={{ textAlign: 'center' }}>
                        <ToggleSwitch checked={lp.encashable} onChange={(v) => {
                          const updated = [...settings.leavePolicy];
                          updated[i] = { ...lp, encashable: v };
                          patch('leavePolicy', updated);
                        }} />
                      </td>
                      <td className="hrms-td" style={{ textAlign: 'center' }}>
                        <ToggleSwitch checked={lp.isActive} onChange={(v) => {
                          const updated = [...settings.leavePolicy];
                          updated[i] = { ...lp, isActive: v };
                          patch('leavePolicy', updated);
                        }} />
                      </td>
                      <td className="hrms-td">
                        <button onClick={() => patch('leavePolicy', settings.leavePolicy.filter((_, j) => j !== i))}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-semantics-red-6)', padding: '0.2rem' }}>
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* General work policy */}
            <div className="hrms-card" style={{ padding: '1.6rem' }}>
              <h3 style={{ margin: '0 0 1.2rem', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-14)', color: 'var(--color-neutral-10)' }}>Work Policy</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.2rem' }}>
                <SF label="Working Days / Week">
                  <input type="number" min={1} max={7} value={settings.workingDaysPerWeek}
                    onChange={(e) => patch('workingDaysPerWeek', Number(e.target.value))} className="hrms-input" />
                </SF>
                <SF label="Probation Period (days)">
                  <input type="number" min={0} value={settings.probationPeriodDays}
                    onChange={(e) => patch('probationPeriodDays', Number(e.target.value))} className="hrms-input" />
                </SF>
                <SF label="Notice Period (days)">
                  <input type="number" min={0} value={settings.noticePeriodDays}
                    onChange={(e) => patch('noticePeriodDays', Number(e.target.value))} className="hrms-input" />
                </SF>
              </div>
            </div>
          </div>
        )}

        {/* ── SALARY BANDS ─────────────────────────────────────────── */}
        {tab === 'salary' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            <div className="hrms-card" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '1.2rem 1.6rem', borderBottom: '1px solid var(--color-stroke)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-14)', color: 'var(--color-neutral-10)' }}>Salary Bands</h3>
                <button onClick={() => patch('salaryBands', [...settings.salaryBands, { band: 'L4', minBase: 300000, maxBase: 600000, travelAllowance: 4000 }])}
                  className="hrms-btn-ghost" style={{ fontSize: 11 }}><Plus size={12} /> Add Band</button>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Band', 'Min Base (₹)', 'Max Base (₹)', 'Travel Allowance (₹)', ''].map((h) => (
                      <th key={h} className="hrms-th">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {settings.salaryBands.map((band, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--color-stroke)' }}>
                      <td className="hrms-td">
                        <input value={band.band} onChange={(e) => {
                          const updated = [...settings.salaryBands];
                          updated[i] = { ...band, band: e.target.value };
                          patch('salaryBands', updated);
                        }} className="hrms-input" style={{ width: 80, fontFamily: 'var(--font-jk-bd)', fontWeight: 700 }} />
                      </td>
                      {['minBase','maxBase','travelAllowance'].map((key) => (
                        <td key={key} className="hrms-td">
                          <input type="number" min={0} value={band[key as keyof SalaryBand] as number}
                            onChange={(e) => {
                              const updated = [...settings.salaryBands];
                              updated[i] = { ...band, [key]: Number(e.target.value) };
                              patch('salaryBands', updated);
                            }} className="hrms-input" style={{ width: 120 }} />
                        </td>
                      ))}
                      <td className="hrms-td">
                        <button onClick={() => patch('salaryBands', settings.salaryBands.filter((_, j) => j !== i))}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-semantics-red-6)', padding: '0.2rem' }}>
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── PAYROLL FORMULA ──────────────────────────────────────── */}
        {tab === 'payroll' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.2rem' }}>
            <div className="hrms-card" style={{ padding: '1.6rem' }}>
              <h3 style={{ margin: '0 0 1.2rem', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-14)', color: 'var(--color-neutral-10)' }}>Salary Formula</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem' }}>
                <SF label="Basic (% of Gross)">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <input type="number" min={0} max={100} value={basicPercent} onChange={(e) => patchFormula('basicPercent', Number(e.target.value))} className="hrms-input" style={{ flex: 1 }} />
                    <span style={{ color: 'var(--color-neutral-7)' }}>%</span>
                  </div>
                </SF>
                <SF label="HRA (% of Gross)">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <input type="number" min={0} max={100} value={hraPercent} onChange={(e) => patchFormula('hraPercent', Number(e.target.value))} className="hrms-input" style={{ flex: 1 }} />
                    <span style={{ color: 'var(--color-neutral-7)' }}>%</span>
                  </div>
                </SF>
                <SF label="Medical Allowance (₹ fixed)">
                  <input type="number" min={0} value={medicalAllowance} onChange={(e) => patchFormula('medicalAllowance', Number(e.target.value))} className="hrms-input" />
                </SF>
                <SF label="Professional Tax (₹/month)">
                  <input type="number" min={0} value={profTax} onChange={(e) => patchFormula('profTax', Number(e.target.value))} className="hrms-input" />
                </SF>
                <SF label="Employee PF (% of Basic)">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <input type="number" min={0} max={100} value={pfPercent} onChange={(e) => patchFormula('pfPercent', Number(e.target.value))} className="hrms-input" style={{ flex: 1 }} />
                    <span style={{ color: 'var(--color-neutral-7)' }}>%</span>
                  </div>
                </SF>
              </div>
              <p style={{ margin: '1.2rem 0 0', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
                Special Allowance = Gross − Basic − HRA − Medical − Travel (auto-calculated)
              </p>
            </div>

            {/* Live preview */}
            <div className="hrms-card" style={{ padding: '1.6rem' }}>
              <h3 style={{ margin: '0 0 1rem', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-14)', color: 'var(--color-neutral-10)' }}>
                Preview — ₹55,000 Gross
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {[
                  { label: 'Basic', value: basic, color: 'var(--color-neutral-10)' },
                  { label: 'HRA', value: hra, color: 'var(--color-neutral-10)' },
                  { label: 'Medical Allowance', value: medicalAllowance, color: 'var(--color-neutral-10)' },
                  { label: 'Travel Allowance', value: ta, color: 'var(--color-neutral-10)' },
                  { label: 'Special Allowance', value: sa, color: 'var(--color-neutral-10)' },
                ].map((row) => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: '1px dashed var(--color-stroke)' }}>
                    <span style={{ fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-7)' }}>{row.label}</span>
                    <span style={{ fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: row.color }}>₹{Math.round(row.value).toLocaleString('en-IN')}</span>
                  </div>
                ))}
                <div style={{ padding: '0.6rem 0', borderTop: '2px solid var(--color-stroke)', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 700 }}>Gross</span>
                  <span style={{ fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 700 }}>₹55,000</span>
                </div>
                {[
                  { label: `PF (${pfPercent}% of Basic)`, value: -epf },
                  { label: 'Prof Tax', value: -profTax },
                ].map((row) => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0' }}>
                    <span style={{ fontSize: 'var(--text-fs-12)', color: 'var(--color-semantics-red-6)' }}>{row.label}</span>
                    <span style={{ fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-semantics-red-6)' }}>−₹{Math.round(-row.value).toLocaleString('en-IN')}</span>
                  </div>
                ))}
                <div style={{ padding: '0.6rem 0', borderTop: '2px solid var(--color-vr-blue-6)', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 'var(--text-fs-14)', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, color: 'var(--color-vr-blue-6)' }}>Net Pay</span>
                  <span style={{ fontSize: 'var(--text-fs-14)', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, color: 'var(--color-vr-blue-6)' }}>₹{Math.round(net).toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── SHIFT TYPES ──────────────────────────────────────────── */}
        {tab === 'shifts' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            <div className="hrms-card" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '1.2rem 1.6rem', borderBottom: '1px solid var(--color-stroke)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-14)', color: 'var(--color-neutral-10)' }}>Shift Types</h3>
                <button onClick={() => setAddingShift((v) => !v)} className="hrms-btn-primary" style={{ fontSize: 11 }}><Plus size={12} /> Add Shift</button>
              </div>

              {addingShift && (
                <div style={{ padding: '1.2rem 1.6rem', borderBottom: '1px solid var(--color-stroke)', background: 'var(--color-neutral-2)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
                    <SF label="Name"><input value={shiftForm.name} onChange={(e) => setShiftForm({ ...shiftForm, name: e.target.value })} className="hrms-input" placeholder="VR General" /></SF>
                    <SF label="Code"><input value={shiftForm.code} onChange={(e) => setShiftForm({ ...shiftForm, code: e.target.value.toUpperCase() })} className="hrms-input" placeholder="VR-GEN" /></SF>
                    <SF label="Grace Period (min)"><input type="number" min={0} value={shiftForm.gracePeriodMinutes} onChange={(e) => setShiftForm({ ...shiftForm, gracePeriodMinutes: Number(e.target.value) })} className="hrms-input" /></SF>
                    <SF label="Start Time"><input type="time" value={shiftForm.startTime} onChange={(e) => setShiftForm({ ...shiftForm, startTime: e.target.value })} className="hrms-input" /></SF>
                    <SF label="End Time"><input type="time" value={shiftForm.endTime} onChange={(e) => setShiftForm({ ...shiftForm, endTime: e.target.value })} className="hrms-input" /></SF>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', paddingTop: 20 }}>
                      <input type="checkbox" id="isWfh" checked={shiftForm.isWfh} onChange={(e) => setShiftForm({ ...shiftForm, isWfh: e.target.checked })} />
                      <label htmlFor="isWfh" style={{ fontSize: 'var(--text-fs-12)', cursor: 'pointer' }}>WFH shift</label>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'flex-end' }}>
                    <button onClick={() => setAddingShift(false)} className="hrms-btn-ghost">Cancel</button>
                    <button onClick={addShift} disabled={shiftSaving} className="hrms-btn-primary">
                      {shiftSaving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Create
                    </button>
                  </div>
                </div>
              )}

              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['Code','Name','Start','End','Grace','WFH'].map((h) => <th key={h} className="hrms-th">{h}</th>)}</tr></thead>
                <tbody>
                  {shifts.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>No shift types defined yet</td></tr>}
                  {shifts.map((s) => (
                    <tr key={s._id} style={{ borderBottom: '1px solid var(--color-stroke)' }}>
                      <td className="hrms-td"><span style={{ fontFamily: 'var(--font-in-sb)', fontWeight: 700, color: 'var(--color-vr-blue-6)' }}>{s.code}</span></td>
                      <td className="hrms-td">{s.name}</td>
                      <td className="hrms-td">{s.startTime}</td>
                      <td className="hrms-td">{s.endTime}</td>
                      <td className="hrms-td">{s.gracePeriodMinutes} min</td>
                      <td className="hrms-td">
                        {s.isWfh ? <CheckCircle size={14} style={{ color: 'var(--color-semantics-green-7)' }} /> : <span style={{ color: 'var(--color-neutral-5)' }}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── HOLIDAYS ─────────────────────────────────────────────── */}
        {tab === 'holidays' && (
          <div className="hrms-card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '1.2rem 1.6rem', borderBottom: '1px solid var(--color-stroke)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-14)', color: 'var(--color-neutral-10)' }}>
                Holiday Calendar · {new Date().getFullYear()}
              </h3>
              <button onClick={() => patch('holidays', [...settings.holidays, { date: new Date().toISOString().slice(0, 10), name: 'New Holiday', type: 'national' }])}
                className="hrms-btn-ghost" style={{ fontSize: 11 }}><Plus size={12} /> Add Holiday</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Date','Holiday Name','Type',''].map((h) => <th key={h} className="hrms-th">{h}</th>)}</tr></thead>
              <tbody>
                {settings.holidays.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>No holidays configured. Click &quot;Add Holiday&quot; to start.</td></tr>}
                {settings.holidays.map((h, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--color-stroke)' }}>
                    <td className="hrms-td">
                      <input type="date" value={h.date.slice(0, 10)} onChange={(e) => {
                        const updated = [...settings.holidays];
                        updated[i] = { ...h, date: e.target.value };
                        patch('holidays', updated);
                      }} className="hrms-input" style={{ width: 150 }} />
                    </td>
                    <td className="hrms-td">
                      <input value={h.name} onChange={(e) => {
                        const updated = [...settings.holidays];
                        updated[i] = { ...h, name: e.target.value };
                        patch('holidays', updated);
                      }} className="hrms-input" style={{ width: 240 }} />
                    </td>
                    <td className="hrms-td">
                      <select value={h.type} onChange={(e) => {
                        const updated = [...settings.holidays];
                        updated[i] = { ...h, type: e.target.value };
                        patch('holidays', updated);
                      }} className="hrms-input" style={{ width: 130 }}>
                        {HOLIDAY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                    <td className="hrms-td">
                      <button onClick={() => patch('holidays', settings.holidays.filter((_, j) => j !== i))}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-semantics-red-6)', padding: '0.2rem' }}>
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── EXPENSE TYPES ────────────────────────────────────────── */}
        {tab === 'expenses' && (
          <div className="hrms-card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '1.2rem 1.6rem', borderBottom: '1px solid var(--color-stroke)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-14)', color: 'var(--color-neutral-10)' }}>Expense Categories</h3>
              <button onClick={() => patch('expenseTypes', [...settings.expenseTypes, { name: 'New Category', description: '', isActive: true }])}
                className="hrms-btn-ghost" style={{ fontSize: 11 }}><Plus size={12} /> Add Category</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Category Name','Description','Active',''].map((h) => <th key={h} className="hrms-th">{h}</th>)}</tr></thead>
              <tbody>
                {settings.expenseTypes.map((et, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--color-stroke)' }}>
                    <td className="hrms-td">
                      <input value={et.name} onChange={(e) => {
                        const updated = [...settings.expenseTypes];
                        updated[i] = { ...et, name: e.target.value };
                        patch('expenseTypes', updated);
                      }} className="hrms-input" style={{ width: 220 }} />
                    </td>
                    <td className="hrms-td">
                      <input value={et.description} onChange={(e) => {
                        const updated = [...settings.expenseTypes];
                        updated[i] = { ...et, description: e.target.value };
                        patch('expenseTypes', updated);
                      }} className="hrms-input" placeholder="Optional description" style={{ width: 280 }} />
                    </td>
                    <td className="hrms-td" style={{ textAlign: 'center' }}>
                      <ToggleSwitch checked={et.isActive} onChange={(v) => {
                        const updated = [...settings.expenseTypes];
                        updated[i] = { ...et, isActive: v };
                        patch('expenseTypes', updated);
                      }} />
                    </td>
                    <td className="hrms-td">
                      <button onClick={() => patch('expenseTypes', settings.expenseTypes.filter((_, j) => j !== i))}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-semantics-red-6)', padding: '0.2rem' }}>
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── OFFBOARDING TEMPLATE ─────────────────────────────────── */}
        {tab === 'offboarding' && (
          <div className="hrms-card" style={{ padding: '1.6rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
              <h3 style={{ margin: 0, fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-14)', color: 'var(--color-neutral-10)' }}>Default Offboarding Checklist</h3>
              <button onClick={() => patch('offboardingTemplate', [...settings.offboardingTemplate, ''])}
                className="hrms-btn-ghost" style={{ fontSize: 11 }}><Plus size={12} /> Add Task</button>
            </div>
            <p style={{ margin: '0 0 1.2rem', color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
              These tasks are auto-populated whenever a new separation is initiated.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {settings.offboardingTemplate.map((task, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span style={{ color: 'var(--color-neutral-6)', fontSize: 'var(--text-fs-12)', width: 24, textAlign: 'right', flexShrink: 0 }}>{i + 1}.</span>
                  <input value={task} onChange={(e) => {
                    const updated = [...settings.offboardingTemplate];
                    updated[i] = e.target.value;
                    patch('offboardingTemplate', updated);
                  }} className="hrms-input" style={{ flex: 1 }} />
                  <button onClick={() => patch('offboardingTemplate', settings.offboardingTemplate.filter((_, j) => j !== i))}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-semantics-red-6)', padding: '0.2rem', flexShrink: 0 }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* Sticky save bar */}
      {dirty && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 30,
          padding: '1rem 2rem',
          background: 'var(--color-neutral-10)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          boxShadow: '0 -2px 8px rgba(0,0,0,0.15)',
        }}>
          <p style={{ margin: 0, color: 'var(--color-neutral-4)', fontSize: 'var(--text-fs-12)' }}>
            <AlertCircle size={13} style={{ display: 'inline', marginRight: 4 }} />
            Unsaved changes to HR configuration.
          </p>
          <div style={{ display: 'flex', gap: '0.8rem' }}>
            <button onClick={() => { load(); setDirty(false); }} className="hrms-btn-ghost"
              style={{ color: 'var(--color-neutral-4)', borderColor: 'var(--color-neutral-8)' }}>
              <RefreshCw size={12} /> Discard
            </button>
            <button onClick={save} disabled={saving} className="hrms-btn-primary">
              {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
              {saving ? 'Saving…' : 'Save HR Settings'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function SF({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', marginBottom: 4, color: 'var(--color-neutral-8)', fontSize: 10, fontFamily: 'var(--font-in-sb)', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase' }}>{label}</label>
      {children}
    </div>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      style={{ width: 36, height: 20, borderRadius: 99, border: 'none', cursor: 'pointer', background: checked ? 'var(--color-vr-blue-6)' : 'var(--color-neutral-5)', position: 'relative', transition: 'background 150ms ease', flexShrink: 0 }}>
      <span style={{ position: 'absolute', top: 2, left: checked ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: 'var(--color-neutral-1)', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 150ms ease' }} />
    </button>
  );
}
