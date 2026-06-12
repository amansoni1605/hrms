'use client';

import { useEffect, useRef, useState } from 'react';
import { UserPlus, Loader2, AlertCircle, CheckCircle, Search, X, Building2, CalendarDays } from 'lucide-react';
import { Modal }   from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

// ─────────────────────────────────────────────────────────────────────────────
// AddEmployeeModal — multi-step form to onboard a new employee.
//
// Step 1 — Identity:   Full name, email, phone, date of birth
// Step 2 — Employment: Job title, department, employment type, hire date,
//                      country, manager, salary band
// Step 3 — Compensation: Base salary, variable comp, currency, pay frequency
// Step 4 — Confirm:    Review + submit
//
// On success, shows the generated employee code and temporary password.
// ─────────────────────────────────────────────────────────────────────────────

interface Department { _id: string; name: string; code: string; costCenterCode?: string }
interface ManagerResult { _id: string; employeeCode: string; jobTitle: string; departmentName: string }

export interface AddEmployeeModalProps {
  open:    boolean;
  onClose: () => void;
  onCreated?: (empCode: string) => void;
}

const EMPLOYMENT_TYPES = ['full_time','part_time','contractor','intern','advisor','digital_worker'];
const CURRENCIES       = ['USD','EUR','GBP','INR','AED','SGD','AUD','CAD','JPY'];
const PAY_FREQUENCIES  = ['monthly','semi_monthly','biweekly','weekly'];
const TIMEZONES        = ['UTC','Asia/Kolkata','America/New_York','America/Los_Angeles','Europe/London','Europe/Berlin','Asia/Singapore','Asia/Tokyo','Australia/Sydney'];

interface FormData {
  // Step 1
  fullName:       string;
  email:          string;
  phone:          string;
  personalEmail:  string;
  dateOfBirth:    string;
  // Step 2
  jobTitle:       string;
  departmentId:   string;
  employmentType: string;
  hireDate:       string;
  countryCode:    string;
  timezone:       string;
  managerId:      string;
  managerName:    string;
  salaryBand:     string;
  // Step 3
  baseSalary:     string;
  variableComp:   string;
  currencyCode:   string;
  payFrequency:   string;
  initialPassword:string;
}

const EMPTY_FORM: FormData = {
  fullName: '', email: '', phone: '', personalEmail: '', dateOfBirth: '',
  jobTitle: '', departmentId: '', employmentType: 'full_time',
  hireDate: new Date().toISOString().slice(0, 10),
  countryCode: 'US', timezone: 'UTC', managerId: '', managerName: '',
  salaryBand: '',
  baseSalary: '', variableComp: '', currencyCode: 'USD',
  payFrequency: 'monthly', initialPassword: '',
};

const STEP_LABELS = ['Identity', 'Employment', 'Compensation', 'Review'];

