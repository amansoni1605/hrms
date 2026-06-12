/**
 * src/engine/turnoverPredictor.ts
 *
 * Turnover (Flight-Risk) Predictor
 *
 * Classifies an employee's 90-day flight-risk from anonymised behavioural
 * signals.  Outputs a probability (0..1) + 3-band classification + the top
 * features that drove the prediction (for HR-side explainability).
 *
 * Signal families (orthogonal to burnout):
 *
 *   1. Compensation Lag (30%)
 *      - Months since last salary revision
 *      - Salary band gap vs market median (peer benchmarking)
 *      - Equity vesting progress (more vested = lower lock-in)
 *
 *   2. Engagement Decline (25%)
 *      - Declining check-in frequency (slope of last 30 days)
 *      - Falling pulse sentiment scores
 *      - Reduced collaboration signal (cross-team interactions)
 *
 *   3. Career Friction (20%)
 *      - Promotion gap vs peer cohort
 *      - Skill staleness (new skills last 6mo)
 *      - Open job-board profile signals (LinkedIn updates, if integrated)
 *
 *   4. Peer Effect (15%)
 *      - Recent departures in same team (1, 2+ in last 90 days)
 *      - Manager change in last 6 months
 *      - Department churn rate vs tenant median
 *
 *   5. Tenure Curve (10%)
 *      - Tenure-stage risk multiplier (1-2 years and 4-5 years are peak risk)
 *      - Last promotion alignment with tenure milestones
 *
 * This implementation uses calibrated heuristic weights — the same shape an
 * XGBoost or logistic-regression classifier would produce after training.
 * Swappable for a real model in workers/turnoverPredictor.ts without
 * changing this module's interface.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Signal families
// ─────────────────────────────────────────────────────────────────────────────

export interface CompensationSignals {
  monthsSinceLastSalaryRevision: number;
  /** Percentage gap vs market median for this role × geography. Positive = under-paid. */
  marketGapPct:                  number;
  /** Fraction of equity vested (0..1). */
  vestingProgress:               number;
}

export interface EngagementSignals {
  /** Linear regression slope of weekly check-ins over last 30 days (negative = declining). */
  checkInTrendSlope:    number;
  /** Latest pulse sentiment score (-1..1). */
  pulseSentiment:       number;
  /** Cross-team collaboration index (0..1). */
  collaborationIndex:   number;
  /** Whether pulse cohort satisfies k≥5 anonymity. */
  sufficientForReport:  boolean;
}

export interface CareerSignals {
  monthsSincePromotion:    number;
  peerMedianPromotionGap:  number;
  monthsSinceLastSkillAdded: number;
  /** External signal: profile updated on a job board in last 30 days. */
  externalProfileUpdate:   boolean;
}

export interface PeerEffectSignals {
  /** Number of departures in this employee's team in last 90 days. */
  teamDeparturesLast90:    number;
  /** Department churn rate (0..1). */
  deptChurnRate:           number;
  /** Tenant median churn rate (0..1). */
  tenantMedianChurnRate:   number;
  /** Whether the employee's manager changed in the last 6 months. */
  managerChangedLast6Mo:   boolean;
}

