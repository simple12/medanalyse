/**
 * Hybrid GraphRAG retrieval: vector similarity over kg_chunks plus graph neighborhood facts.
 */

import type { ContextChunk } from "./context.js";
import { ensureGraphSchema, getSql } from "./db.js";
import { canEmbed, embedText, toVectorLiteral } from "./embeddings.js";
import type { AskCitation } from "./types.js";

export interface GraphRetrieveResult {
  ok: boolean;
  reason?: string;
  chunks: ContextChunk[];
  citations: AskCitation[];
  graphFacts: string[];
}

interface ChunkRow {
  id: string;
  resource_type: string;
  resource_id: string;
  text: string;
  distance: number;
}

interface EdgeFactRow {
  rel_type: string;
  from_label: string;
  to_label: string;
  from_type: string;
  to_type: string;
}

function intentHints(question: string): {
  prefersMeds: boolean;
  prefersConditions: boolean;
  prefersVitals: boolean;
} {
  const q = question.toLowerCase();
  return {
    prefersMeds: /\b(med|meds|medication|medications|drug|drugs|rx|prescription|prescribed)\b/.test(
      q,
    ),
    prefersConditions:
      /\b(condition|conditions|diagnosis|diagnoses|problem|problems)\b/.test(q),
    prefersVitals:
      /\b(vital|vitals|observation|observations|lab|labs|bp|pressure|a1c|hba1c)\b/.test(
        q,
      ),
  };
}

function typeBoost(resourceType: string, intent: ReturnType<typeof intentHints>): number {
  if (intent.prefersMeds && resourceType === "MedicationRequest") return -0.15;
  if (
    intent.prefersConditions &&
    (resourceType === "Condition" || resourceType === "ConditionAssessment")
  ) {
    return -0.1;
  }
  if (intent.prefersVitals && resourceType === "Observation") return -0.1;
  if (intent.prefersMeds && !intent.prefersVitals && resourceType === "Observation") {
    return 0.2;
  }
  return 0;
}

export async function retrieveFromGraph(
  input: {
    sourceId: string;
    patientId: string;
    question: string;
    topK?: number;
  },
  env: NodeJS.ProcessEnv = process.env,
): Promise<GraphRetrieveResult> {
  const sql = getSql(env);
  if (!sql) {
    return {
      ok: false,
      reason: "DATABASE_URL not configured",
      chunks: [],
      citations: [],
      graphFacts: [],
    };
  }
  if (!canEmbed(env)) {
    return {
      ok: false,
      reason: "OPENAI_API_KEY required for embeddings",
      chunks: [],
      citations: [],
      graphFacts: [],
    };
  }

  await ensureGraphSchema(env);

  const topK = input.topK ?? 8;
  const queryEmbedding = await embedText(input.question, env);
  const vector = toVectorLiteral(queryEmbedding);
  const intent = intentHints(input.question);

  const rows = (await sql.query(
    `SELECT id, resource_type, resource_id, text,
            (embedding <=> $1::vector) AS distance
     FROM kg_chunks
     WHERE source_id = $2 AND patient_id = $3 AND embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector
     LIMIT $4`,
    [vector, input.sourceId, input.patientId, Math.max(topK * 3, 12)],
  )) as ChunkRow[];

  if (!rows.length) {
    return {
      ok: false,
      reason: "no chunks for patient",
      chunks: [],
      citations: [],
      graphFacts: [],
    };
  }

  const ranked = rows
    .map((row) => ({
      row,
      score: Number(row.distance) + typeBoost(row.resource_type, intent),
    }))
    .sort((a, b) => a.score - b.score);

  let selected = ranked.slice(0, topK).map((item) => item.row);

  if (intent.prefersMeds && !intent.prefersVitals) {
    const medRows = ranked
      .filter((item) => item.row.resource_type === "MedicationRequest")
      .map((item) => item.row);
    if (medRows.length > 0) {
      selected = medRows.slice(0, topK);
    }
  }

  const chunks: ContextChunk[] = selected.map((row) => ({
    id: row.id,
    resourceType: row.resource_type,
    resourceId: row.resource_id || undefined,
    text: row.text,
    tokens: [],
  }));

  const citations: AskCitation[] = chunks.map((chunk) => ({
    resourceType: chunk.resourceType,
    id: chunk.resourceId,
    excerpt: chunk.text.slice(0, 240),
  }));

  const edgeRows = (await sql`
    SELECT e.rel_type, f.label AS from_label, t.label AS to_label,
           f.resource_type AS from_type, t.resource_type AS to_type
    FROM kg_edges e
    JOIN kg_nodes f ON f.id = e.from_node_id
    JOIN kg_nodes t ON t.id = e.to_node_id
    WHERE e.source_id = ${input.sourceId} AND e.patient_id = ${input.patientId}
    ORDER BY e.rel_type, f.label
    LIMIT 40
  `) as EdgeFactRow[];

  let graphFacts = edgeRows.map(
    (edge) =>
      `${edge.from_type} "${edge.from_label}" -${edge.rel_type}-> ${edge.to_type} "${edge.to_label}"`,
  );

  if (intent.prefersMeds) {
    const medFacts = graphFacts.filter((fact) => fact.includes("PRESCRIBED"));
    if (medFacts.length) graphFacts = [...medFacts, ...graphFacts.filter((f) => !medFacts.includes(f))];
  }

  return {
    ok: true,
    chunks,
    citations,
    graphFacts: graphFacts.slice(0, 16),
  };
}
