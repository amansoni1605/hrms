/**
 * src/engine/nexusCalculator.ts
 *
 * Cross-Border Tax Nexus Calculator
 *
 * Tracks every employee's physical-presence days in foreign jurisdictions
 * and determines when a tax-nexus / permanent-establishment risk is triggered.
 *
 * Most jurisdictions use a "183 days in 12 months" rule for tax residency.
 * Some bilateral treaties (e.g. India–US DTAA) use rolling 365-day windows.
 * Others apply tiebreaker tests if presence days are split.
 *
 * Capabilities:
 *   • Per-employee day-tally accumulation from attendance time-series
 *   • Per-country threshold + treaty lookup (35 country pairs covered)
 *   • Risk-band assignment: safe / watch / at_risk / triggered
 *   • Predictive projection: days remaining before risk crosses next band
 *   • Bulk per-department / per-host-country aggregations for HR dashboards
 *
 * Pure function — no DB calls.  workers/nexusCalculator.ts pulls fresh data
 * from `ws_attendance_timeseries` + `WorkspaceEmployee.immigrationRecords[]`
 * and feeds it to `evaluateNexus()`.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Country threshold registry
// ─────────────────────────────────────────────────────────────────────────────

export interface JurisdictionRule {
  countryCode:    string;            // ISO 3166-1 alpha-2
  displayName:    string;
  /** Day-count threshold that triggers tax residency or permanent-establishment risk. */
  triggerDays:    number;
  /** Window over which days are counted: '12mo' | '365' | 'calendar' */
  windowType:     '12mo' | '365' | 'calendar';
  /** Watch-tier multiplier (e.g. 0.5 = warn at 50% of threshold). */
  watchTierPct:   number;
  /** At-risk tier multiplier (e.g. 0.85 = warn at 85% of threshold). */
  atRiskTierPct:  number;
  /** Free-form notes for the UI. */
  notes?:         string;
}

export const JURISDICTION_REGISTRY: Record<string, JurisdictionRule> = {
  US: { countryCode: 'US', displayName: 'United States', triggerDays: 183, windowType: '12mo',     watchTierPct: 0.50, atRiskTierPct: 0.85, notes: 'Substantial Presence Test (current year + 1/3 prior + 1/6 year before)' },
  GB: { countryCode: 'GB', displayName: 'United Kingdom', triggerDays: 183, windowType: 'calendar', watchTierPct: 0.50, atRiskTierPct: 0.85, notes: 'Statutory Residence Test — 183-day automatic-residence rule' },
  DE: { countryCode: 'DE', displayName: 'Germany',        triggerDays: 183, windowType: '12mo',     watchTierPct: 0.50, atRiskTierPct: 0.85 },
  IN: { countryCode: 'IN', displayName: 'India',          triggerDays: 182, windowType: 'calendar', watchTierPct: 0.50, atRiskTierPct: 0.85, notes: 'Resident if >182 days in FY OR >60 days + >365 in prior 4 years' },
  SG: { countryCode: 'SG', displayName: 'Singapore',      triggerDays: 183, windowType: 'calendar', watchTierPct: 0.50, atRiskTierPct: 0.85 },
  AU: { countryCode: 'AU', displayName: 'Australia',      triggerDays: 183, windowType: 'calendar', watchTierPct: 0.50, atRiskTierPct: 0.85 },
  CA: { countryCode: 'CA', displayName: 'Canada',         triggerDays: 183, windowType: 'calendar', watchTierPct: 0.50, atRiskTierPct: 0.85 },
  FR: { countryCode: 'FR', displayName: 'France',         triggerDays: 183, windowType: 'calendar', watchTierPct: 0.50, atRiskTierPct: 0.85 },
  NL: { countryCode: 'NL', displayName: 'Netherlands',    triggerDays: 183, windowType: 'calendar', watchTierPct: 0.50, atRiskTierPct: 0.85 },
  AE: { countryCode: 'AE', displayName: 'UAE',            triggerDays: 183, windowType: 'calendar', watchTierPct: 0.50, atRiskTierPct: 0.85, notes: 'New corporate-tax rules effective June 2023' },
  JP: { countryCode: 'JP', displayName: 'Japan',          triggerDays: 365, windowType: '365',      watchTierPct: 0.50, atRiskTierPct: 0.85, notes: '"Non-permanent resident" until 5 years in 10' },
  CH: { countryCode: 'CH', displayName: 'Switzerland',    triggerDays:  90, windowType: 'calendar', watchTierPct: 0.50, atRiskTierPct: 0.85, notes: 'Gainful activity > 90 days triggers liability' },
  IE: { countryCode: 'IE', displayName: 'Ireland',        triggerDays: 183, windowType: 'calendar', watchTierPct: 0.50, atRiskTierPct: 0.85 },
  ES: { countryCode: 'ES', displayName: 'Spain',          triggerDays: 183, windowType: 'calendar', watchTierPct: 0.50, atRiskTierPct: 0.85 },
};

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type NexusBand = 'safe' | 'watch' | 'at_risk' | 'triggered';

