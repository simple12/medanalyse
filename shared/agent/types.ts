/**
 * Shared types for the Medication Intelligence Agent (see AGENT_SPEC.md).
 * Phase 1 is read-only: condition-control review (Journey A).
 */

export type ControlStatus =
  | "controlled"
  | "improving"
  | "worsening"
  | "insufficient-data"
  | "unmonitored";

/** A single numeric marker reading pulled from an Observation (or a component). */
export interface MarkerReading {
  loinc: string;
  label: string;
  value: number;
  unit: string;
  /** ISO date of the observation (YYYY-MM-DD when we only have a day). */
  date: string;
}

export type TrendDirection = "up" | "down" | "flat";

/** Per-marker assessment: latest reading, trend, and whether it meets target. */
export interface MarkerAssessment {
  loinc: string;
  label: string;
  latest: MarkerReading;
  previous?: MarkerReading;
  trend: TrendDirection;
  /** null when the marker has no defined target to compare against. */
  withinTarget: boolean | null;
  status: ControlStatus;
  /** Human-readable target description, e.g. "< 140 mmHg". */
  target?: string;
}

export interface ConditionAssessment {
  conditionId?: string;
  conditionName: string;
  status: ControlStatus;
  markers: MarkerAssessment[];
  /** Names of MedicationRequests that appear to treat this condition (best-effort). */
  medications: string[];
  /** Deterministic, source-traceable explanation of the status. */
  rationale: string;
}

export interface EvidenceRef {
  source: string;
  citation: string;
  url?: string;
}

export type CardIndicator = "info" | "warning" | "critical";

export type RecommendationType =
  | "condition-status"
  | "alternate-therapy"
  | "interaction-alert";

export interface Recommendation {
  type: RecommendationType;
  title: string;
  detail: string;
  severity?: CardIndicator;
  /** Recommendations are never presented without at least one citation. */
  evidence: EvidenceRef[];
}

/** Shaped like a CDS Hooks Card so the in-app and CDS Hooks paths render consistently. */
export interface AgentCard {
  summary: string;
  indicator: CardIndicator;
  detail: string;
  assessments: ConditionAssessment[];
  recommendations: Recommendation[];
  disclaimer: string;
}

export interface ReviewResult {
  patientId: string;
  sourceId: string;
  generatedAt: string;
  card: AgentCard;
}

export const AGENT_DISCLAIMER =
  "Decision support only. Verify independently before acting. Not a substitute for clinical judgment.";
