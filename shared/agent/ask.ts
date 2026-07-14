/**
 * Journey C: ask a question about this patient (AGENT_SPEC.md).
 * MVP uses in-memory retrieval over FHIR + condition assessments.
 * Optional LLM phrasing via Vercel AI SDK when OPENAI_API_KEY or ANTHROPIC_API_KEY is set.
 * Postgres/pgvector GraphRAG is deferred.
 */

import type { ResolvedFhirConnection } from "../fhir-sources.js";
import { assessConditionControl } from "./condition-control.js";
import { buildContextChunks, retrieveRelevantChunks } from "./context.js";
import { fetchPatientClinicalData } from "./fhir-reader.js";
import { generateAgentAnswer } from "./llm.js";
import { AGENT_DISCLAIMER, type AskResult } from "./types.js";

function buildExtractiveAnswer(
  question: string,
  excerpts: string[],
): string {
  if (excerpts.length === 0) {
    return (
      `I could not find FHIR facts for this patient that relate to: "${question}". ` +
      "Try asking about a listed condition, medication, or vital/lab."
    );
  }

  return [
    "Based on the patient's chart facts (extractive answer; no LLM configured):",
    ...excerpts.map((excerpt) => `- ${excerpt}`),
    "Set OPENAI_API_KEY or ANTHROPIC_API_KEY on Vercel to enable natural-language answers over the same citations.",
  ].join("\n");
}

function sanitizeLlmError(message: string): string {
  // Avoid leaking key material or long provider URLs into the UI.
  if (/incorrect api key|invalid_api_key|unauthorized|authentication/i.test(message)) {
    return "The configured LLM API key was rejected. Check OPENAI_API_KEY or ANTHROPIC_API_KEY in Vercel env vars.";
  }
  return message.replace(/sk-(?:ant-)?[a-zA-Z0-9_-]+/g, "[redacted]").slice(0, 180);
}

export async function runPatientAsk(
  connection: ResolvedFhirConnection,
  patientId: string,
  question: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<AskResult> {
  const trimmed = question.trim();
  if (!trimmed) {
    throw new Error("question is required");
  }

  const clinical = await fetchPatientClinicalData(connection, patientId);
  const assessments = assessConditionControl(
    clinical.conditions,
    clinical.observations,
    clinical.medications,
  );

  const allChunks = buildContextChunks({
    ...clinical,
    assessments,
  });
  const { chunks, citations } = retrieveRelevantChunks(trimmed, allChunks);

  const contextBlocks = chunks.map(
    (chunk) => `[${chunk.resourceType}${chunk.resourceId ? `/${chunk.resourceId}` : ""}] ${chunk.text}`,
  );

  let mode: AskResult["mode"] = "extractive";
  let answer = buildExtractiveAnswer(
    trimmed,
    chunks.map((chunk) => chunk.text),
  );

  try {
    const llmAnswer = await generateAgentAnswer({
      question: trimmed,
      contextBlocks,
      env,
    });
    if (llmAnswer) {
      mode = "llm";
      answer = llmAnswer;
    }
  } catch (error) {
    // Fall back to extractive so the UI still works if the provider errors.
    const detail = sanitizeLlmError(
      error instanceof Error ? error.message : "LLM call failed",
    );
    answer = `${answer}\n\n(LLM unavailable: ${detail})`;
  }

  return {
    patientId,
    sourceId: connection.sourceId,
    question: trimmed,
    answer,
    citations,
    disclaimer: AGENT_DISCLAIMER,
    mode,
    generatedAt: new Date().toISOString(),
  };
}
