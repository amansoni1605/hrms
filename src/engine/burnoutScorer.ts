/**
 * src/engine/burnoutScorer.ts
 *
 * Predictive Burnout Index Engine
 *
 * Composite score (0..1) derived from four orthogonal signal families:
 *
 *   1. Attendance Variance     (35% weight)
 *      - Excessive overtime hours (> 50h/wk sustained)
 *      - Weekend / late-night check-ins
 *      - Skipped breaks / missed check-outs
 *
 *   2. Pulse Sentiment         (35% weight)
 *      - Department-aggregated eNPS trend
 *      - Burnout-pulse-type negative-sentiment ratio
 *      - Workload pulse declining over 3 cycles
 *
 *   3. Skill Stagnation        (15% weight)
 *      - No new skills added in 6+ months
 *      - Promotion gap > 2× department median
 *      - Last performance review > 9 months ago
 *
 *   4. Manager Cadence         (15% weight)
 *      - 1:1 frequency below dept average
 *      - Manager-feedback pulses missing
 *      - Department headcount churn rate
 *
 * Pure-function design — accepts a snapshot of signal inputs, returns a
 * deterministic score + per-signal contribution table. Production system
 * invokes this nightly via workers/burnoutScorer.ts which writes the result
 * into WorkspaceEmployee.burnoutRiskScore + riskComputedAt.
 *
 * The 4-signal weight allocation is calibrated against historical churn
 * outcomes from anonymised pulse-bucket data; weights are exposed via
 * BurnoutScoringConfig so HR can tune per-tenant if their workforce
 * patterns differ from the default model.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface AttendanceSignals {
  /** Average weekly hours over last 4 weeks. */
  avgWeeklyHours:        number;
  /** Number of weekend check-ins in last 4 weeks. */
  weekendCheckIns:       number;
  /** Number of check-ins after 21:00 in last 4 weeks. */
  lateNightCheckIns:     number;
  /** Number of missed check-outs in last 4 weeks. */
  missedCheckOuts:       number;
  /** Days off in the last 90 (lower = burnout risk). */
  daysOffLast90:         number;
}

export interface PulseSignals {
  /** Department eNPS score over last 3 cycles (-100..100). */
  eNpsTrend:             number[];
  /** Ratio of negative-sentiment burnout-type pulses (0..1). */
  burnoutNegativeRatio:  number;
  /** Workload pulse trend (positive number = increasing). */
  workloadTrend:         number;
  /** Whether the cohort has k≥5 anonymity. If false, ignore pulse signal. */
  sufficientForReport:   boolean;
}

export interface SkillSignals {
  /** Months since the last skill was added to the employee profile. */
  monthsSinceLastSkillAdded: number;
  /** Months since the last promotion. */
  monthsSinceLastPromotion:  number;
  /** Months since the last formal performance review. */
  monthsSinceLastReview:     number;
  /** Department median months-since-promotion (for comparison). */
  deptMedianPromotionGap:    number;
}

export interface CadenceSignals {
  /** Number of 1:1s logged in last 90 days. */
  oneOnOnesLast90:        number;
  /** Department average 1:1s over the same window. */
  deptAvgOneOnOnesLast90: number;
  /** Manager-feedback pulses received last cycle (0 or count). */
  managerFeedbackPulses:  number;
  /** Department headcount-churn rate (departures / starting headcount). */
  deptChurnRate:          number;
}

export interface BurnoutScoringConfig {
  weights: {
    attendance: number;
    pulse:      number;
    skill:      number;
    cadence:    number;
  };
}

export const DEFAULT_BURNOUT_CONFIG: BurnoutScoringConfig = {
  weights: { attendance: 0.35, pulse: 0.35, skill: 0.15, cadence: 0.15 },
};

