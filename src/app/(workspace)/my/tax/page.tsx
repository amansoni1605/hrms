'use client';

import { useEffect, useState, useCallback } from 'react';
import { Calculator, Loader2, TrendingUp, FileText, Info } from 'lucide-react';
import { StatCard }   from '@/components/ui/StatCard';
import { Badge }      from '@/components/ui/Badge';
import { useToast }   from '@/components/ui/Toast';

// ─────────────────────────────────────────────────────────────────────────────
// Types matching the tax engine contract
// ─────────────────────────────────────────────────────────────────────────────

interface TaxField {
  key:          string;
  label:        string;
  description?: string;
  type:         'currency' | 'number' | 'boolean' | 'select';
  options?:     Array<{ value: string; label: string }>;
  maxAmount?:   number;
  section?:     string;
}

interface CountrySchema {
  country:     string;
  displayName: string;
  currency:    string;
  regimes:     string[];
  fields:      TaxField[];
}

interface TaxBreakdown {
  totalDeductions:    number;
  taxableIncome:      number;
  estimatedTax:       number;
  effectiveRate:      number;
  netAnnualIncome:    number;
  netMonthlyIncome:   number;
  brackets:           Array<{ upTo: number; rate: number; taxOnBracket: number }>;
  declarationSavings: Array<{ key: string; label: string; amount: number; taxSaved: number }>;
  totalTaxSaved:      number;
  currency:           string;
  regime:             string;
}

