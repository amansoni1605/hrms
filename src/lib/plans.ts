/**
 * Subscription plan catalog + feature entitlements.
 *
 * The Tenant.subscription.tier governs which feature MODULES a workspace can
 * use.  Core HR (dashboard, employees, departments, leaves, profile, settings)
 * is always available; the modules below unlock by plan.  This catalog is the
 * single source of truth for both the pricing UI and the server-side gate.
 */

export type FeatureKey = 'payroll' | 'performance' | 'analytics' | 'immigration';
export type PlanTier   = 'starter' | 'growth' | 'enterprise' | 'global';

export interface Plan {
  tier:         PlanTier;
  name:         string;
  pricePerSeat: number;        // USD / seat / month (0 = free)
  maxSeats:     number;        // -1 = unlimited
  features:     FeatureKey[];  // modules unlocked (cumulative by tier)
  tagline:      string;
  highlights:   string[];      // human-readable bullet list for the pricing card
}

// Human labels for feature keys (used in pricing cards + upgrade prompts).
export const FEATURE_LABELS: Record<FeatureKey, string> = {
  payroll:     'Payroll & Payslips',
  performance: 'Performance Management (PMS)',
  analytics:   'Analytics & Burnout AI',
  immigration: 'Immigration & AI Workers',
};

export const PLANS: Record<PlanTier, Plan> = {
  starter: {
    tier: 'starter', name: 'Starter', pricePerSeat: 0, maxSeats: 25, features: [],
    tagline: 'Core HR for small teams getting started.',
    highlights: ['Employee directory', 'Leave management', 'Self-service profiles', 'Up to 25 seats'],
  },
  growth: {
    tier: 'growth', name: 'Growth', pricePerSeat: 6, maxSeats: 200,
    features: ['payroll', 'performance'],
    tagline: 'Run payroll and performance reviews as you scale.',
    highlights: ['Everything in Starter', 'Payroll & payslips', 'Performance reviews (PMS)', 'Up to 200 seats'],
  },
  enterprise: {
    tier: 'enterprise', name: 'Enterprise', pricePerSeat: 12, maxSeats: 2000,
    features: ['payroll', 'performance', 'analytics', 'immigration'],
    tagline: 'Full workforce intelligence and compliance.',
    highlights: ['Everything in Growth', 'Workforce analytics & Burnout AI', 'Immigration & AI workers', 'Two-step comp approval', 'Up to 2,000 seats'],
  },
  global: {
    tier: 'global', name: 'Global', pricePerSeat: 20, maxSeats: -1,
    features: ['payroll', 'performance', 'analytics', 'immigration'],
    tagline: 'Multi-entity scale with unlimited seats.',
    highlights: ['Everything in Enterprise', 'Unlimited seats', 'Priority support & SLAs', 'Multi-entity ready'],
  },
};

export const PLAN_ORDER: PlanTier[] = ['starter', 'growth', 'enterprise', 'global'];

/** Resolve a plan, defaulting unknown tiers to Starter. */
export function getPlan(tier?: string): Plan {
  return PLANS[(tier as PlanTier)] ?? PLANS.starter;
}

/** Feature keys unlocked by a tier. */
export function planFeatures(tier?: string): FeatureKey[] {
  return getPlan(tier).features;
}

/** Whether a tier unlocks a given feature module. */
export function hasFeature(tier: string | undefined, key: FeatureKey): boolean {
  return planFeatures(tier).includes(key);
}

/** Lowest tier that includes a feature — for "Upgrade to X" prompts. */
export function minTierFor(key: FeatureKey): PlanTier {
  return PLAN_ORDER.find((t) => PLANS[t].features.includes(key)) ?? 'enterprise';
}
