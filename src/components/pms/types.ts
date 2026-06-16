// ─── PMS Engine — shared type definitions ─────────────────────────────────────

export type GoalPerspective = 'Financial' | 'Customer' | 'Operational' | 'Learning & Growth';
export type GoalStatus      = 'draft' | 'pending_approval' | 'approved' | 'rejected';
export type AppraisalPhase  = 'goal_setting' | 'mid_year' | 'evaluation' | 'calibration';

// ── Goal ──────────────────────────────────────────────────────────────────────

export interface GoalSchema {
  id:                   string;
  perspective:          GoalPerspective;
  goalName:             string;
  measureOfPerformance: string;
  description:          string;
  unitOfMeasurement:    string;
  target:               string;
  weightage:            number; // 0–100; grand total across all goals must = 100
  status:               GoalStatus;
}

// ── Appraisal policy / cycle ──────────────────────────────────────────────────

export interface PhaseWindow {
  opensAt:  string; // ISO-8601 date
  closesAt: string;
}

export interface AppraisalPolicy {
  id:              string;
  assessmentYear:  string;       // e.g. "FY 2026-27"
  goalSetting:     PhaseWindow;
  midYear:         PhaseWindow;
  evaluation:      PhaseWindow;
  calibration:     PhaseWindow;
  currentPhase:    AppraisalPhase;
  isActive:        boolean;
  remindersSent:   number;
  pendingCount:    number;       // employees who haven't completed goal setting
  totalEmployees:  number;
}

// ── Employee performance record (for 9-box) ───────────────────────────────────

export interface EmployeePerformanceRecord {
  id:             string;
  name:           string;
  initials:       string;
  role:           string;
  department:     string;
  currentScore:   number;      // 1–5 (X-axis: performance)
  potentialScore: number;      // 1–5 (Y-axis: potential)
  nineBoxX:       1 | 2 | 3;  // Low | Mid | High performance
  nineBoxY:       1 | 2 | 3;  // Low | Mid | High potential
  goalsCompleted: number;
  totalGoals:     number;
  avatarColor:    string;      // hex
}

// ── Per-perspective thresholds ────────────────────────────────────────────────

export interface PerspectiveThreshold {
  minWeight: number;
  maxWeight: number;
}

export const PERSPECTIVE_THRESHOLDS: Record<GoalPerspective, PerspectiveThreshold> = {
  Financial:          { minWeight: 20, maxWeight: 40 },
  Customer:           { minWeight: 15, maxWeight: 35 },
  Operational:        { minWeight: 15, maxWeight: 35 },
  'Learning & Growth':{ minWeight: 10, maxWeight: 25 },
};
