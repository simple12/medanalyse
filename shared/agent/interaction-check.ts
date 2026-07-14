/**
 * Journey B1: pre-submit medication interaction check (AGENT_SPEC.md).
 * Uses curated DDInter subset + patient MedicationRequests (and best-effort allergies).
 */

import type { ResolvedFhirConnection } from "../fhir-sources.js";
import {
  DDINTER_EVIDENCE,
  findInteractionsForProposed,
  resolveDrugIdentity,
  severityToIndicator,
  extractRxnormFromCodings,
} from "./ddinter/index.js";
import {
  conceptLabel,
  medicationNameFromRequest,
  type FhirAllergyIntolerance,
  type FhirMedicationRequest,
} from "./fhir.js";
import { fetchPatientClinicalData } from "./fhir-reader.js";
import {
  AGENT_DISCLAIMER,
  INTERACTION_SUBMIT_BLOCKED_REASON,
  type AgentCard,
  type InteractionCheckResult,
  type InteractionFinding,
  type ProposedMedication,
  type Recommendation,
} from "./types.js";

const ACTIVE_MED_STATUSES = new Set([
  "active",
  "on-hold",
  "draft",
  "unknown",
  "",
]);

function isRelevantMedication(med: FhirMedicationRequest): boolean {
  const status = (med.status ?? "").toLowerCase();
  // Include completed for demo charts that only have historical aspirin, etc.
  if (!status || ACTIVE_MED_STATUSES.has(status) || status === "completed") {
    return status !== "entered-in-error" && status !== "cancelled";
  }
  return false;
}

export function medicationIdentity(med: FhirMedicationRequest): {
  rxnorm?: string;
  display: string;
  id?: string;
} {
  const rxnorm = extractRxnormFromCodings(med.medicationCodeableConcept?.coding);
  const display = medicationNameFromRequest(med);
  return { rxnorm, display, id: med.id };
}

function allergyLabels(allergies: FhirAllergyIntolerance[]): string[] {
  return allergies
    .map((allergy) => conceptLabel(allergy.code))
    .filter((label): label is string => Boolean(label));
}

export function allergyWarningsForProposed(
  proposedDisplay: string,
  allergies: FhirAllergyIntolerance[],
): string[] {
  const proposed = proposedDisplay.trim().toLowerCase();
  if (!proposed) return [];
  const warnings: string[] = [];
  for (const label of allergyLabels(allergies)) {
    const lower = label.toLowerCase();
    if (proposed.includes(lower) || lower.includes(proposed.split(/\s+/)[0] ?? "")) {
      warnings.push(label);
    }
  }
  return warnings;
}