interface CountrySummary { code: string; name: string; currency: string }

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function MyTaxPage() {
  const toast = useToast();
  const [countries,      setCountries]      = useState<CountrySummary[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<string>('IN');
  const [schema,         setSchema]         = useState<CountrySchema | null>(null);
  const [grossIncome,    setGrossIncome]    = useState<string>('1800000');
  const [regime,         setRegime]         = useState<string>('old');
  const [declarations,   setDeclarations]   = useState<Record<string, string | boolean>>({});
  const [breakdown,      setBreakdown]      = useState<TaxBreakdown | null>(null);
  const [computing,      setComputing]      = useState(false);
  const [loadingSchema,  setLoadingSchema]  = useState(true);

  // Load supported countries
  useEffect(() => {
    fetch('/api/me/tax')
      .then((r) => r.json())
      .then((d) => setCountries(d.data ?? []))
      .catch(() => null);
  }, []);

  // Load schema for the selected country
  useEffect(() => {
    setLoadingSchema(true);
    fetch(`/api/me/tax?country=${selectedCountry}`)
      .then((r) => r.json())
      .then((d) => {
        setSchema(d.data);
        if (d.data?.regimes?.[0]) setRegime(d.data.regimes[0]);
        // Reset declarations + adjust default income to the country's typical range
        setDeclarations({});
        setGrossIncome(
          selectedCountry === 'IN' ? '1800000'
        : selectedCountry === 'US' ? '120000'
        : selectedCountry === 'GB' ? '75000'
        : selectedCountry === 'SG' ? '120000'
        : '100000');
        setBreakdown(null);
      })
      .finally(() => setLoadingSchema(false));
  }, [selectedCountry]);

  // Compute on demand
  const handleCompute = useCallback(async () => {
    if (!schema) return;
    const gross = Number(grossIncome);
    if (isNaN(gross) || gross < 0) {
      toast.push({ kind: 'error', title: 'Enter a valid gross annual income' });
      return;
    }
    setComputing(true);

    // Convert declarations to numbers/booleans for the engine
    const parsedDecl: Record<string, number | string | boolean> = {};
    for (const [k, v] of Object.entries(declarations)) {
      if (typeof v === 'boolean') parsedDecl[k] = v;
      else if (v === '' || v === undefined) continue;
      else if (!isNaN(Number(v)))         parsedDecl[k] = Number(v);
      else                                parsedDecl[k] = v;
    }

    const res  = await fetch('/api/me/tax', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        country:           selectedCountry,
        grossAnnualIncome: gross,
        declarations:      parsedDecl,
        regime,
      }),
    });
    const data = await res.json();
    setComputing(false);
    if (!res.ok) {
      toast.push({ kind: 'error', title: 'Computation failed', desc: data.error });
      return;
    }
    setBreakdown(data.data);
  }, [schema, grossIncome, declarations, selectedCountry, regime, toast]);

  // Group fields by section
  const fieldsBySection = schema?.fields.reduce<Record<string, TaxField[]>>((acc, f) => {
    const sec = f.section ?? 'Other';
    if (!acc[sec]) acc[sec] = [];
    acc[sec].push(f);
    return acc;
  }, {}) ?? {};

  const currencySymbol = breakdown?.currency
    ? new Intl.NumberFormat('en', { style: 'currency', currency: breakdown.currency })
        .formatToParts(0).find((p) => p.type === 'currency')?.value ?? breakdown.currency
    : schema?.currency
      ? new Intl.NumberFormat('en', { style: 'currency', currency: schema.currency })
          .formatToParts(0).find((p) => p.type === 'currency')?.value ?? schema.currency
      : '$';

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: breakdown?.currency ?? schema?.currency ?? 'USD',
      maximumFractionDigits: 0,
    }).format(n);

  return (
    <div style={{ padding: '2rem 2.4rem 6rem 2.4rem', maxWidth: 1400, minHeight: 'calc(100vh - 56px)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.6rem' }}>
        <Calculator size={20} style={{ color: 'var(--color-vr-blue-6)' }} />
        <div style={{ flex: 1 }}>
          <h2 style={{
            margin: 0, color: 'var(--color-neutral-10)',
            fontFamily: 'var(--font-jk-bd)', fontWeight: 700,
            fontSize: 'var(--text-fs-20)',
          }}>
            Tax-Saving Investment Studio
          </h2>
          <p style={{ margin: 0, marginTop: 4, color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
            Declare your investments and see real-time take-home projections.
            Supported jurisdictions: {countries.map((c) => c.code).join(' · ')}.
          </p>
        </div>
      </div>

      {/* Country + Regime selector */}
      <div className="hrms-card" style={{ padding: '1.4rem 1.6rem', marginBottom: '1.6rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          <SF label="Country / Jurisdiction">
            <select value={selectedCountry} onChange={(e) => setSelectedCountry(e.target.value)} className="hrms-input">
              {countries.map((c) => (
                <option key={c.code} value={c.code}>{c.name} ({c.currency})</option>
              ))}
            </select>
          </SF>
          {schema && schema.regimes.length > 1 && (
            <SF label="Tax Regime">
              <select value={regime} onChange={(e) => setRegime(e.target.value)} className="hrms-input">
                {schema.regimes.map((r) => (
                  <option key={r} value={r}>{r.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())}</option>
                ))}
              </select>
            </SF>
          )}
          <SF label={`Gross Annual Income (${schema?.currency ?? '—'})`}>
            <input type="number" value={grossIncome} onChange={(e) => setGrossIncome(e.target.value)} className="hrms-input" placeholder="0" />
          </SF>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button onClick={handleCompute} disabled={computing || loadingSchema} className="hrms-btn-primary" style={{ width: '100%' }}>
              {computing ? <Loader2 size={13} className="animate-spin" /> : <TrendingUp size={13} />}
              Compute Tax
            </button>
          </div>
        </div>
      </div>

      {/* Results Strip */}
      {breakdown && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '1rem', marginBottom: '1.6rem' }}>
          <StatCard title="Taxable Income"   value={fmt(breakdown.taxableIncome)}   icon={FileText}    accent="blue"   />
          <StatCard title="Estimated Tax"    value={fmt(breakdown.estimatedTax)}    icon={Calculator}  accent="red"
                    subtitle={`Effective ${(breakdown.effectiveRate * 100).toFixed(1)}%`} />
          <StatCard title="Annual Take-Home" value={fmt(breakdown.netAnnualIncome)} icon={TrendingUp}  accent="green"  />
          <StatCard title="Monthly Take-Home" value={fmt(breakdown.netMonthlyIncome)} icon={TrendingUp} accent="green" />
          <StatCard title="Tax Saved"        value={fmt(breakdown.totalTaxSaved)}   icon={Info}        accent="purple"
                    subtitle="vs no declarations" />
        </div>
      )}

      {/* Two-column: Declarations form + Breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '1.4rem' }}>

        {/* Declarations */}
        <div className="hrms-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.6rem', borderBottom: '1px solid var(--color-stroke)', background: 'var(--color-neutral-2)' }}>
            <h3 className="hrms-section-label" style={{ margin: 0 }}>Investment Declarations</h3>
          </div>
          {loadingSchema ? (
            <div style={{ padding: '3rem', textAlign: 'center' }}>
              <Loader2 size={20} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
            </div>
          ) : !schema ? (
            <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-neutral-7)' }}>
              Schema unavailable
            </p>
          ) : (
            <div style={{ padding: '1.2rem 1.6rem' }}>
              {Object.entries(fieldsBySection).map(([section, fields]) => (
                <div key={section} style={{ marginBottom: '1.4rem' }}>
                  <p className="hrms-section-label" style={{ marginBottom: '0.8rem' }}>{section}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                    {fields.map((f) => (
                      <FieldInput key={f.key} field={f} value={declarations[f.key]}
                                  onChange={(v) => setDeclarations({ ...declarations, [f.key]: v })}
                                  currency={schema.currency} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Breakdown */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          {breakdown && breakdown.declarationSavings.length > 0 && (
            <div className="hrms-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '1rem 1.6rem', borderBottom: '1px solid var(--color-stroke)', background: 'var(--color-neutral-2)' }}>
                <h3 className="hrms-section-label" style={{ margin: 0 }}>Per-Declaration Tax Savings</h3>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-fs-12)' }}>
                <thead>
                  <tr>
                    {['Declaration', 'Amount', 'Tax Saved'].map((h) => (
                      <th key={h} className="hrms-th">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {breakdown.declarationSavings.map((s) => (
                    <tr key={s.key}>
                      <td className="hrms-td">{s.label}</td>
                      <td className="hrms-td" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(s.amount)}</td>
                      <td className="hrms-td">
                        <span className="gain_pill">{fmt(s.taxSaved)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {breakdown && (
            <div className="hrms-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '1rem 1.6rem', borderBottom: '1px solid var(--color-stroke)', background: 'var(--color-neutral-2)' }}>
                <h3 className="hrms-section-label" style={{ margin: 0 }}>Tax Bracket Breakdown</h3>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-fs-12)' }}>
                <thead>
                  <tr>
                    {['Up To', 'Rate', 'Tax on Bracket'].map((h) => (
                      <th key={h} className="hrms-th">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {breakdown.brackets.map((b, i) => (
                    <tr key={i}>
                      <td className="hrms-td" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {b.upTo === Infinity || b.upTo > 9_999_999_999 ? '∞' : fmt(b.upTo)}
                      </td>
                      <td className="hrms-td">
                        <Badge variant="info">{(b.rate * 100).toFixed(b.rate < 0.10 ? 1 : 0)}%</Badge>
                      </td>
                      <td className="hrms-td" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(b.taxOnBracket)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!breakdown && (
            <div className="hrms-card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-neutral-7)' }}>
              <Calculator size={28} style={{ margin: '0 auto 1rem', color: 'var(--color-neutral-5)' }} />
              <p style={{ margin: 0, fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-10)' }}>
                Fill in your declarations
              </p>
              <p style={{ margin: '0.4rem 0 0', fontSize: 'var(--text-fs-12)' }}>
                Click <strong>Compute Tax</strong> to see your bracket-by-bracket breakdown,
                per-declaration savings, and projected take-home.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function SF({ label, children }: { label: string; children: React.ReactNode }) {
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
    </div>
  );
}

function FieldInput({ field, value, onChange, currency }: {
  field:    TaxField;
  value:    string | boolean | undefined;
  onChange: (v: string | boolean) => void;
  currency: string;
}) {
  if (field.type === 'boolean') {
    return (
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', cursor: 'pointer', padding: '0.6rem 0.8rem', borderRadius: '0.6rem', background: 'var(--color-neutral-2)', border: '1px solid var(--color-stroke)' }}>
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
          style={{ accentColor: 'var(--color-vr-blue-6)', marginTop: 2 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, color: 'var(--color-neutral-10)', fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 600 }}>
            {field.label}
          </p>
          {field.description && (
            <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 10 }}>{field.description}</p>
          )}
        </div>
      </label>
    );
  }

  if (field.type === 'select') {
    return (
      <div>
        <label style={{ display: 'block', marginBottom: 3, color: 'var(--color-neutral-8)', fontSize: 11, fontFamily: 'var(--font-in-md)', fontWeight: 500 }}>
          {field.label}
        </label>
        <select value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} className="hrms-input">
          {field.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {field.description && (
          <p style={{ margin: '3px 0 0', color: 'var(--color-neutral-7)', fontSize: 10 }}>{field.description}</p>
        )}
      </div>
    );
  }

  // Numeric / currency
  return (
    <div>
      <label style={{ display: 'block', marginBottom: 3, color: 'var(--color-neutral-8)', fontSize: 11, fontFamily: 'var(--font-in-md)', fontWeight: 500 }}>
        {field.label}
        {field.maxAmount && (
          <span style={{ color: 'var(--color-neutral-6)', fontSize: 10, marginLeft: 4 }}>
            (max {new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 0 }).format(field.maxAmount)})
          </span>
        )}
      </label>
      <input
        type="number" min="0" max={field.maxAmount}
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="hrms-input"
      />
      {field.description && (
        <p style={{ margin: '3px 0 0', color: 'var(--color-neutral-7)', fontSize: 10 }}>{field.description}</p>
      )}
    </div>
  );
}
