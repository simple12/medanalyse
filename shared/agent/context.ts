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

const TOKEN_SYNONYMS: Record<string, string[]> = {
  medication: ["medication", "medications", "med", "meds", "drug", "drugs", "rx", "prescription", "prescribed"],
  medications: ["medication", "medications", "med", "meds", "drug", "drugs", "rx", "prescription", "prescribed"],
  med: ["medication", "medications", "med", "meds", "drug", "drugs"],
  meds: ["medication", "medications", "med", "meds", "drug", "drugs"],
  drug: ["medication", "medications", "drug", "drugs", "rx"],
  drugs: ["medication", "medications", "drug", "drugs", "rx"],
  prescription: ["medication", "medications", "prescription", "prescribed", "rx"],
  prescribed: ["medication", "medications", "prescription", "prescribed", "rx"],
  condition: ["condition", "conditions", "diagnosis", "diagnoses", "problem"],
  conditions: ["condition", "conditions", "diagnosis", "diagnoses", "problem"],
  diagnosis: ["condition", "conditions", "diagnosis", "diagnoses"],
  vital: ["vital", "vitals", "observation", "observations", "bp", "pressure"],
  vitals: ["vital", "vitals", "observation", "observations", "bp", "pressure"],
  pressure: ["pressure", "blood", "bp", "systolic", "diastolic"],
  bp: ["pressure", "blood", "bp", "systolic", "diastolic"],
};

const MED_INTENT = new Set([
  "medication",
  "medications",
  "med",
  "meds",
  "drug",
  "drugs",
  "rx",
  "prescription",
  "prescribed",
]);

const CONDITION_INTENT = new Set([
  "condition",
  "conditions",
  "diagnosis",
  "diagnoses",
  "problem",
  "problems",
]);

const VITAL_INTENT = new Set([
  "vital",
  "vitals",
  "observation",
  "observations",
  "lab",
  "labs",
  "blood",
  "pressure",
  "bp",
  "a1c",
  "hba1c",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9%./+-]+/)
    .filter((token) => token.length > 1);
}

function expandTokens(tokens: Iterable<string>): Set<string> {
  const expanded = new Set<string>();
  for (const token of tokens) {
    expanded.add(token);
    for (const synonym of TOKEN_SYNONYMS[token] ?? []) {
      expanded.add(synonym);
    }
  }
  return expanded;
}

function chunk(
  resourceType: string,
  resourceId: string | undefined,
  text: string,
  index: number,
  extraTokens: string[] = [],
): ContextChunk {
  const tokens = new Set([...tokenize(text), ...extraTokens.map((t) => t.toLowerCase())]);
  return {
    id: `${resourceType}:${resourceId ?? index}`,
    resourceType,
    resourceId,
    text,
    tokens: [...tokens],
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
        ["condition", "diagnosis", "problem"],
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
        `Medication: ${name}. Status: ${status}. Authored: ${authored}.`,
        index,
        ["medication", "medications", "med", "meds", "drug", "drugs", "rx", "prescription"],
      ),
    );
  });

  input.observations.forEach((obs, index) => {
    const summary = observationSummary(obs);
    if (!summary) return;
    chunks.push(
      chunk("Observation", obs.id, summary, index, [
        "observation",
        "vital",
        "vitals",
        "lab",
      ]),
    );
  });

  input.assessments.forEach((assessment, index) => {
    chunks.push(
      chunk(
        "ConditionAssessment",
        assessment.conditionId,
        `Condition-control assessment for ${assessment.conditionName}: ${assessment.status}. ${assessment.rationale}`,
        index,
        ["condition", "assessment", "control"],
      ),
    );
  });

  return chunks;
}

function detectIntent(questionTokens: Set<string>): {
  prefersMeds: boolean;
  prefersConditions: boolean;
  prefersVitals: boolean;
} {
  let prefersMeds = false;
  let prefersConditions = false;
  let prefersVitals = false;
  for (const token of questionTokens) {
    if (MED_INTENT.has(token)) prefersMeds = true;
    if (CONDITION_INTENT.has(token)) prefersConditions = true;
    if (VITAL_INTENT.has(token)) prefersVitals = true;
  }
  return { prefersMeds, prefersConditions, prefersVitals };
}

function intentBoost(
  resourceType: string,
  intent: ReturnType<typeof detectIntent>,
): number {
  if (intent.prefersMeds && resourceType === "MedicationRequest") return 8;
  if (intent.prefersConditions && (resourceType === "Condition" || resourceType === "ConditionAssessment")) {
    return 6;
  }
  if (intent.prefersVitals && resourceType === "Observation") return 6;
  // When the question clearly asks for meds, demote observations so BP noise loses.
  if (intent.prefersMeds && !intent.prefersVitals && resourceType === "Observation") {
    return -4;
  }
  return 0;
}

/** Score chunks by overlapping question tokens plus intent boosts. */
export function retrieveRelevantChunks(
  question: string,
  chunks: ContextChunk[],
  topK = 8,
): { chunks: ContextChunk[]; citations: AskCitation[] } {
  const rawTokens = tokenize(question);
  const qTokens = expandTokens(rawTokens);
  const intent = detectIntent(qTokens);

  const scored = chunks
    .map((item) => {
      let score = intentBoost(item.resourceType, intent);
      const itemTokens = expandTokens(item.tokens);
      for (const token of itemTokens) {
        if (qTokens.has(token)) score += 1;
      }
      return { item, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);

  let selected =
    scored.length > 0
      ? scored.slice(0, topK).map((row) => row.item)
      : chunks.slice(0, Math.min(topK, chunks.length));

  // Strong med intent: if we have medication chunks, prefer them exclusively when available.
  if (intent.prefersMeds && !intent.prefersVitals) {
    const medChunks = chunks.filter((c) => c.resourceType === "MedicationRequest");
    if (medChunks.length > 0) {
      selected = medChunks.slice(0, topK);
    }
  }

  const citations: AskCitation[] = selected.map((item) => ({
    resourceType: item.resourceType,
    id: item.resourceId,
    excerpt: item.text.slice(0, 240),
  }));

  return { chunks: selected, citations };
}
