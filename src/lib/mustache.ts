/**
 * lib/mustache.ts
 *
 * Strict, secure {{handleKey}} template renderer for the HRMS communications
 * engine.  Unlike full Mustache.js, this implementation:
 *
 *   • Only supports {{key}} variable substitution (no sections, no inversions,
 *     no partials, no lambdas) — eliminates attack surface for template injection.
 *   • HTML-escapes every value by default; use {{{key}}} for raw insertion
 *     (rare; used only by HR-authored hero banners that need <strong> tags).
 *   • Validates that every required handle is supplied in the trigger payload;
 *     emits structured RenderResult with `missingHandles` for the dispatcher
 *     to mark the notification as `delivery_status: 'failed'` with an
 *     actionable error code.
 *   • Pure function — zero I/O, zero DB access — so it's trivial to unit-test
 *     and safe to call from edge-runtime contexts.
 *
 * Used by:
 *   • src/engine/communicationsAndGateway.ts  (email/SMS subject + body)
 *   • src/lib/notificationService.ts          (in-app notification rendering)
 *   • src/app/api/v3/communications/preview   (live template preview in admin)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Token grammar
// ─────────────────────────────────────────────────────────────────────────────

const HANDLE_PATTERN_HTML = /\{\{\{\s*(\w+)\s*\}\}\}/g;    // {{{key}}} → raw (no escape)
const HANDLE_PATTERN_SAFE = /\{\{\s*(\w+)\s*\}\}/g;        // {{key}}  → HTML-escaped

// ─────────────────────────────────────────────────────────────────────────────
// HTML escape
// ─────────────────────────────────────────────────────────────────────────────

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
};

/** Escapes HTML-sensitive characters to prevent injection in rendered output. */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  return str.replace(/[&<>"'`=/]/g, (ch) => HTML_ESCAPE_MAP[ch] ?? ch);
}

// ─────────────────────────────────────────────────────────────────────────────
// Render API
// ─────────────────────────────────────────────────────────────────────────────

export interface RenderResult {
  /** The rendered string with all known handles substituted. */
  rendered:        string;
  /** Set of handle keys that were referenced but missing from the payload. */
  missingHandles:  string[];
  /** Set of handle keys that were present and successfully substituted. */
  usedHandles:     string[];
  /** True iff no handles were missing and the template parsed without error. */
  ok:              boolean;
}

/**
 * Renders a mustache template with the given handle payload.
 *
 * @param template  The template string containing {{key}} and {{{key}}} tokens
 * @param payload   Map of handle keys → values (any primitive or Date)
 * @param opts      Renderer options
 * @returns         RenderResult containing rendered text + missing-handle list
 *
 * @example
 *   render('Welcome {{name}}!', { name: 'Priya' })
 *   // → { rendered: 'Welcome Priya!', missingHandles: [], usedHandles: ['name'], ok: true }
 *
 *   render('Hi {{name}}, your <b>balance</b> is {{{badge}}}', {
 *     name: 'Priya',
 *     badge: '<span class="gain_pill">+₹50,000</span>',
 *   })
 *   // → { rendered: 'Hi Priya, your <b>balance</b> is <span class="gain_pill">+₹50,000</span>', ... }
 */
export function render(
  template: string,
  payload:  Record<string, unknown>,
  opts:    { strict?: boolean; locale?: string } = {},
): RenderResult {
  const usedHandles:    string[] = [];
  const missingHandles: string[] = [];

  // Pass 1: replace {{{ key }}} → raw value (no escape)
  let result = template.replace(HANDLE_PATTERN_HTML, (_match, key: string) => {
    const value = payload[key];
    if (value === undefined || value === null) {
      missingHandles.push(key);
      return opts.strict ? '' : `{{{${key}}}}`;
    }
    usedHandles.push(key);
    return formatValue(value, opts.locale);
  });

  // Pass 2: replace {{ key }} → escaped value
  result = result.replace(HANDLE_PATTERN_SAFE, (_match, key: string) => {
    const value = payload[key];
    if (value === undefined || value === null) {
      if (!missingHandles.includes(key)) missingHandles.push(key);
      return opts.strict ? '' : `{{${key}}}`;
    }
    if (!usedHandles.includes(key)) usedHandles.push(key);
    return escapeHtml(formatValue(value, opts.locale));
  });

  return {
    rendered:       result,
    missingHandles: Array.from(new Set(missingHandles)),
    usedHandles:    Array.from(new Set(usedHandles)),
    ok:             missingHandles.length === 0,
  };
}

/**
 * Extracts every {{handle}} and {{{handle}}} key referenced in a template.
 * Used by the template editor to display all required variables to authors.
 */
export function extractHandles(template: string): string[] {
  const handles = new Set<string>();
  let m: RegExpExecArray | null;

  HANDLE_PATTERN_HTML.lastIndex = 0;
  while ((m = HANDLE_PATTERN_HTML.exec(template)) !== null) handles.add(m[1]!);

  HANDLE_PATTERN_SAFE.lastIndex = 0;
  while ((m = HANDLE_PATTERN_SAFE.exec(template)) !== null) handles.add(m[1]!);

  return Array.from(handles);
}

/**
 * Validates that a payload supplies every handle a template requires.
 * Returns the list of missing handle keys (empty array = all required handles present).
 */
export function validatePayload(
  template:        string,
  payload:         Record<string, unknown>,
  requiredHandles: string[] = [],
): { ok: boolean; missing: string[] } {
  const allHandles = extractHandles(template);
  const required   = requiredHandles.length > 0 ? requiredHandles : allHandles;
  const missing    = required.filter((k) => payload[k] === undefined || payload[k] === null);
  return { ok: missing.length === 0, missing };
}

// ─────────────────────────────────────────────────────────────────────────────
// Value formatting (locale-aware)
// ─────────────────────────────────────────────────────────────────────────────

function formatValue(value: unknown, locale = 'en-US'): string {
  if (value instanceof Date) {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(value);
  }
  if (typeof value === 'number') {
    return new Intl.NumberFormat(locale).format(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  return String(value);
}

// ─────────────────────────────────────────────────────────────────────────────
// Locale-aware currency formatter — useful for compensation templates
// ─────────────────────────────────────────────────────────────────────────────

export function formatCurrencyForTemplate(
  amount:   number,
  currency = 'USD',
  locale   = 'en-US',
): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
}