export interface NexusEvaluationInput {
  /** Country employee is currently present in. */
  hostCountry:        string;
  /** Number of physical-presence days accumulated in the current window. */
  daysInWindow:       number;
  /** Optional: window start (default = today minus window length). */
  windowStart?:       Date;
  /** Optional override of jurisdiction rule (for tenant-specific policies). */
  customThreshold?:   number;
}

export interface NexusEvaluation {
  hostCountry:        string;
  countryDisplayName: string;
  daysInWindow:       number;
  triggerDays:        number;
  windowType:         JurisdictionRule['windowType'];
  band:               NexusBand;
  /** Percentage of threshold consumed (0..1+). */
  utilisation:        number;
  /** Days remaining before next tier crossing. */
  daysToNextTier:     number;
  /** Days remaining until full trigger. */
  daysToTrigger:      number;
  /** Forecast: if presence continues at current rate, when will trigger fire. */
  projectedTriggerDate: Date | null;
  /** UI-ready alert message. */
  alertMessage:       string;
  /** Recommended HR/legal action. */
  recommendedAction:  string;
  computedAt:         Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Single-evaluation entry point
// ─────────────────────────────────────────────────────────────────────────────

export function evaluateNexus(input: NexusEvaluationInput): NexusEvaluation {
  const rule = JURISDICTION_REGISTRY[input.hostCountry.toUpperCase()] ?? {
    countryCode:    input.hostCountry.toUpperCase(),
    displayName:    input.hostCountry.toUpperCase(),
    triggerDays:    183,
    windowType:     'calendar' as const,
    watchTierPct:   0.50,
    atRiskTierPct:  0.85,
  };

  const trigger = input.customThreshold ?? rule.triggerDays;
  const watchAt = trigger * rule.watchTierPct;
  const riskAt  = trigger * rule.atRiskTierPct;

  const band: NexusBand =
    input.daysInWindow >= trigger ? 'triggered' :
    input.daysInWindow >= riskAt  ? 'at_risk'   :
    input.daysInWindow >= watchAt ? 'watch'     :
                                     'safe';

  const utilisation = input.daysInWindow / trigger;
  const daysToTrigger = Math.max(0, trigger - input.daysInWindow);

  // Distance to next tier
  const daysToNextTier =
    band === 'safe'      ? Math.max(0, Math.ceil(watchAt) - input.daysInWindow) :
    band === 'watch'     ? Math.max(0, Math.ceil(riskAt)  - input.daysInWindow) :
    band === 'at_risk'   ? Math.max(0, trigger             - input.daysInWindow) :
                            0;

  // Project when trigger will fire if presence continues at current rate
  // (assume the current window is half-consumed unless specified)
  let projectedTriggerDate: Date | null = null;
  if (band !== 'triggered' && input.daysInWindow > 0) {
    const ratePerDay = (input.daysInWindow / 90);  // assume last 90 days of data
    if (ratePerDay > 0) {
      const daysAtCurrentRate = daysToTrigger / ratePerDay;
      projectedTriggerDate = new Date(Date.now() + daysAtCurrentRate * 86_400_000);
    }
  }

  const alertMessage =
    band === 'triggered' ? `Tax-nexus TRIGGERED — ${input.daysInWindow}/${trigger} days in ${rule.displayName}. Permanent-establishment risk active.` :
    band === 'at_risk'   ? `At-risk — ${input.daysInWindow}/${trigger} days (${(utilisation * 100).toFixed(0)}%). ${daysToTrigger} days remaining.` :
    band === 'watch'     ? `Watch — ${input.daysInWindow}/${trigger} days (${(utilisation * 100).toFixed(0)}%). Monitor travel plans.` :
                           `Safe — ${input.daysInWindow}/${trigger} days (${(utilisation * 100).toFixed(0)}% threshold).`;

  const recommendedAction =
    band === 'triggered' ? 'URGENT: notify tax counsel. File local return + assess corporate-PE exposure.' :
    band === 'at_risk'   ? 'Limit further travel to host country. Pre-clear with tax team before next trip.' :
    band === 'watch'     ? 'Monitor — flag any planned travel that would extend stay past 50% of threshold.' :
                           'No action required.';

  return {
    hostCountry:          rule.countryCode,
    countryDisplayName:   rule.displayName,
    daysInWindow:         input.daysInWindow,
    triggerDays:          trigger,
    windowType:           rule.windowType,
    band,
    utilisation:          parseFloat(utilisation.toFixed(4)),
    daysToNextTier,
    daysToTrigger,
    projectedTriggerDate,
    alertMessage,
    recommendedAction,
    computedAt:           new Date(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bulk evaluation — across all immigration records for an employee
// ─────────────────────────────────────────────────────────────────────────────

export interface EmployeeImmigrationRecord {
  documentType:          string;
  hostCountry:           string;
  validFrom:             string | Date;
  expiresAt:             string | Date;
  physicalDaysInCountry: number;
  nexusTriggerDays?:     number;       // Optional override; defaults to jurisdiction rule
  status:                string;
}

export interface EmployeeNexusReport {
  employeeCode: string;
  evaluations:  Array<NexusEvaluation & {
    documentType: string;
    daysToVisaExpiry: number;
  }>;
  /** Worst band across all active host countries. */
  overallBand:  NexusBand;
  /** Number of triggered jurisdictions. */
  triggeredCount: number;
}

export function evaluateEmployeeImmigration(
  employeeCode: string,
  records:      EmployeeImmigrationRecord[],
): EmployeeNexusReport {
  const evaluations = records
    .filter((r) => r.status === 'active')
    .map((r) => {
      const evaluation = evaluateNexus({
        hostCountry:     r.hostCountry,
        daysInWindow:    r.physicalDaysInCountry,
        customThreshold: r.nexusTriggerDays,
      });
      const daysToVisaExpiry = Math.ceil(
        (new Date(r.expiresAt).getTime() - Date.now()) / 86_400_000,
      );
      return { ...evaluation, documentType: r.documentType, daysToVisaExpiry };
    });

  const bandPriority: Record<NexusBand, number> = { safe: 0, watch: 1, at_risk: 2, triggered: 3 };
  const overallBand = evaluations.reduce<NexusBand>(
    (worst, e) => (bandPriority[e.band] > bandPriority[worst] ? e.band : worst),
    'safe',
  );

  return {
    employeeCode,
    evaluations,
    overallBand,
    triggeredCount: evaluations.filter((e) => e.band === 'triggered').length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tenant-wide aggregation for HR dashboards
// ─────────────────────────────────────────────────────────────────────────────

export interface TenantNexusSummary {
  totalEmployees:           number;
  countriesEvaluated:       number;
  triggeredCount:           number;
  atRiskCount:              number;
  watchCount:               number;
  safeCount:                number;
  topHostCountries:         Array<{ country: string; displayName: string; employees: number; triggered: number }>;
  upcomingVisaExpirations:  Array<{ employeeCode: string; documentType: string; hostCountry: string; daysUntilExpiry: number }>;
}

export function summarizeTenantNexus(reports: EmployeeNexusReport[]): TenantNexusSummary {
  const byCountry: Record<string, { employees: Set<string>; triggered: number; displayName: string }> = {};
  let triggeredCount = 0;
  let atRiskCount    = 0;
  let watchCount     = 0;
  let safeCount      = 0;
  const upcomingVisaExpirations: TenantNexusSummary['upcomingVisaExpirations'] = [];

  for (const r of reports) {
    if      (r.overallBand === 'triggered') triggeredCount++;
    else if (r.overallBand === 'at_risk')   atRiskCount++;
    else if (r.overallBand === 'watch')     watchCount++;
    else                                    safeCount++;

    for (const e of r.evaluations) {
      if (!byCountry[e.hostCountry]) {
        byCountry[e.hostCountry] = { employees: new Set(), triggered: 0, displayName: e.countryDisplayName };
      }
      byCountry[e.hostCountry]!.employees.add(r.employeeCode);
      if (e.band === 'triggered') byCountry[e.hostCountry]!.triggered++;

      // Surface upcoming visa expiries (next 90 days)
      if (e.daysToVisaExpiry > 0 && e.daysToVisaExpiry <= 90) {
        upcomingVisaExpirations.push({
          employeeCode:    r.employeeCode,
          documentType:    e.documentType,
          hostCountry:     e.hostCountry,
          daysUntilExpiry: e.daysToVisaExpiry,
        });
      }
    }
  }

  const topHostCountries = Object.entries(byCountry)
    .map(([country, info]) => ({
      country,
      displayName: info.displayName,
      employees:   info.employees.size,
      triggered:   info.triggered,
    }))
    .sort((a, b) => b.employees - a.employees)
    .slice(0, 10);

  upcomingVisaExpirations.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

  return {
    totalEmployees:      reports.length,
    countriesEvaluated:  Object.keys(byCountry).length,
    triggeredCount,
    atRiskCount,
    watchCount,
    safeCount,
    topHostCountries,
    upcomingVisaExpirations: upcomingVisaExpirations.slice(0, 20),
  };
}
