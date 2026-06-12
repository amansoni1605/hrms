'use client';

import { useRef, useState } from 'react';
import {
  X, Download, Upload, AlertCircle, CheckCircle2,
  AlertTriangle, FileSpreadsheet, ChevronRight, Loader2,
} from 'lucide-react';

// ─── Template definition ──────────────────────────────────────────────────────
const COLUMNS = [
  { key: 'fullName',        label: 'Full Name *',        example: 'Priya Sharma',       required: true  },
  { key: 'email',           label: 'Email *',            example: 'priya@company.in',   required: true  },
  { key: 'jobTitle',        label: 'Job Title *',        example: 'Software Engineer',  required: true  },
  { key: 'departmentName',  label: 'Department Name *',  example: 'Technology',         required: true  },
  { key: 'employmentType',  label: 'Employment Type *',  example: 'full_time',          required: true  },
  { key: 'countryCode',     label: 'Country Code *',     example: 'IN',                 required: true  },
  { key: 'hireDate',        label: 'Hire Date *',        example: '2026-06-01',         required: true  },
  { key: 'baseSalary',      label: 'Base Salary',        example: '800000',             required: false },
  { key: 'role',            label: 'Role',               example: 'employee',           required: false },
  { key: 'salaryBand',      label: 'Salary Band',        example: 'L2',                 required: false },
  { key: 'managerEmail',    label: 'Manager Email',      example: 'mgr@company.in',     required: false },
  { key: 'phone',           label: 'Phone',              example: '+91-9876543210',     required: false },
  { key: 'timezone',        label: 'Timezone',           example: 'Asia/Kolkata',       required: false },
  { key: 'currencyCode',    label: 'Currency',           example: 'INR',                required: false },
  { key: 'initialPassword', label: 'Initial Password',   example: 'Welcome@1234',       required: false },
];

const SAMPLE_ROWS = [
  ['Priya Sharma',  'priya.sharma@company.in',  'Software Engineer',     'Technology',         'full_time', 'IN', '2026-06-01', '800000',  'employee',         'L2', 'mgr@company.in',    '+91-9876543210', 'Asia/Kolkata', 'INR', 'Welcome@1234'],
  ['Ravi Kumar',    'ravi.kumar@company.in',    'Product Manager',       'Product Management', 'full_time', 'IN', '2026-05-15', '1200000', 'employee',         'L3', '',                  '',               'Asia/Kolkata', 'INR', ''],
  ['Sneha Joshi',   'sneha.joshi@company.in',   'HR Business Partner',   'Human Resources',    'full_time', 'IN', '2026-06-10', '900000',  'hr_manager',       'L3', '',                  '',               'Asia/Kolkata', 'INR', ''],
  ['Amit Verma',    'amit.verma@company.in',    'Payroll Specialist',    'Finance & Accounts', 'full_time', 'IN', '2026-04-01', '700000',  'payroll_officer',  'L2', '',                  '',               'Asia/Kolkata', 'INR', ''],
];

function buildCsv(): string {
  const header = COLUMNS.map((c) => c.label).join(',');
  const rows   = SAMPLE_ROWS.map((r) => r.map((v) => `"${v}"`).join(','));
  return [header, ...rows].join('\n');
}

function downloadTemplate() {
  const blob = new Blob([buildCsv()], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'employee_bulk_import_template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ─── CSV parser (handles quoted fields) ──────────────────────────────────────
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const fields: string[] = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === ',' && !inQ) {
        fields.push(cur.trim()); cur = '';
      } else {
        cur += ch;
      }
    }
    fields.push(cur.trim());
    rows.push(fields);
  }
  return rows;
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface ParsedRow {
  [key: string]: string;
  _rowNum: string;
  _errors: string;
}

interface RowResult {
  row:          number;
  email:        string;
  employeeCode?: string;
  status:       'created' | 'skipped' | 'error';
  reason?:      string;
}

interface Props {
  open:      boolean;
  onClose:   () => void;
  onCreated: () => void;
}

type Step = 'upload' | 'preview' | 'result';

