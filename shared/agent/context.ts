/**
 * Builds a lightweight, citation-bearing context from FHIR resources for Journey C.
 * Full Postgres/pgvector GraphRAG is deferred; this is in-memory retrieval over the
 * same clinical payload Journey A already loads.
 */

import {
  conceptLabel,
  medicationNameFromRequest,
  observationDate,
  type FhirCondition,
  type FhirMedicationRequest,
  type FhirObservation,
} from "./fhir.js";
import type { AskCitation, ConditionAssessment } from "./types.js";

export interface ContextChunk {
  id: string;
  resourceType: string;
  resourceId?: string;
  text: string;
  tokens: string[];
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9%./+-]+/)
    .filter((token) => token.length > 1);
}

function chunk(
  resourceType: string,
  resourceId: string | undefined,
  text: string,
  index: number,
): ContextChunk {
  return {
    id: `${resourceType}:${resourceId ?? index}`,
    resourceType,
    resourceId,
    text,
    tokens: tokenize(text),
  };
}

function observationSummary(obs: FhirObservation): string | null {
  const label = conceptLabel(obs.code) ?? "Observation";
  const date = observationDate(obs).slice(0, 10) || "unknown date";
  const parts: string[] = [];

  if (obs.valueQuantity?.value !== undefined) {
    parts.push(
      `${obs.valueQuantity.value} ${obs.valueQuantity.unit ?? ""}`.trim(),
    );
  }
  for (const component of obs.component ?? []) {
    const name = conceptLabel(component.code) ?? "component";
    if (component.valueQuantity?.value !== undefined) {
      parts.push(
        `${name} ${component.valueQuantity.value} ${component.valueQuantity.unit ?? ""}`.trim(),
      );
    }
  }
  if (parts.length === 0) return null;
  return `${label} on ${date}: ${parts.join("; ")}`;
}

export function buildContextChunks(input: {
  conditions: FhirCondition[];
  observations: FhirObservation[];
  medications: FhirMedicationRequest[];
  assessments: ConditionAssessment[];
}): ContextChunk[] {
  const chunks: ContextChunk[] = [];

  input.conditions.forEach((condition, index) => {
    const name = conceptLabel(condition.code) ?? "Unknown condition";
    const status =
      condition.clinicalStatus?.coding?.[0]?.code ??
      condition.clinicalStatus?.text ??
      "unknown";
    chunks.push(
      chunk(
        "Condition",
        condition.id,
        `Condition: ${name}. Clinical status: ${status}.`,
        index,
      ),
    );
  });

  input.medications.forEach((med, index) => {
    const name = medicationNameFromRequest(med);
    const status = med.status ?? "unknown";
    const authored = med.authoredOn?.slice(0, 10) ?? "unknown date";
    chunks.push(
      chunk(
        "MedicationRequest",
        med.id,
        `MedicationRequest: ${name}. Status: ${status}. Authored: ${authored}.`,
        index,
      ),
    );
  });

  input.observations.forEach((obs, index) => {
    const summary = observationSummary(obs);
    if (!summary) return;
    chunks.push(chunk("Observation", obs.id, summary, index));
  });

  input.assessments.forEach((assessment, index) => {
    chunks.push(
      chunk(
        "ConditionAssessment",
        assessment.conditionId,
        `Condition-control assessment for ${assessment.conditionName}: ${assessment.status}. ${assessment.rationale}`,
        index,
      ),
    );
  });

  return chunks;
}

/** Score chunks by overlapping question tokens; return topK with citations. */
export function retrieveRelevantChunks(
  question: string,
  chunks: ContextChunk[],
  topK = 8,
): { chunks: ContextChunk[]; citations: AskCitation[] } {
  const qTokens = new Set(tokenize(question));
  const scored = chunks
    .map((item) => {
      let score = 0;
      for (const token of item.tokens) {
        if (qTokens.has(token)) score += 1;
      }
      return { item, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);

  const selected =
    scored.length > 0
      ? scored.slice(0, topK).map((row) => row.item)
      : chunks.slice(0, Math.min(topK, chunks.length));

  const citations: AskCitation[] = selected.map((item) => ({
    resourceType: item.resourceType,
    id: item.resourceId,
    excerpt: item.text.slice(0, 240),
  }));

  return { chunks: selected, citations };
}
