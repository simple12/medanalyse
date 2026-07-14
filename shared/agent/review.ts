/**
 * Condition-control review orchestrator (AGENT_SPEC.md Journey A).
 * Reads the patient's clinical data, runs the deterministic engine, and
 * assembles a CDS-Hooks-shaped card. No LLM yet - the LLM prose layer and the
 * evidence-backed alternate-therapy suggestions are later increments, so this
 * never fabricates a drug name or a citation.
 */

import type { ResolvedFhirConnection } from "../fhir-sources.js";
import { assessConditionControl } from "./condition-control.js";
import { fetchPatientClinicalData } from "./fhir-reader.js";
import {
  AGENT_DISCLAIMER,
  type AgentCard,
  type CardIndicator,
  type ConditionAssessment,
  type Recommendation,
  type ReviewResult,
} from "./types.js";

function needsAttention(status: ConditionAssessment["status"]): boolean {
  return status === "worsening";
}

function markerEvidence(assessment: ConditionAssessment): string {
  return assessment.markers
    .map(
      (marker) =>
        `${marker.label} ${marker.latest.value} ${marker.latest.unit} on ${marker.latest.date}` +
        (marker.target ? ` (target ${marker.target})` : ""),
    )
    .join("; ");
}

function buildRecommendations(assessments: ConditionAssessment[]): Recommendation[] {
  return assessments.filter((a) => needsAttention(a.status)).map((assessment) => ({
    type: "condition-status" as const,
    title: `${assessment.conditionName} appears uncontrolled`,
    detail:
      `${assessment.rationale} ` +
      (assessment.medications.length > 0
        ? `Current related medications: ${assessment.medications.join(", ")}. `
        : "No medication on file is clearly linked to this condition. ") +
      "Consider reviewing therapy. Evidence-based alternative suggestions require the drug-evidence layer, which is not yet enabled.",
    severity: "warning" as const,
    // The evidence here is the patient's own trended readings - traceable, not fabricated.
    evidence: [
      {
        source: "Patient observations (FHIR)",
        citation: markerEvidence(assessment) || "No quantitative markers available",
      },
    ],
  }));
}

export function buildAgentCard(assessments: ConditionAssessment[]): AgentCard {
  const attention = assessments.filter((a) => needsAttention(a.status));
  const monitored = assessments.filter((a) => a.status !== "unmonitored");

  const indicator: CardIndicator = attention.length > 0 ? "warning" : "info";

  const summary =
    attention.length > 0
      ? `${attention.length} of ${assessments.length} condition(s) may need attention`
      : monitored.length > 0
        ? "All monitored conditions appear controlled"
        : "No monitorable conditions found for this patient";

  const detail =
    assessments.length === 0
      ? "No active conditions were found for this patient."
      : assessments
          .map((a) => `- ${a.conditionName}: ${a.status}`)
          .join("\n");

  return {
    summary,
    indicator,
    detail,
    assessments,
    recommendations: buildRecommendations(assessments),
    disclaimer: AGENT_DISCLAIMER,
  };
}

export async function runConditionReview(
  connection: ResolvedFhirConnection,
  patientId: string,
): Promise<ReviewResult> {
  const { conditions, observations, medications } = await fetchPatientClinicalData(
    connection,
    patientId,
  );

  const assessments = assessConditionControl(conditions, observations, medications);

  return {
    patientId,
    sourceId: connection.sourceId,
    generatedAt: new Date().toISOString(),
    card: buildAgentCard(assessments),
  };
}