export function AddEmployeeModal({ open, onClose, onCreated }: AddEmployeeModalProps) {
  const [step,     setStep]     = useState(0);
  const [form,     setForm]     = useState<FormData>(EMPTY_FORM);
  const [depts,    setDepts]    = useState<Department[]>([]);
  const [errors,   setErrors]   = useState<Partial<Record<keyof FormData, string>>>({});
  const [submitting, setSubmit] = useState(false);
  const [result,   setResult]   = useState<{ employeeCode: string; userId: string; message: string } | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    fetch('/api/ws/departments')
      .then((r) => r.json())
      .then((d) => setDepts(d.data ?? []))
      .catch(() => setDepts([]));
  }, [open]);

  const set = (key: keyof FormData, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const validateStep = (): boolean => {
    const errs: Partial<Record<keyof FormData, string>> = {};
    if (step === 0) {
      if (!form.fullName.trim())   errs.fullName = 'Required';
      if (!form.email.trim())      errs.email    = 'Required';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
                                   errs.email    = 'Invalid email format';
    }
    if (step === 1) {
      if (!form.jobTitle.trim())    errs.jobTitle    = 'Required';
      if (!form.departmentId)       errs.departmentId = 'Select a department';
      if (!form.hireDate)           errs.hireDate    = 'Required';
      if (!form.countryCode.trim()) errs.countryCode = 'Required';
    }
    if (step === 2) {
      if (!form.baseSalary || isNaN(Number(form.baseSalary)) || Number(form.baseSalary) <= 0)
        errs.baseSalary = 'Must be a positive number';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const next = () => { if (validateStep()) setStep((s) => Math.min(s + 1, 3)); };
  const back = () => { setStep((s) => Math.max(s - 1, 0)); };

  const handleSubmit = async () => {
    if (!validateStep()) return;
    setSubmit(true);
    const selectedDept = depts.find((d) => d._id === form.departmentId);

    const payload: Record<string, unknown> = {
      fullName:        form.fullName.trim(),
      email:           form.email.trim().toLowerCase(),
      phone:           form.phone.trim() || undefined,
      personalEmail:   form.personalEmail.trim() || undefined,
      dateOfBirth:     form.dateOfBirth || undefined,
      jobTitle:        form.jobTitle.trim(),
      departmentId:    form.departmentId,
      departmentName:  selectedDept?.name,
      departmentCode:  selectedDept?.code,
      employmentType:  form.employmentType,
      hireDate:        form.hireDate,
      countryCode:     form.countryCode.trim().toUpperCase().slice(0, 2),
      timezone:        form.timezone,
      managerId:       form.managerId || undefined,
      managerName:     form.managerName.trim() || undefined,
      salaryBand:      form.salaryBand.trim() || undefined,
      baseSalary:      Number(form.baseSalary),
      variableComp:    form.variableComp ? Number(form.variableComp) : undefined,
      currencyCode:    form.currencyCode,
      payFrequency:    form.payFrequency,
      initialPassword: form.initialPassword.trim() || undefined,
    };

    const res  = await fetch('/api/ws/employees', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    const json = await res.json();
    setSubmit(false);

    if (!res.ok) {
      toast.push({ kind: 'error', title: 'Failed to create employee', desc: json.error ?? '' });
      return;
    }

    setResult({
      employeeCode: json.data.employeeCode,
      userId:       json.data.userId,
      message:      json.data.message,
    });
    onCreated?.(json.data.employeeCode);
    toast.push({ kind: 'success', title: `${json.data.employeeCode} created`, ttl: 6000 });
  };

  const handleClose = () => {
    setStep(0); setForm(EMPTY_FORM); setErrors({}); setResult(null);
    onClose();
  };

  const selectedDept = depts.find((d) => d._id === form.departmentId);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={result ? 'Employee Created' : 'Add New Employee'}
      subtitle={result ? undefined : `Step ${step + 1} of 4 — ${STEP_LABELS[step]}`}
      width={560}
      footer={result ? (
        <button onClick={handleClose} className="hrms-btn-primary">Done</button>
      ) : (
        <>
          {step > 0 && (
            <button onClick={back} className="hrms-btn-ghost">Back</button>
          )}
          <button onClick={handleClose} className="hrms-btn-ghost">Cancel</button>
          {step < 3
            ? <button onClick={next} className="hrms-btn-primary">Next →</button>
            : (
              <button onClick={handleSubmit} disabled={submitting} className="hrms-btn-primary">
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                {submitting ? 'Creating…' : 'Create Employee'}
              </button>
            )}
        </>
      )}
    >
      {/* ── Success screen ─────────────────────────────────────────────── */}
      {result ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem', padding: '1.4rem', borderRadius: '1rem', background: 'var(--color-semantics-green-1)', border: '1px solid var(--color-semantics-green-2)' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--color-semantics-green-7)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <CheckCircle size={22} style={{ color: '#fff' }} />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 'var(--text-fs-10)', color: 'var(--color-semantics-green-7)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase' }}>Employee Created</p>
              <h3 style={{ margin: '2px 0 0', fontSize: 'var(--text-fs-20)', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, color: 'var(--color-neutral-10)' }}>
                {result.employeeCode}
              </h3>
            </div>
          </div>

          {/* Onboarding checklist */}
          <div>
            <p style={{ margin: '0 0 0.8rem', fontSize: 'var(--text-fs-10)', color: 'var(--color-neutral-7)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase' }}>Onboarding Checklist</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {[
                { icon: '✓', text: 'Employee record created with encrypted PII', done: true },
                { icon: '✓', text: 'Login account provisioned (role: employee)', done: true },
                { icon: '✓', text: form.managerId ? `Reporting manager assigned` : 'No reporting manager assigned — assign later in employee profile', done: !!form.managerId },
                { icon: '○', text: 'Share login credentials securely with the employee', done: false },
                { icon: '○', text: 'Employee must change password on first login', done: false },
                { icon: '○', text: 'HR to activate status from Pre-hire → Active on join date', done: false },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.8rem', padding: '0.6rem 0.8rem', borderRadius: '0.6rem', background: item.done ? 'var(--color-semantics-green-1)' : 'var(--color-neutral-3)' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: item.done ? 'var(--color-semantics-green-7)' : 'var(--color-neutral-6)', flexShrink: 0, marginTop: 1 }}>{item.icon}</span>
                  <span style={{ fontSize: 'var(--text-fs-12)', color: item.done ? 'var(--color-semantics-green-8)' : 'var(--color-neutral-8)', lineHeight: 1.5 }}>{item.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Credentials box */}
          <div style={{ padding: '1rem 1.2rem', borderRadius: '0.8rem', background: 'var(--color-vr-blue-1)', border: '1px solid var(--color-vr-blue-2)' }}>
            <p style={{ margin: 0, color: 'var(--color-vr-blue-8)', fontSize: 'var(--text-fs-12)', lineHeight: 1.6 }}>
              {result.message}
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* ── Step progress bar ──────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: 4, marginBottom: '1.6rem' }}>
            {STEP_LABELS.map((label, i) => (
              <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{
                  height: 3, borderRadius: 2,
                  background: i <= step ? 'var(--color-vr-blue-6)' : 'var(--color-neutral-4)',
                  transition: 'background 200ms ease',
                }} />
                <p style={{
                  margin: 0, fontSize: 10, textAlign: 'center',
                  fontFamily: i === step ? 'var(--font-in-sb)' : 'var(--font-in-rg)',
                  fontWeight: i === step ? 600 : 400,
                  color: i === step ? 'var(--color-vr-blue-7)' : 'var(--color-neutral-6)',
                }}>
                  {label}
                </p>
              </div>
            ))}
          </div>

          {/* ── Step 0: Identity ────────────────────────────────────────── */}
          {step === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <Field label="Full Name *" error={errors.fullName}>
                <input value={form.fullName} onChange={(e) => set('fullName', e.target.value)}
                       className="hrms-input" placeholder="Priya Sharma" />
              </Field>
              <Field label="Work Email *" error={errors.email}>
                <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)}
                       className="hrms-input" placeholder="priya@acmecorp.com" />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                <Field label="Phone" error={errors.phone}>
                  <input value={form.phone} onChange={(e) => set('phone', e.target.value)}
                         className="hrms-input" placeholder="+1-555-0000000" />
                </Field>
                <Field label="Date of Birth" error={errors.dateOfBirth}>
                  <input type="date" value={form.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)}
                         className="hrms-input" />
                </Field>
              </div>
              <Field label="Personal Email" error={errors.personalEmail}>
                <input type="email" value={form.personalEmail} onChange={(e) => set('personalEmail', e.target.value)}
                       className="hrms-input" placeholder="priya@gmail.com (optional)" />
              </Field>
            </div>
          )}

          {/* ── Step 1: Employment ──────────────────────────────────────── */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <Field label="Job Title *" error={errors.jobTitle}>
                <input value={form.jobTitle} onChange={(e) => set('jobTitle', e.target.value)}
                       className="hrms-input" placeholder="Senior Software Engineer" />
              </Field>
              <Field label="Department *" error={errors.departmentId}>
                <select value={form.departmentId} onChange={(e) => set('departmentId', e.target.value)}
                        className="hrms-input">
                  <option value="">— Select department —</option>
                  {depts.map((d) => (
                    <option key={d._id} value={d._id}>{d.name} ({d.code})</option>
                  ))}
                </select>
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                <Field label="Employment Type *" error={errors.employmentType}>
                  <select value={form.employmentType} onChange={(e) => set('employmentType', e.target.value)}
                          className="hrms-input">
                    {EMPLOYMENT_TYPES.map((t) => (
                      <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Hire Date *" error={errors.hireDate}>
                  <input type="date" value={form.hireDate} onChange={(e) => set('hireDate', e.target.value)}
                         className="hrms-input" />
                </Field>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                <Field label="Country Code *" error={errors.countryCode}>
                  <input value={form.countryCode} onChange={(e) => set('countryCode', e.target.value.toUpperCase().slice(0, 2))}
                         className="hrms-input" placeholder="US" maxLength={2} />
                </Field>
                <Field label="Timezone" error={errors.timezone}>
                  <select value={form.timezone} onChange={(e) => set('timezone', e.target.value)}
                          className="hrms-input">
                    {TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Reporting Manager" error={errors.managerName}>
                <ManagerPicker
                  managerId={form.managerId}
                  managerDisplay={form.managerName}
                  onChange={(id, display) => {
                    set('managerId', id);
                    set('managerName', display);
                  }}
                />
              </Field>
              <Field label="Salary Band" error={errors.salaryBand}>
                <input value={form.salaryBand} onChange={(e) => set('salaryBand', e.target.value)}
                       className="hrms-input" placeholder="IC4, L5…" />
              </Field>
            </div>
          )}

          {/* ── Step 2: Compensation ────────────────────────────────────── */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{
                padding: '0.8rem 1rem', borderRadius: '0.8rem',
                background: 'var(--color-vr-blue-1)',
                border: '1px solid var(--color-vr-blue-2)',
                fontSize: 'var(--text-fs-12)',
                color: 'var(--color-vr-blue-8)',
              }}>
                Compensation values are encrypted at rest with AES-256-GCM.
                They are never stored as plaintext in the database.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.8rem' }}>
                <Field label="Base Salary (annual) *" error={errors.baseSalary}>
                  <input type="number" min="0" value={form.baseSalary}
                         onChange={(e) => set('baseSalary', e.target.value)}
                         className="hrms-input" placeholder="80000" />
                </Field>
                <Field label="Currency" error={errors.currencyCode}>
                  <select value={form.currencyCode} onChange={(e) => set('currencyCode', e.target.value)}
                          className="hrms-input">
                    {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                <Field label="Variable Comp (annual)" error={errors.variableComp}>
                  <input type="number" min="0" value={form.variableComp}
                         onChange={(e) => set('variableComp', e.target.value)}
                         className="hrms-input" placeholder="Optional" />
                </Field>
                <Field label="Pay Frequency" error={errors.payFrequency}>
                  <select value={form.payFrequency} onChange={(e) => set('payFrequency', e.target.value)}
                          className="hrms-input">
                    {PAY_FREQUENCIES.map((f) => (
                      <option key={f} value={f}>{f.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Initial Password (leave blank for Welcome@123)" error={errors.initialPassword}>
                <input type="password" value={form.initialPassword}
                       onChange={(e) => set('initialPassword', e.target.value)}
                       className="hrms-input" placeholder="Optional — defaults to Welcome@123" />
              </Field>
            </div>
          )}

          {/* ── Step 3: Review ──────────────────────────────────────────── */}
          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <ReviewRow label="Full Name"      value={form.fullName} />
              <ReviewRow label="Work Email"     value={form.email} />
              {form.phone        && <ReviewRow label="Phone"          value={form.phone} />}
              {form.dateOfBirth  && <ReviewRow label="Date of Birth"  value={form.dateOfBirth} />}
              <div style={{ height: 1, background: 'var(--color-stroke)', margin: '0.4rem 0' }} />
              <ReviewRow label="Job Title"      value={form.jobTitle} />
              <ReviewRow label="Department"     value={selectedDept ? `${selectedDept.name} (${selectedDept.code})` : '—'} />
              <ReviewRow label="Employment"     value={form.employmentType.replace(/_/g, ' ')} />
              <ReviewRow label="Hire Date"      value={form.hireDate} />
              <ReviewRow label="Country"        value={form.countryCode} />
              <ReviewRow label="Timezone"       value={form.timezone} />
              {form.salaryBand  && <ReviewRow label="Salary Band" value={form.salaryBand} />}
              {form.managerId ? (
                <ReviewRow label="Reporting Manager" value={form.managerName} />
              ) : (
                <ReviewRow label="Reporting Manager" value="Not assigned" />
              )}
              <div style={{ height: 1, background: 'var(--color-stroke)', margin: '0.4rem 0' }} />
              <ReviewRow label="Base Salary"    value={`${form.currencyCode} ${Number(form.baseSalary).toLocaleString()}`} />
              {form.variableComp && <ReviewRow label="Variable Comp" value={`${form.currencyCode} ${Number(form.variableComp).toLocaleString()}`} />}
              <ReviewRow label="Pay Frequency"  value={form.payFrequency.replace(/_/g, ' ')} />
              <div style={{ height: 1, background: 'var(--color-stroke)', margin: '0.4rem 0' }} />
              <div style={{
                padding: '0.8rem 1rem', borderRadius: '0.8rem',
                background: '#FFF6E6', border: '1px solid #FFD891',
                display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
              }}>
                <AlertCircle size={13} style={{ color: 'var(--color-semantics-orange-7)', flexShrink: 0, marginTop: 2 }} />
                <p style={{ margin: 0, color: 'var(--color-semantics-orange-7)', fontSize: 'var(--text-fs-12)' }}>
                  A login account will be created for <strong>{form.email}</strong> with role <strong>employee</strong>.
                  Initial password: <strong>{form.initialPassword || 'Welcome@123'}</strong>.
                  Share credentials securely and instruct the employee to change their password immediately.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Local helpers
// ─────────────────────────────────────────────────────────────────────────────

function Field({
  label, error, children,
}: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{
        display: 'block', marginBottom: 4,
        color: 'var(--color-neutral-8)', fontSize: 10,
        fontFamily: 'var(--font-in-sb)', fontWeight: 600,
        letterSpacing: '0.07em', textTransform: 'uppercase',
      }}>
        {label}
      </label>
      {children}
      {error && (
        <p style={{ margin: '4px 0 0', color: 'var(--color-semantics-red-6)', fontSize: 10 }}>
          {error}
        </p>
      )}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
      <span style={{ color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>{label}</span>
      <span style={{
        color: 'var(--color-neutral-10)', fontSize: 'var(--text-fs-12)',
        fontFamily: 'var(--font-in-sb)', fontWeight: 600, textAlign: 'right',
      }}>
        {value}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ManagerPicker — searchable employee picker that resolves managerId + display
// ─────────────────────────────────────────────────────────────────────────────

function ManagerPicker({
  managerId, managerDisplay, onChange,
}: { managerId: string; managerDisplay: string; onChange: (id: string, display: string) => void }) {
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState<ManagerResult[]>([]);
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef          = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) { setResults([]); setOpen(false); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/ws/employees?search=${encodeURIComponent(trimmed)}&limit=8`);
        const d = await r.json();
        setResults(d.data ?? []);
        setOpen(true);
      } catch { setResults([]); }
      finally  { setLoading(false); }
    }, 280);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const select = (emp: ManagerResult) => {
    onChange(emp._id, `${emp.employeeCode} · ${emp.jobTitle}`);
    setQuery('');
    setOpen(false);
  };

  const clear = () => { onChange('', ''); setQuery(''); };

  if (managerId) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.6rem 1rem', borderRadius: '0.8rem',
        border: '1px solid var(--color-vr-blue-3)',
        background: 'var(--color-vr-blue-1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Building2 size={13} style={{ color: 'var(--color-vr-blue-6)', flexShrink: 0 }} />
          <span style={{ fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-vr-blue-8)' }}>
            {managerDisplay}
          </span>
        </div>
        <button
          type="button"
          onClick={clear}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-neutral-6)', padding: 2, display: 'flex', alignItems: 'center' }}
        >
          <X size={13} />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-neutral-6)', pointerEvents: 'none' }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          className="hrms-input"
          placeholder="Search by code or job title…"
          style={{ paddingLeft: '2.8rem' }}
        />
        {loading && (
          <Loader2 size={13} className="animate-spin" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-neutral-6)' }} />
        )}
      </div>

      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50,
          background: 'var(--color-neutral-1)', border: '1px solid var(--color-stroke)',
          borderRadius: '0.8rem', boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
          maxHeight: 220, overflowY: 'auto',
        }}>
          {results.map((emp) => (
            <button
              key={emp._id}
              type="button"
              onClick={() => select(emp)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: '0.8rem',
                padding: '0.8rem 1rem', background: 'none', border: 'none',
                cursor: 'pointer', textAlign: 'left',
                borderBottom: '1px solid var(--color-neutral-4)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-neutral-3)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
            >
              <span style={{ fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 700, color: 'var(--color-vr-blue-6)', minWidth: 72 }}>
                {emp.employeeCode}
              </span>
              <span style={{ fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-9)' }}>
                {emp.jobTitle}
              </span>
              <span style={{ fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-6)', marginLeft: 'auto' }}>
                {emp.departmentName}
              </span>
            </button>
          ))}
        </div>
      )}

      {open && query.length >= 2 && !loading && results.length === 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50,
          background: 'var(--color-neutral-1)', border: '1px solid var(--color-stroke)',
          borderRadius: '0.8rem', padding: '1rem',
          boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
        }}>
          <p style={{ margin: 0, fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-6)', textAlign: 'center' }}>No employees found</p>
        </div>
      )}
    </div>
  );
}