export function buildInteractionCheckResult(input: {
  patientId: string;
  sourceId: string;
  proposed: ProposedMedication;
  medications: FhirMedicationRequest[];
  allergies: FhirAllergyIntolerance[];
  allergiesUnavailable: boolean;
  generatedAt?: string;
}): InteractionCheckResult {
  const display = input.proposed.display.trim();
  if (!display && !input.proposed.rxnormCode?.trim()) {
    throw new Error("proposedMedication.display or rxnormCode is required");
  }

  const proposedIdentity = {
    rxnormCode: input.proposed.rxnormCode?.trim() || undefined,
    display: display || input.proposed.rxnormCode?.trim() || "Unknown medication",
  };

  const proposedDrug = resolveDrugIdentity(proposedIdentity);
  const currentMeds = input.medications
    .filter(isRelevantMedication)
    .map((med) => {
      const identity = medicationIdentity(med);
      return {
        ...identity,
        requestId: med.id,
      };
    });

  const hits = proposedDrug
    ? findInteractionsForProposed(
        proposedDrug,
        currentMeds.map((med) => ({
          rxnorm: med.rxnorm,
          display: med.display,
        })),
      )
    : [];

  const findings: InteractionFinding[] = hits.map((hit) => {
    const match = currentMeds.find(
      (med) =>
        med.rxnorm === hit.current.rxnorm ||
        med.display.toLowerCase().includes(hit.current.display.toLowerCase()),
    );
    return {
      severity: hit.severity,
      proposedDisplay: hit.proposed.display,
      proposedRxnorm: hit.proposed.rxnorm,
      currentDisplay: hit.current.display,
      currentRxnorm: hit.current.rxnorm,
      currentMedicationRequestId: match?.requestId,
      mechanism: hit.interaction.mechanism,
      alternatives: hit.alternatives.map((alt) => ({
        rxnorm: alt.rxnorm,
        display: alt.display,
      })),
    };
  });

  const allergyWarnings = allergyWarningsForProposed(
    proposedIdentity.display,
    input.allergies,
  );

  const recommendations: Recommendation[] = findings.map((finding) => ({
    type: "interaction-alert" as const,
    title: `${finding.severity.toUpperCase()}: ${finding.proposedDisplay} + ${finding.currentDisplay}`,
    detail:
      finding.mechanism +
      (finding.alternatives.length
        ? ` Consider alternatives: ${finding.alternatives.map((a) => a.display).join(", ")}.`
        : ""),
    severity:
      finding.severity === "major"
        ? "critical"
        : finding.severity === "moderate"
          ? "warning"
          : "info",
    evidence: [DDINTER_EVIDENCE],
  }));

  for (const warning of allergyWarnings) {
    recommendations.push({
      type: "interaction-alert",
      title: `Allergy caution: ${warning}`,
      detail: `Patient allergy list includes "${warning}", which may relate to the proposed medication ${proposedIdentity.display}. Verify before ordering.`,
      severity: "critical",
      evidence: [
        {
          source: "FHIR AllergyIntolerance",
          citation: `Matched allergy label: ${warning}`,
        },
      ],
    });
  }

  let noKnownInteractionMessage: string | undefined;
  if (findings.length === 0) {
    noKnownInteractionMessage = proposedDrug
      ? `No known interaction in the DDInter MVP subset between ${proposedIdentity.display} and the patient's listed medications. This does not mean the combination is safe.`
      : `Proposed medication "${proposedIdentity.display}" is not mapped in the DDInter MVP subset, so drug-drug pairs could not be evaluated. This does not mean the combination is safe.`;
  }

  const topSeverity = findings[0]?.severity;
  const indicator = allergyWarnings.length
    ? "critical"
    : topSeverity
      ? severityToIndicator(topSeverity)
      : "info";

  const summary =
    findings.length > 0
      ? `${findings.length} known interaction${findings.length === 1 ? "" : "s"} for ${proposedIdentity.display}`
      : `No known interactions in DDInter subset for ${proposedIdentity.display}`;

  const detailParts = [
    findings.length
      ? findings.map((f) => f.mechanism).join(" ")
      : noKnownInteractionMessage,
    input.allergiesUnavailable
      ? "AllergyIntolerance could not be read (missing scope or server error); allergy screening skipped."
      : null,
  ].filter(Boolean);

  const card: AgentCard = {
    summary,
    indicator,
    detail: detailParts.join(" "),
    assessments: [],
    recommendations,
    disclaimer: AGENT_DISCLAIMER,
  };

  return {
    patientId: input.patientId,
    sourceId: input.sourceId,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    proposed: {
      display: proposedIdentity.display,
      rxnormCode: proposedDrug?.rxnorm ?? proposedIdentity.rxnormCode,
    },
    findings,
    allergiesUnavailable: input.allergiesUnavailable,
    allergyWarnings,
    knownInteractionCount: findings.length,
    noKnownInteractionMessage,
    card,
    submitEnabled: false,
    submitBlockedReason: INTERACTION_SUBMIT_BLOCKED_REASON,
  };
}

export async function runInteractionCheck(
  connection: ResolvedFhirConnection,
  patientId: string,
  proposed: ProposedMedication,
): Promise<InteractionCheckResult> {
  const clinical = await fetchPatientClinicalData(connection, patientId);
  return buildInteractionCheckResult({
    patientId,
    sourceId: connection.sourceId,
    proposed,
    medications: clinical.medications,
    allergies: clinical.allergies,
    allergiesUnavailable: clinical.allergiesUnavailable,
  });
}