// ─── Component ────────────────────────────────────────────────────────────────
export function BulkImportModal({ open, onClose, onCreated }: Props) {
  const fileRef             = useRef<HTMLInputElement>(null);
  const [step, setStep]     = useState<Step>('upload');
  const [rows, setRows]     = useState<ParsedRow[]>([]);
  const [loading, setLoad]  = useState(false);
  const [results, setRes]   = useState<RowResult[]>([]);
  const [summary, setSumm]  = useState({ created: 0, skipped: 0, errors: 0 });
  const [fileErr, setFErr]  = useState('');

  if (!open) return null;

  const reset = () => { setStep('upload'); setRows([]); setRes([]); setFErr(''); };

  // ── Parse uploaded file ────────────────────────────────────────────────────
  const handleFile = (file: File) => {
    setFErr('');
    if (!file.name.endsWith('.csv')) { setFErr('Please upload a .csv file.'); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text   = e.target?.result as string;
      const parsed = parseCsv(text);
      if (parsed.length < 2) { setFErr('File is empty or has no data rows.'); return; }

      // First row = header, strip asterisks/spaces for matching
      const headers = parsed[0].map((h) => {
        const col = COLUMNS.find((c) =>
          c.label.replace(' *', '').trim().toLowerCase() === h.replace(' *', '').trim().toLowerCase()
        );
        return col?.key ?? h.trim().toLowerCase().replace(/\s+/g, '_');
      });

      const dataRows: ParsedRow[] = parsed.slice(1).map((r, idx) => {
        const obj: ParsedRow = { _rowNum: String(idx + 2), _errors: '' };
        headers.forEach((h, i) => { obj[h] = r[i] ?? ''; });

        // Client-side validation
        const missing = COLUMNS.filter((c) => c.required && !obj[c.key]?.trim()).map((c) => c.key);
        if (missing.length) obj._errors = `Missing: ${missing.join(', ')}`;

        const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (obj.email && !EMAIL_RE.test(obj.email)) {
          obj._errors = [obj._errors, 'Invalid email'].filter(Boolean).join('; ');
        }

        const VALID_TYPES = ['full_time','part_time','contractor','intern','advisor'];
        if (obj.employmentType && !VALID_TYPES.includes(obj.employmentType.trim())) {
          obj._errors = [obj._errors, `employmentType must be: ${VALID_TYPES.join('/')}`].filter(Boolean).join('; ');
        }

        return obj;
      }).filter((r) => Object.values(r).some((v, i) => i > 1 && v !== ''));

      if (dataRows.length === 0) { setFErr('No data rows found after the header.'); return; }
      setRows(dataRows);
      setStep('preview');
    };
    reader.readAsText(file);
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const submit = async () => {
    const valid = rows.filter((r) => !r._errors);
    if (!valid.length) return;
    setLoad(true);
    try {
      const payload = valid.map((r) => ({
        fullName:        r.fullName,
        email:           r.email,
        jobTitle:        r.jobTitle,
        departmentName:  r.departmentName,
        employmentType:  r.employmentType,
        countryCode:     r.countryCode,
        hireDate:        r.hireDate,
        baseSalary:      r.baseSalary ? Number(r.baseSalary) : 0,
        role:            r.role        || undefined,
        salaryBand:      r.salaryBand  || undefined,
        managerEmail:    r.managerEmail || undefined,
        phone:           r.phone       || undefined,
        timezone:        r.timezone    || undefined,
        currencyCode:    r.currencyCode || undefined,
        initialPassword: r.initialPassword || undefined,
      }));

      const res  = await fetch('/api/ws/employees/bulk', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ rows: payload }),
      });
      const data = await res.json();
      setSumm({ created: data.created ?? 0, skipped: data.skipped ?? 0, errors: data.errors ?? 0 });
      setRes(data.results ?? []);
      setStep('result');
      if ((data.created ?? 0) > 0) onCreated();
    } finally {
      setLoad(false);
    }
  };

  // ── Styles ─────────────────────────────────────────────────────────────────
  const invalidRows = rows.filter((r) => r._errors).length;
  const validRows   = rows.length - invalidRows;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem',
    }}>
      <div className="hrms-card" style={{
        width: '100%', maxWidth: 860,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        padding: 0, overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '1.4rem 1.8rem', borderBottom: '1px solid var(--color-stroke)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
            <FileSpreadsheet size={18} style={{ color: 'var(--color-vr-blue-6)' }} />
            <div>
              <h2 style={{ margin: 0, fontSize: 'var(--text-fs-16)', fontFamily: 'var(--font-jk-bd)', color: 'var(--color-neutral-10)' }}>
                Bulk Import Employees
              </h2>
              <p style={{ margin: 0, fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-7)' }}>
                Upload a CSV file to add multiple employees at once
              </p>
            </div>
          </div>
          <button onClick={() => { reset(); onClose(); }} className="hrms-btn-ghost" style={{ padding: '0.4rem' }}>
            <X size={16} />
          </button>
        </div>

        {/* Stepper */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.4rem',
          padding: '0.8rem 1.8rem', borderBottom: '1px solid var(--color-stroke)',
          background: 'var(--color-neutral-2)', flexShrink: 0,
        }}>
          {(['upload','preview','result'] as Step[]).map((s, idx) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%', display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 11,
                fontFamily: 'var(--font-in-sb)', fontWeight: 600,
                background: step === s ? 'var(--color-vr-blue-6)' : (
                  ['upload','preview','result'].indexOf(step) > idx ? 'var(--color-semantics-green-6)' : 'var(--color-neutral-4)'
                ),
                color: step === s || ['upload','preview','result'].indexOf(step) > idx ? '#fff' : 'var(--color-neutral-7)',
              }}>{idx + 1}</div>
              <span style={{
                fontSize: 11, fontFamily: 'var(--font-in-sb)', fontWeight: 600,
                color: step === s ? 'var(--color-neutral-10)' : 'var(--color-neutral-6)',
                textTransform: 'capitalize',
              }}>{s === 'upload' ? 'Upload File' : s === 'preview' ? 'Preview & Validate' : 'Results'}</span>
              {idx < 2 && <ChevronRight size={12} style={{ color: 'var(--color-neutral-5)' }} />}
            </div>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.6rem 1.8rem' }} className="custom-scroll">

          {/* ── Step 1: Upload ─────────────────────────────────────────────── */}
          {step === 'upload' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
              {/* Template download */}
              <div style={{
                padding: '1.2rem 1.4rem', borderRadius: '0.8rem',
                background: 'var(--color-vr-blue-1)', border: '1px solid #B9C9E1',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div>
                  <p style={{ margin: 0, fontFamily: 'var(--font-in-sb)', fontWeight: 600, fontSize: 'var(--text-fs-13)', color: 'var(--color-vr-blue-8)' }}>
                    Download the CSV template
                  </p>
                  <p style={{ margin: '0.2rem 0 0 0', fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-7)' }}>
                    Includes headers, data types, and 4 sample rows showing all role types
                  </p>
                </div>
                <button onClick={downloadTemplate} className="hrms-btn-primary" style={{ whiteSpace: 'nowrap', padding: '0.7rem 1.2rem' }}>
                  <Download size={13} /> Download Template
                </button>
              </div>

              {/* Format reference */}
              <div>
                <p style={{ margin: '0 0 0.6rem 0', fontSize: 11, fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-8)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Column Reference
                </p>
                <div style={{ borderRadius: '0.8rem', border: '1px solid var(--color-stroke)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-fs-12)' }}>
                    <thead>
                      <tr style={{ background: 'var(--color-neutral-2)' }}>
                        {['Column', 'Required', 'Allowed values / Example'].map((h) => (
                          <th key={h} style={{ padding: '0.5rem 0.8rem', textAlign: 'left', fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-8)', borderBottom: '1px solid var(--color-stroke)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ['fullName',        'Yes', 'Any string — e.g. "Priya Sharma"'],
                        ['email',           'Yes', 'Valid work email'],
                        ['jobTitle',        'Yes', 'Any string — e.g. "Software Engineer"'],
                        ['departmentName',  'Yes', 'Must match an existing department exactly'],
                        ['employmentType',  'Yes', 'full_time · part_time · contractor · intern · advisor'],
                        ['countryCode',     'Yes', '2-letter ISO — e.g. IN, US, GB'],
                        ['hireDate',        'Yes', 'YYYY-MM-DD — e.g. 2026-06-01'],
                        ['baseSalary',      'No',  'Number (annual, in local currency) — e.g. 800000'],
                        ['role',            'No',  'employee · hr_manager · payroll_officer · compliance_officer (default: employee)'],
                        ['salaryBand',      'No',  'L1 · L2 · L3 · L4 · L5'],
                        ['managerEmail',    'No',  'Email of an existing employee who is their manager'],
                        ['phone',           'No',  'e.g. +91-9876543210'],
                        ['timezone',        'No',  'IANA — e.g. Asia/Kolkata (default: UTC)'],
                        ['currencyCode',    'No',  '3-letter ISO — e.g. INR, USD (default: INR)'],
                        ['initialPassword', 'No',  'If blank, defaults to Welcome@123'],
                      ].map(([col, req, desc]) => (
                        <tr key={col} style={{ borderBottom: '1px solid var(--color-stroke)' }}>
                          <td style={{ padding: '0.45rem 0.8rem', fontFamily: 'monospace', color: 'var(--color-vr-blue-7)', whiteSpace: 'nowrap' }}>{col}</td>
                          <td style={{ padding: '0.45rem 0.8rem', textAlign: 'center' }}>
                            {req === 'Yes'
                              ? <span style={{ color: 'var(--color-semantics-red-6)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, fontSize: 11 }}>Yes</span>
                              : <span style={{ color: 'var(--color-neutral-6)', fontSize: 11 }}>No</span>}
                          </td>
                          <td style={{ padding: '0.45rem 0.8rem', color: 'var(--color-neutral-8)' }}>{desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Drop zone */}
              <div>
                <p style={{ margin: '0 0 0.6rem 0', fontSize: 11, fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-8)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Upload your file
                </p>
                {fileErr && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.6rem 0.8rem', borderRadius: '0.6rem', background: 'var(--color-semantics-red-1)', color: 'var(--color-semantics-red-7)', fontSize: 'var(--text-fs-12)', marginBottom: '0.8rem' }}>
                    <AlertCircle size={13} />{fileErr}
                  </div>
                )}
                <div
                  style={{
                    border: '2px dashed var(--color-stroke)', borderRadius: '1rem',
                    padding: '3rem 2rem', textAlign: 'center', cursor: 'pointer',
                    background: 'var(--color-neutral-2)',
                    transition: 'border-color 150ms',
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload size={28} style={{ color: 'var(--color-neutral-5)', marginBottom: '0.8rem' }} />
                  <p style={{ margin: 0, fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-8)' }}>
                    Drag & drop your CSV here, or click to browse
                  </p>
                  <p style={{ margin: '0.3rem 0 0', fontSize: 'var(--text-fs-12)', color: 'var(--color-neutral-6)' }}>
                    .csv only · max 500 rows
                  </p>
                  <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Preview ────────────────────────────────────────────── */}
          {step === 'preview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Summary bar */}
              <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
                <div style={{ padding: '0.6rem 1rem', borderRadius: '0.6rem', background: 'var(--color-semantics-green-1)', border: '1px solid var(--color-semantics-green-3)', fontSize: 'var(--text-fs-12)', color: 'var(--color-semantics-green-7)', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
                  <CheckCircle2 size={12} style={{ marginRight: 4 }} />
                  {validRows} valid row{validRows !== 1 ? 's' : ''} ready to import
                </div>
                {invalidRows > 0 && (
                  <div style={{ padding: '0.6rem 1rem', borderRadius: '0.6rem', background: 'var(--color-semantics-red-1)', border: '1px solid var(--color-semantics-red-2)', fontSize: 'var(--text-fs-12)', color: 'var(--color-semantics-red-7)', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
                    <AlertCircle size={12} style={{ marginRight: 4 }} />
                    {invalidRows} row{invalidRows !== 1 ? 's' : ''} with errors (will be skipped)
                  </div>
                )}
              </div>

              {/* Table */}
              <div style={{ borderRadius: '0.8rem', border: '1px solid var(--color-stroke)', overflow: 'auto', maxHeight: 400 }} className="custom-scroll">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-fs-12)', whiteSpace: 'nowrap' }}>
                  <thead>
                    <tr style={{ background: 'var(--color-neutral-2)', position: 'sticky', top: 0 }}>
                      <th style={thStyle}>#</th>
                      <th style={thStyle}>Status</th>
                      {['fullName','email','jobTitle','departmentName','employmentType','countryCode','hireDate','role'].map((k) => (
                        <th key={k} style={thStyle}>{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r._rowNum} style={{
                        borderBottom: '1px solid var(--color-stroke)',
                        background: r._errors ? 'var(--color-semantics-red-1)' : 'transparent',
                      }}>
                        <td style={tdStyle}>{r._rowNum}</td>
                        <td style={tdStyle}>
                          {r._errors
                            ? <span style={{ color: 'var(--color-semantics-red-6)', fontSize: 11 }} title={r._errors}><AlertCircle size={12} /> Error</span>
                            : <span style={{ color: 'var(--color-semantics-green-6)', fontSize: 11 }}><CheckCircle2 size={12} /> OK</span>}
                        </td>
                        {['fullName','email','jobTitle','departmentName','employmentType','countryCode','hireDate','role'].map((k) => (
                          <td key={k} style={tdStyle}>{r[k] || <span style={{ color: 'var(--color-neutral-5)' }}>—</span>}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {invalidRows > 0 && (
                <div style={{ padding: '0.8rem 1rem', borderRadius: '0.6rem', background: '#FFFBEA', border: '1px solid #F5D547', fontSize: 'var(--text-fs-12)', color: '#7A6200' }}>
                  <AlertTriangle size={12} style={{ marginRight: 4 }} />
                  Rows with errors will be skipped. Fix them in your CSV and re-upload, or proceed to import only the valid rows.
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Results ────────────────────────────────────────────── */}
          {step === 'result' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Summary */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.8rem' }}>
                {[
                  { label: 'Created',  value: summary.created, color: 'var(--color-semantics-green-6)', bg: 'var(--color-semantics-green-1)' },
                  { label: 'Skipped',  value: summary.skipped, color: 'var(--color-neutral-7)',          bg: 'var(--color-neutral-2)' },
                  { label: 'Errors',   value: summary.errors,  color: 'var(--color-semantics-red-6)',    bg: 'var(--color-semantics-red-1)' },
                ].map((s) => (
                  <div key={s.label} style={{ padding: '1rem', borderRadius: '0.8rem', background: s.bg, textAlign: 'center' }}>
                    <p style={{ margin: 0, fontSize: 'var(--text-fs-24)', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, color: s.color }}>{s.value}</p>
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--color-neutral-7)', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Per-row results */}
              <div style={{ borderRadius: '0.8rem', border: '1px solid var(--color-stroke)', overflow: 'auto', maxHeight: 360 }} className="custom-scroll">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-fs-12)' }}>
                  <thead>
                    <tr style={{ background: 'var(--color-neutral-2)', position: 'sticky', top: 0 }}>
                      {['#','Email','Employee Code','Status','Reason'].map((h) => (
                        <th key={h} style={thStyle}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => (
                      <tr key={`${r.row}-${r.email}`} style={{ borderBottom: '1px solid var(--color-stroke)' }}>
                        <td style={tdStyle}>{r.row}</td>
                        <td style={tdStyle}>{r.email}</td>
                        <td style={tdStyle}>{r.employeeCode ?? '—'}</td>
                        <td style={tdStyle}>
                          <span style={{
                            padding: '2px 8px', borderRadius: 99, fontSize: 10,
                            fontFamily: 'var(--font-in-sb)', fontWeight: 600,
                            background: r.status === 'created' ? 'var(--color-semantics-green-1)' : r.status === 'error' ? 'var(--color-semantics-red-1)' : 'var(--color-neutral-3)',
                            color: r.status === 'created' ? 'var(--color-semantics-green-7)' : r.status === 'error' ? 'var(--color-semantics-red-7)' : 'var(--color-neutral-7)',
                          }}>{r.status}</span>
                        </td>
                        <td style={{ ...tdStyle, color: 'var(--color-neutral-7)' }}>{r.reason ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.8rem',
          padding: '1rem 1.8rem', borderTop: '1px solid var(--color-stroke)', flexShrink: 0,
        }}>
          {step === 'upload' && (
            <button onClick={() => { reset(); onClose(); }} className="hrms-btn-ghost">Cancel</button>
          )}
          {step === 'preview' && (
            <>
              <button onClick={() => setStep('upload')} className="hrms-btn-ghost">Back</button>
              <button
                onClick={submit}
                disabled={loading || validRows === 0}
                className="hrms-btn-primary"
                style={{ minWidth: 140 }}
              >
                {loading ? <><Loader2 size={13} className="animate-spin" /> Importing…</> : `Import ${validRows} Employee${validRows !== 1 ? 's' : ''}`}
              </button>
            </>
          )}
          {step === 'result' && (
            <>
              <button onClick={() => { reset(); }} className="hrms-btn-ghost">Import Another</button>
              <button onClick={() => { reset(); onClose(); }} className="hrms-btn-primary">Done</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '0.5rem 0.8rem', textAlign: 'left',
  fontFamily: 'var(--font-in-sb)', fontWeight: 600,
  color: 'var(--color-neutral-8)', fontSize: 11,
  borderBottom: '1px solid var(--color-stroke)',
  whiteSpace: 'nowrap',
};
const tdStyle: React.CSSProperties = {
  padding: '0.45rem 0.8rem', color: 'var(--color-neutral-9)',
};
