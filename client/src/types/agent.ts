/**
 * Client-side mirror of the agent review result (shared/agent/types.ts).
 * Kept independent of the backend types, matching the app's convention of a
 * separate client FHIR type copy.
 */

export type ControlStatus =
  | "controlled"
  | "improving"
  | "worsening"
  | "insufficient-data"
  | "unmonitored";

export type CardIndicator = "info" | "warning" | "critical";

export interface MarkerReading {
  loinc: string;
  label: string;
  value: number;
  unit: string;
  date: string;
}

export interface MarkerAssessment {
  loinc: string;
  label: string;
  latest: MarkerReading;
  previous?: MarkerReading;
  trend: "up" | "down" | "flat";
  withinTarget: boolean | null;
  status: ControlStatus;
  target?: string;
}

export interface ConditionAssessment {
  conditionId?: string;
  conditionName: string;
  status: ControlStatus;
  markers: MarkerAssessment[];
  medications: string[];
  rationale: string;
}

export interface EvidenceRef {
  source: string;
  citation: string;
  url?: string;
}

export interface Recommendation {
  type: "condition-status" | "alternate-therapy" | "interaction-alert";
  title: string;
  detail: string;
  severity?: CardIndicator;
  evidence: EvidenceRef[];
}

export interface AgentCard {
  summary: string;
  indicator: CardIndicator;
  detail: string;
  assessments: ConditionAssessment[];
  recommendations: Recommendation[];
  disclaimer: string;
}

export interface AskCitation {
  resourceType: string;
  id?: string;
  excerpt: string;
}

export interface AskResult {
  patientId: string;
  sourceId: string;
  question: string;
  answer: string;
  citations: AskCitation[];
  disclaimer: string;
  mode: "llm" | "extractive";
  generatedAt: string;
}

export interface ReviewResult {
  patientId: string;
  sourceId: string;
  generatedAt: string;
  card: AgentCard;
}