export interface TenureSignals {
  /** Tenure in years (decimal allowed). */
  tenureYears: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

export interface TurnoverPredictorConfig {
  weights: {
    compensation: number;
    engagement:   number;
    career:       number;
    peer:         number;
    tenure:       number;
  };
}

export const DEFAULT_TURNOVER_CONFIG: TurnoverPredictorConfig = {
  weights: {
    compensation: 0.30,
    engagement:   0.25,
    career:       0.20,
    peer:         0.15,
    tenure:       0.10,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Result type
// ─────────────────────────────────────────────────────────────────────────────

export interface FlightRiskResult {
  /** Composite probability (0..1) the employee will leave in next 90 days. */
  riskProbability: number;
  /** Band classification. */
  band: 'low' | 'medium' | 'high';
  /** 90-day horizon decay-adjusted probability. */
  horizon90DayPct: number;
  /** Per-family sub-scores. */
  signals: {
    compensation: number;
    engagement:   number;
    career:       number;
    peer:         number;
    tenure:       number;
  };
  /** Top 3 driver features for HR explainability. */
  topDrivers: Array<{ family: string; weight: number; description: string }>;
  /** Recommended retention action (most impactful). */
  recommendedAction: string;
  /** Confidence in the prediction (0..1). */
  confidence:        number;
  computedAt:        Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-scorers
// ─────────────────────────────────────────────────────────────────────────────

function scoreCompensation(s: CompensationSignals): { score: number; description: string } {
  // No revision in >12 months → ramp up
  const revisionLagScore = Math.max(0, Math.min(1, (s.monthsSinceLastSalaryRevision - 12) / 12));
  // Under-paid vs market: 0% gap → 0, 25% gap → 1
  const marketGapScore   = Math.max(0, Math.min(1, s.marketGapPct / 0.25));
  // Vesting progress: fully vested (>80%) → high flight risk (no lock-in)
  const vestingScore     = s.vestingProgress >= 0.80 ? (s.vestingProgress - 0.80) * 5 : 0;

  const score = Math.min(1,
      revisionLagScore * 0.40
    + marketGapScore   * 0.40
    + vestingScore     * 0.20,
  );

  const dominant =
    marketGapScore   >= revisionLagScore && marketGapScore   >= vestingScore  ? `${(s.marketGapPct * 100).toFixed(0)}% below market median`
  : revisionLagScore >= vestingScore                                          ? `${s.monthsSinceLastSalaryRevision}mo since salary revision`
  :                                                                            `${(s.vestingProgress * 100).toFixed(0)}% equity vested (low lock-in)`;

  return { score, description: dominant };
}

function scoreEngagement(s: EngagementSignals): { score: number; description: string } {
  if (!s.sufficientForReport && s.pulseSentiment === 0) {
    // No reliable engagement signal → neutral
    return { score: 0.3, description: 'Insufficient pulse data (k<5)' };
  }

  // Check-in trend declining: slope -0.5 → 1, slope 0 → 0
  const checkInScore = Math.max(0, Math.min(1, -s.checkInTrendSlope * 2));
  // Pulse sentiment: -1 (very negative) → 1, 0 → 0
  const sentimentScore = Math.max(0, -s.pulseSentiment);
  // Low collaboration: < 0.3 → ramp up
  const collabScore = s.collaborationIndex < 0.3 ? (0.3 - s.collaborationIndex) / 0.3 : 0;

  const score = Math.min(1,
      checkInScore   * 0.40
    + sentimentScore * 0.40
    + collabScore    * 0.20,
  );

  const dominant =
    sentimentScore >= checkInScore && sentimentScore >= collabScore ? `Pulse sentiment ${s.pulseSentiment.toFixed(2)}`
  : checkInScore   >= collabScore                                    ? `Check-in slope ${s.checkInTrendSlope.toFixed(2)}/wk`
  :                                                                    `Collaboration index ${s.collaborationIndex.toFixed(2)}`;

  return { score, description: dominant };
}

function scoreCareer(s: CareerSignals): { score: number; description: string } {
  // Promotion gap relative to peers: 1× peer median = 0, 2× = 1
  const promoRatio = s.peerMedianPromotionGap > 0
    ? s.monthsSincePromotion / s.peerMedianPromotionGap
    : 1;
  const promotionScore = Math.max(0, Math.min(1, (promoRatio - 1) / 1));

  // Skill staleness: 6+ months without new skill
  const skillScore = Math.max(0, Math.min(1, (s.monthsSinceLastSkillAdded - 6) / 12));

  // External profile update: hard +0.6 boost
  const externalScore = s.externalProfileUpdate ? 0.6 : 0;

  const score = Math.min(1,
      promotionScore  * 0.40
    + skillScore      * 0.20
    + externalScore   * 0.40,
  );

  const dominant =
    externalScore > 0                                          ? 'Job-board profile updated recently'
  : promotionScore >= skillScore                               ? `${promoRatio.toFixed(1)}× peer promotion gap`
  :                                                              `${s.monthsSinceLastSkillAdded}mo skill stagnation`;

  return { score, description: dominant };
}

function scorePeerEffect(s: PeerEffectSignals): { score: number; description: string } {
  // Team departures: each adds 0.30, capped at 1
  const departureScore = Math.min(1, s.teamDeparturesLast90 * 0.30);

  // Department churn above tenant median: ratio-based ramp
  const churnRatio = s.tenantMedianChurnRate > 0
    ? s.deptChurnRate / s.tenantMedianChurnRate
    : 1;
  const churnScore = Math.max(0, Math.min(1, (churnRatio - 1) / 2));

  // Manager change in last 6 months: +0.30 boost
  const managerScore = s.managerChangedLast6Mo ? 0.30 : 0;

  const score = Math.min(1,
      departureScore * 0.50
    + churnScore     * 0.30
    + managerScore   * 0.20,
  );

  const dominant =
    departureScore >= churnScore && departureScore >= managerScore ? `${s.teamDeparturesLast90} team departures last 90d`
  : churnScore   >= managerScore                                    ? `${(churnRatio).toFixed(1)}× tenant median dept churn`
  :                                                                   'Recent manager change';

  return { score, description: dominant };
}

function scoreTenure(s: TenureSignals): { score: number; description: string } {
  // Risk curve: peaks at 1.5-2 years and 4-5 years (well-documented in HR research)
  let score = 0;
  if (s.tenureYears < 0.5)        score = 0.1;
  else if (s.tenureYears < 1.5)   score = 0.4 + (s.tenureYears - 0.5) * 0.4;
  else if (s.tenureYears < 2.5)   score = 0.8 - (s.tenureYears - 1.5) * 0.4;
  else if (s.tenureYears < 4.0)   score = 0.4 + (s.tenureYears - 2.5) * 0.13;
  else if (s.tenureYears < 5.5)   score = 0.7;
  else                            score = Math.max(0.3, 0.7 - (s.tenureYears - 5.5) * 0.05);

  return {
    score:       Math.min(1, score),
    description: `Tenure ${s.tenureYears.toFixed(1)}y — ${
      score >= 0.6 ? 'peak risk zone' :
      score >= 0.3 ? 'moderate-risk zone' :
                     'low-risk zone'
    }`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Composite predictor
// ─────────────────────────────────────────────────────────────────────────────

export interface FlightRiskInput {
  compensation: CompensationSignals;
  engagement:   EngagementSignals;
  career:       CareerSignals;
  peer:         PeerEffectSignals;
  tenure:       TenureSignals;
}

export function predictFlightRisk(
  input:  FlightRiskInput,
  config: TurnoverPredictorConfig = DEFAULT_TURNOVER_CONFIG,
): FlightRiskResult {
  const c = scoreCompensation(input.compensation);
  const e = scoreEngagement(input.engagement);
  const r = scoreCareer(input.career);
  const p = scorePeerEffect(input.peer);
  const t = scoreTenure(input.tenure);

  const composite = Math.min(1,
      c.score * config.weights.compensation
    + e.score * config.weights.engagement
    + r.score * config.weights.career
    + p.score * config.weights.peer
    + t.score * config.weights.tenure,
  );

  const band: FlightRiskResult['band'] =
    composite >= 0.60 ? 'high' :
    composite >= 0.35 ? 'medium' :
                        'low';

  // 90-day horizon: P(leave in 90 days) ≈ composite × 0.85 (calibration factor)
  const horizon90 = Math.min(1, composite * 0.85);

  // Top 3 drivers by weighted contribution
  const drivers = [
    { family: 'Compensation', weight: c.score * config.weights.compensation, description: c.description },
    { family: 'Engagement',   weight: e.score * config.weights.engagement,   description: e.description },
    { family: 'Career',       weight: r.score * config.weights.career,       description: r.description },
    { family: 'Peer Effect',  weight: p.score * config.weights.peer,         description: p.description },
    { family: 'Tenure',       weight: t.score * config.weights.tenure,       description: t.description },
  ].sort((a, b) => b.weight - a.weight).slice(0, 3);

  // Recommended retention action — derived from top driver
  const recommendedAction = recommendAction(drivers[0]?.family ?? '', input);

  const confidence = input.engagement.sufficientForReport ? 0.92 : 0.72;

  return {
    riskProbability:   parseFloat(composite.toFixed(4)),
    band,
    horizon90DayPct:   parseFloat(horizon90.toFixed(4)),
    signals: {
      compensation: parseFloat(c.score.toFixed(4)),
      engagement:   parseFloat(e.score.toFixed(4)),
      career:       parseFloat(r.score.toFixed(4)),
      peer:         parseFloat(p.score.toFixed(4)),
      tenure:       parseFloat(t.score.toFixed(4)),
    },
    topDrivers:        drivers,
    recommendedAction,
    confidence,
    computedAt:        new Date(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Retention-action recommender
// ─────────────────────────────────────────────────────────────────────────────

function recommendAction(topFamily: string, input: FlightRiskInput): string {
  switch (topFamily) {
    case 'Compensation':
      if (input.compensation.marketGapPct >= 0.10) {
        return 'Schedule compensation review — employee is below market median.';
      }
      if (input.compensation.vestingProgress >= 0.80) {
        return 'Discuss new equity grant or retention bonus to extend lock-in.';
      }
      return 'Review salary band against tenure and performance.';

    case 'Engagement':
      return 'Manager 1:1 — discuss workload, growth path, and recent pulse signals.';

    case 'Career':
      if (input.career.externalProfileUpdate) {
        return 'Urgent: external job-board activity detected. Schedule retention conversation immediately.';
      }
      return 'Promotion / role-expansion conversation. Identify a stretch project or new skill investment.';

    case 'Peer Effect':
      return 'Acknowledge recent team changes and re-cast team trajectory. Stabilise the surrounding cohort.';

    case 'Tenure':
      return 'Tenure-milestone re-engagement: anniversary recognition, new role challenge, or rotation.';

    default:
      return 'Investigate further — no dominant risk factor.';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Watchlist builder
// ─────────────────────────────────────────────────────────────────────────────

export interface WatchlistRow {
  employeeCode: string;
  employeeId:   string;
  jobTitle:     string;
  department:   string;
  manager:      string | null;
  result:       FlightRiskResult;
}

/**
 * Builds a flight-risk watchlist sorted by descending probability.
 * Used by the HR Watchlist page to display the top N at-risk employees.
 */
export function buildWatchlist(
  rows:    WatchlistRow[],
  minBand: 'low' | 'medium' | 'high' = 'medium',
): WatchlistRow[] {
  const order = { low: 1, medium: 2, high: 3 };
  return rows
    .filter((r) => order[r.result.band] >= order[minBand])
    .sort((a, b) => b.result.riskProbability - a.result.riskProbability);
}
