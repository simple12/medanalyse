/**
 * Journey C: ask a question about this patient (AGENT_SPEC.md).
 * Prefers Postgres/pgvector GraphRAG when DATABASE_URL + OPENAI_API_KEY are set;
 * falls back to in-memory retrieval over FHIR context.
 * Optional LLM phrasing via Vercel AI SDK / KV provider settings.
 */

import type { ResolvedFhirConnection } from "../fhir-sources.js";
import { assessConditionControl } from "./condition-control.js";
import { buildContextChunks, retrieveRelevantChunks } from "./context.js";
import { isGraphDbConfigured } from "./db.js";
import { canEmbed } from "./embeddings.js";
import { fetchPatientClinicalData } from "./fhir-reader.js";
import { retrieveFromGraph } from "./graph-retrieve.js";
import { syncPatientGraph } from "./graph-sync.js";
import { generateAgentAnswer } from "./llm.js";
import { AGENT_DISCLAIMER, type AskCitation, type AskResult } from "./types.js";

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
    "Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY on Vercel to enable natural-language answers over the same citations.",
  ].join("\n");
}

function sanitizeLlmError(message: string): string {
  if (/incorrect api key|invalid_api_key|unauthorized|authentication|api key not valid/i.test(message)) {
    return "The configured LLM API key was rejected. Check OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY in Vercel env vars.";
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

  let retrieval: AskResult["retrieval"] = "memory";
  let excerpts: string[] = [];
  let citations: AskCitation[] = [];
  let contextBlocks: string[] = [];

  const canGraph = isGraphDbConfigured(env) && canEmbed(env);
  if (canGraph) {
    try {
      await syncPatientGraph(
        {
          sourceId: connection.sourceId,
          patientId,
          conditions: clinical.conditions,
          observations: clinical.observations,
          medications: clinical.medications,
          assessments,
        },
        env,
      );

      const graph = await retrieveFromGraph(
        {
          sourceId: connection.sourceId,
          patientId,
          question: trimmed,
        },
        env,
      );

      if (graph.ok && graph.chunks.length > 0) {
        retrieval = "graphrag";
        excerpts = [
          ...graph.graphFacts.map((fact) => `Graph: ${fact}`),
          ...graph.chunks.map((chunk) => chunk.text),
        ];
        citations = graph.citations;
        contextBlocks = [
          ...graph.graphFacts.map((fact) => `[Graph] ${fact}`),
          ...graph.chunks.map(
            (chunk) =>
              `[${chunk.resourceType}${chunk.resourceId ? `/${chunk.resourceId}` : ""}] ${chunk.text}`,
          ),
        ];
      }
    } catch {
      // Fall through to in-memory retrieval.
      retrieval = "memory";
    }
  }

  if (retrieval === "memory") {
    const allChunks = buildContextChunks({
      ...clinical,
      assessments,
    });
    const memory = retrieveRelevantChunks(trimmed, allChunks);
    excerpts = memory.chunks.map((chunk) => chunk.text);
    citations = memory.citations;
    contextBlocks = memory.chunks.map(
      (chunk) =>
        `[${chunk.resourceType}${chunk.resourceId ? `/${chunk.resourceId}` : ""}] ${chunk.text}`,
    );
  }

  let mode: AskResult["mode"] = "extractive";
  let answer = buildExtractiveAnswer(trimmed, excerpts);

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
    retrieval,
    generatedAt: new Date().toISOString(),
  };
}