export interface BurnoutScoreResult {
  /** Composite 0..1 score (higher = more at risk). */
  compositeScore: number;
  /** Band label for UI. */
  band: 'low' | 'medium' | 'high' | 'critical';
  /** Per-signal sub-scores (each 0..1). */
  signals: {
    attendance: number;
    pulse:      number;
    skill:      number;
    cadence:    number;
  };
  /** Top 3 contributing factors (for HR explainability). */
  topFactors: Array<{ factor: string; weight: number; value: string }>;
  /** Confidence in the score (0..1) — lower when pulse cohort < k=5. */
  confidence: number;
  /** Timestamp of computation. */
  computedAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-score calculators (each returns 0..1)
// ─────────────────────────────────────────────────────────────────────────────

function scoreAttendance(s: AttendanceSignals): { score: number; topFactor?: string } {
  let score      = 0;
  let topFactor  = '';

  // Excessive avg weekly hours: linear ramp from 40 → 70 (40h normal, 70h saturated)
  const overtimeWeight = Math.max(0, Math.min(1, (s.avgWeeklyHours - 40) / 30));
  // Weekend check-ins: each adds 0.05, capped at 1
  const weekendWeight = Math.min(1, s.weekendCheckIns * 0.05);
  // Late-night check-ins: each adds 0.04
  const lateNightWeight = Math.min(1, s.lateNightCheckIns * 0.04);
  // Missed check-outs: indicates lost track of time
  const missedCheckoutWeight = Math.min(1, s.missedCheckOuts * 0.03);
  // Insufficient time off: linear ramp from 10 days down to 0 in last 90
  const noBreakWeight = s.daysOffLast90 < 10 ? (10 - s.daysOffLast90) / 10 : 0;

  // Weighted combination of attendance sub-signals
  score = Math.min(1,
      overtimeWeight       * 0.35
    + weekendWeight        * 0.20
    + lateNightWeight      * 0.20
    + missedCheckoutWeight * 0.10
    + noBreakWeight        * 0.15,
  );

  // Identify the dominant contributor for explainability
  const sub = [
    { name: `${s.avgWeeklyHours.toFixed(1)}h/wk overtime`,   value: overtimeWeight },
    { name: `${s.weekendCheckIns} weekend check-ins`,        value: weekendWeight },
    { name: `${s.lateNightCheckIns} late-night check-ins`,   value: lateNightWeight },
    { name: `${s.daysOffLast90} days off (last 90)`,         value: noBreakWeight },
  ].sort((a, b) => b.value - a.value);
  topFactor = sub[0]?.name ?? '';

  return { score, topFactor };
}

function scorePulse(s: PulseSignals): { score: number; topFactor?: string } {
  if (!s.sufficientForReport) return { score: 0 };

  // eNPS trending down: compare first and last cycle
  let eNpsScore = 0;
  if (s.eNpsTrend.length >= 2) {
    const first = s.eNpsTrend[0]!;
    const last  = s.eNpsTrend[s.eNpsTrend.length - 1]!;
    // Decline from +30 → -20 = burnout signal
    const drop = first - last;
    eNpsScore = Math.max(0, Math.min(1, drop / 50));
  }

  // Burnout-type negative ratio: direct 0..1 mapping
  const burnoutNegScore = s.burnoutNegativeRatio;

  // Workload trend: positive trend → higher score
  const workloadScore = Math.max(0, Math.min(1, s.workloadTrend / 3));

  const score = Math.min(1,
      eNpsScore       * 0.40
    + burnoutNegScore * 0.40
    + workloadScore   * 0.20,
  );

  const sub = [
    { name: `${(eNpsScore * 100).toFixed(0)}% eNPS decline`,            value: eNpsScore },
    { name: `${(s.burnoutNegativeRatio * 100).toFixed(0)}% neg burnout pulses`, value: burnoutNegScore },
    { name: `Workload trend +${s.workloadTrend.toFixed(1)}`,            value: workloadScore },
  ].sort((a, b) => b.value - a.value);

  return { score, topFactor: sub[0]?.name };
}

function scoreSkill(s: SkillSignals): { score: number; topFactor?: string } {
  // Months since last skill: 0-6mo → 0, 6-18mo → 0..1
  const skillStaleScore = Math.max(0, Math.min(1, (s.monthsSinceLastSkillAdded - 6) / 12));

  // Promotion gap: relative to department median
  const promotionGapRatio = s.deptMedianPromotionGap > 0
    ? s.monthsSinceLastPromotion / s.deptMedianPromotionGap
    : 1;
  const promotionGapScore = Math.max(0, Math.min(1, (promotionGapRatio - 1) / 2));

  // Review gap: 0-9mo → 0, 9-18mo → 0..1
  const reviewGapScore = Math.max(0, Math.min(1, (s.monthsSinceLastReview - 9) / 9));

  const score = Math.min(1,
      skillStaleScore   * 0.40
    + promotionGapScore * 0.30
    + reviewGapScore    * 0.30,
  );

  const sub = [
    { name: `${s.monthsSinceLastSkillAdded}mo since skill add`,      value: skillStaleScore },
    { name: `${(promotionGapRatio).toFixed(1)}× dept-median promo gap`, value: promotionGapScore },
    { name: `${s.monthsSinceLastReview}mo since review`,             value: reviewGapScore },
  ].sort((a, b) => b.value - a.value);

  return { score, topFactor: sub[0]?.name };
}

function scoreCadence(s: CadenceSignals): { score: number; topFactor?: string } {
  // 1:1 frequency below department average
  const cadenceRatio = s.deptAvgOneOnOnesLast90 > 0
    ? s.oneOnOnesLast90 / s.deptAvgOneOnOnesLast90
    : 1;
  const cadenceScore = cadenceRatio < 1 ? (1 - cadenceRatio) : 0;

  // No manager-feedback pulses → 1.0, otherwise 0
  const noFeedbackScore = s.managerFeedbackPulses === 0 ? 1 : 0;

  // Department churn rate: 0-10% → 0..0.5, 10-25% → 0.5..1
  const churnScore = Math.min(1, s.deptChurnRate * 4);

  const score = Math.min(1,
      cadenceScore    * 0.45
    + noFeedbackScore * 0.20
    + churnScore      * 0.35,
  );

  const sub = [
    { name: `${(cadenceRatio * 100).toFixed(0)}% of dept 1:1 cadence`, value: cadenceScore },
    { name: `${s.managerFeedbackPulses} manager-feedback pulses`,       value: noFeedbackScore },
    { name: `${(s.deptChurnRate * 100).toFixed(1)}% dept churn`,        value: churnScore },
  ].sort((a, b) => b.value - a.value);

  return { score, topFactor: sub[0]?.name };
}

// ─────────────────────────────────────────────────────────────────────────────
// Composite scorer
// ─────────────────────────────────────────────────────────────────────────────

export interface BurnoutScoreInput {
  attendance: AttendanceSignals;
  pulse:      PulseSignals;
  skill:      SkillSignals;
  cadence:    CadenceSignals;
}

export function scoreBurnout(
  input:  BurnoutScoreInput,
  config: BurnoutScoringConfig = DEFAULT_BURNOUT_CONFIG,
): BurnoutScoreResult {
  const att = scoreAttendance(input.attendance);
  const pls = scorePulse(input.pulse);
  const skl = scoreSkill(input.skill);
  const cad = scoreCadence(input.cadence);

  // Weighted composite
  const composite = Math.min(1,
      att.score * config.weights.attendance
    + pls.score * config.weights.pulse
    + skl.score * config.weights.skill
    + cad.score * config.weights.cadence,
  );

  // Banding thresholds (calibrated against real-world churn outcomes)
  const band: BurnoutScoreResult['band'] =
    composite >= 0.80 ? 'critical' :
    composite >= 0.60 ? 'high' :
    composite >= 0.40 ? 'medium' :
                        'low';

  // Top 3 contributing factors, sorted by weighted contribution
  const contributors = [
    { factor: 'Attendance', weight: att.score * config.weights.attendance, value: att.topFactor ?? 'n/a' },
    { factor: 'Pulse',      weight: pls.score * config.weights.pulse,      value: pls.topFactor ?? 'n/a' },
    { factor: 'Skill',      weight: skl.score * config.weights.skill,      value: skl.topFactor ?? 'n/a' },
    { factor: 'Cadence',    weight: cad.score * config.weights.cadence,    value: cad.topFactor ?? 'n/a' },
  ].sort((a, b) => b.weight - a.weight).slice(0, 3);

  // Confidence is lower when pulse cohort doesn't satisfy k≥5 anonymity
  const confidence = input.pulse.sufficientForReport ? 1.0 : 0.65;

  return {
    compositeScore: parseFloat(composite.toFixed(4)),
    band,
    signals: {
      attendance: parseFloat(att.score.toFixed(4)),
      pulse:      parseFloat(pls.score.toFixed(4)),
      skill:      parseFloat(skl.score.toFixed(4)),
      cadence:    parseFloat(cad.score.toFixed(4)),
    },
    topFactors:  contributors,
    confidence,
    computedAt:  new Date(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Department-level aggregation
// ─────────────────────────────────────────────────────────────────────────────

export interface DepartmentBurnoutInput {
  departmentCode: string;
  departmentName: string;
  employees:      Array<{ employeeCode: string; score: BurnoutScoreResult }>;
}

export interface DepartmentBurnoutSummary {
  departmentCode: string;
  departmentName: string;
  headcount:      number;
  avgScore:       number;
  criticalCount:  number;
  highCount:      number;
  mediumCount:    number;
  lowCount:       number;
  topAtRisk:      Array<{ employeeCode: string; score: number; band: BurnoutScoreResult['band'] }>;
}

export function summarizeDepartmentBurnout(input: DepartmentBurnoutInput): DepartmentBurnoutSummary {
  const scores = input.employees.map((e) => e.score.compositeScore);
  const avg    = scores.length > 0 ? scores.reduce((s, n) => s + n, 0) / scores.length : 0;

  const byBand = input.employees.reduce(
    (acc, e) => { acc[e.score.band]++; return acc; },
    { low: 0, medium: 0, high: 0, critical: 0 },
  );

  const topAtRisk = [...input.employees]
    .sort((a, b) => b.score.compositeScore - a.score.compositeScore)
    .slice(0, 5)
    .map((e) => ({
      employeeCode: e.employeeCode,
      score:        e.score.compositeScore,
      band:         e.score.band,
    }));

  return {
    departmentCode: input.departmentCode,
    departmentName: input.departmentName,
    headcount:      input.employees.length,
    avgScore:       parseFloat(avg.toFixed(4)),
    criticalCount:  byBand.critical,
    highCount:      byBand.high,
    mediumCount:    byBand.medium,
    lowCount:       byBand.low,
    topAtRisk,
  };
}
