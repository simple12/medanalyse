/**
 * Sync FHIR clinical data into kg_nodes / kg_edges / kg_chunks (GraphRAG).
 */

import { CONDITION_MARKER_PROFILES } from "./condition-markers.js";
import { buildContextChunks, type ContextChunk } from "./context.js";
import { ensureGraphSchema, getSql } from "./db.js";
import { canEmbed, embedTexts, toVectorLiteral } from "./embeddings.js";
import {
  conceptLabel,
  loincCodes,
  medicationNameFromRequest,
  type FhirCondition,
  type FhirMedicationRequest,
  type FhirObservation,
} from "./fhir.js";
import type { ConditionAssessment } from "./types.js";

export const GRAPH_SYNC_STALE_MS = 15 * 60 * 1000;

export interface GraphSyncInput {
  sourceId: string;
  patientId: string;
  conditions: FhirCondition[];
  observations: FhirObservation[];
  medications: FhirMedicationRequest[];
  assessments: ConditionAssessment[];
}

export interface GraphSyncResult {
  synced: boolean;
  skippedReason?: string;
  nodeCount: number;
  edgeCount: number;
  chunkCount: number;
  syncedAt?: string;
}

export interface PlannedNode {
  id: string;
  resourceType: string;
  resourceId: string;
  label: string;
  props: Record<string, unknown>;
}

export interface PlannedEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  relType: string;
}

function nodeId(
  sourceId: string,
  patientId: string,
  resourceType: string,
  resourceId: string,
): string {
  return `${sourceId}:${patientId}:${resourceType}:${resourceId}`;
}

function edgeId(
  sourceId: string,
  patientId: string,
  relType: string,
  fromId: string,
  toId: string,
): string {
  return `${sourceId}:${patientId}:${relType}:${fromId}->${toId}`;
}

function observationMatchesProfileLoinc(
  obs: FhirObservation,
  loincs: string[],
): boolean {
  const wanted = new Set(loincs);
  if (loincCodes(obs.code).some((code) => wanted.has(code))) return true;
  return Boolean(
    obs.component?.some((part) =>
      loincCodes(part.code).some((code) => wanted.has(code)),
    ),
  );
}

function conditionProfileKey(conditionName: string): string | undefined {
  const lower = conditionName.toLowerCase();
  return CONDITION_MARKER_PROFILES.find((profile) =>
    profile.keywords.some((keyword) => lower.includes(keyword)),
  )?.key;
}

/** Pure planner used by sync + unit tests (no DB). */
export function planPatientGraph(input: GraphSyncInput): {
  nodes: PlannedNode[];
  edges: PlannedEdge[];
  chunks: ContextChunk[];
} {
  const { sourceId, patientId } = input;
  const nodes: PlannedNode[] = [];
  const edges: PlannedEdge[] = [];

  const patientNode: PlannedNode = {
    id: nodeId(sourceId, patientId, "Patient", patientId),
    resourceType: "Patient",
    resourceId: patientId,
    label: `Patient ${patientId}`,
    props: {},
  };
  nodes.push(patientNode);

  for (const condition of input.conditions) {
    const resourceId = condition.id ?? conceptLabel(condition.code) ?? "unknown";
    const label = conceptLabel(condition.code) ?? "Unknown condition";
    const id = nodeId(sourceId, patientId, "Condition", resourceId);
    nodes.push({
      id,
      resourceType: "Condition",
      resourceId,
      label,
      props: {
        clinicalStatus:
          condition.clinicalStatus?.coding?.[0]?.code ??
          condition.clinicalStatus?.text ??
          null,
        profileKey: conditionProfileKey(label) ?? null,
      },
    });
    edges.push({
      id: edgeId(sourceId, patientId, "HAS_CONDITION", patientNode.id, id),
      fromNodeId: patientNode.id,
      toNodeId: id,
      relType: "HAS_CONDITION",
    });
  }

  for (const med of input.medications) {
    const resourceId = med.id ?? medicationNameFromRequest(med);
    const label = medicationNameFromRequest(med);
    const id = nodeId(sourceId, patientId, "MedicationRequest", resourceId);
    nodes.push({
      id,
      resourceType: "MedicationRequest",
      resourceId,
      label,
      props: {
        status: med.status ?? null,
        authoredOn: med.authoredOn ?? null,
      },
    });
    edges.push({
      id: edgeId(sourceId, patientId, "PRESCRIBED", patientNode.id, id),
      fromNodeId: patientNode.id,
      toNodeId: id,
      relType: "PRESCRIBED",
    });
  }

  for (const obs of input.observations) {
    const resourceId = obs.id ?? `obs-${nodes.length}`;
    const label = conceptLabel(obs.code) ?? "Observation";
    const id = nodeId(sourceId, patientId, "Observation", resourceId);
    nodes.push({
      id,
      resourceType: "Observation",
      resourceId,
      label,
      props: {
        loinc: loincCodes(obs.code),
      },
    });

    for (const condition of input.conditions) {
      const conditionName = conceptLabel(condition.code) ?? "";
      const profile = CONDITION_MARKER_PROFILES.find((p) =>
        p.keywords.some((keyword) =>
          conditionName.toLowerCase().includes(keyword),
        ),
      );
      if (!profile) continue;
      const matches = profile.markers.some((marker) =>
        observationMatchesProfileLoinc(obs, marker.loinc),
      );
      if (!matches) continue;
      const conditionResourceId =
        condition.id ?? conceptLabel(condition.code) ?? "unknown";
      const conditionNodeId = nodeId(
        sourceId,
        patientId,
        "Condition",
        conditionResourceId,
      );
      edges.push({
        id: edgeId(
          sourceId,
          patientId,
          "MONITORED_BY",
          conditionNodeId,
          id,
        ),
        fromNodeId: conditionNodeId,
        toNodeId: id,
        relType: "MONITORED_BY",
      });
    }
  }

  const chunks = buildContextChunks({
    conditions: input.conditions,
    observations: input.observations,
    medications: input.medications,
    assessments: input.assessments,
  });

  return { nodes, edges, chunks };
}

export async function getPatientSyncMeta(
  sourceId: string,
  patientId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ syncedAt: Date; chunkCount: number; nodeCount: number } | null> {
  const sql = getSql(env);
  if (!sql) return null;
  await ensureGraphSchema(env);
  const rows = await sql`
    SELECT synced_at, chunk_count, node_count
    FROM kg_patient_sync
    WHERE source_id = ${sourceId} AND patient_id = ${patientId}
    LIMIT 1
  `;
  const row = rows[0] as
    | { synced_at: string | Date; chunk_count: number; node_count: number }
    | undefined;
  if (!row) return null;
  return {
    syncedAt: new Date(row.synced_at),
    chunkCount: Number(row.chunk_count),
    nodeCount: Number(row.node_count),
  };
}

export function isSyncStale(
  syncedAt: Date | undefined,
  now = Date.now(),
  staleMs = GRAPH_SYNC_STALE_MS,
): boolean {
  if (!syncedAt) return true;
  return now - syncedAt.getTime() > staleMs;
}

export async function syncPatientGraph(
  input: GraphSyncInput,
  env: NodeJS.ProcessEnv = process.env,
  options: { force?: boolean } = {},
): Promise<GraphSyncResult> {
  const sql = getSql(env);
  if (!sql) {
    return {
      synced: false,
      skippedReason: "DATABASE_URL not configured",
      nodeCount: 0,
      edgeCount: 0,
      chunkCount: 0,
    };
  }
  if (!canEmbed(env)) {
    return {
      synced: false,
      skippedReason: "OPENAI_API_KEY required for embeddings",
      nodeCount: 0,
      edgeCount: 0,
      chunkCount: 0,
    };
  }

  await ensureGraphSchema(env);

  if (!options.force) {
    const meta = await getPatientSyncMeta(input.sourceId, input.patientId, env);
    if (meta && !isSyncStale(meta.syncedAt)) {
      return {
        synced: false,
        skippedReason: "fresh",
        nodeCount: meta.nodeCount,
        edgeCount: 0,
        chunkCount: meta.chunkCount,
        syncedAt: meta.syncedAt.toISOString(),
      };
    }
  }

  const planned = planPatientGraph(input);
  const embeddings = await embedTexts(
    planned.chunks.map((chunk) => chunk.text),
    env,
  );

  // Replace patient subgraph atomically enough for MVP (delete then insert).
  await sql`
    DELETE FROM kg_edges
    WHERE source_id = ${input.sourceId} AND patient_id = ${input.patientId}
  `;
  await sql`
    DELETE FROM kg_chunks
    WHERE source_id = ${input.sourceId} AND patient_id = ${input.patientId}
  `;
  await sql`
    DELETE FROM kg_nodes
    WHERE source_id = ${input.sourceId} AND patient_id = ${input.patientId}
  `;

  for (const node of planned.nodes) {
    await sql`
      INSERT INTO kg_nodes (id, source_id, patient_id, resource_type, resource_id, label, props, updated_at)
      VALUES (
        ${node.id},
        ${input.sourceId},
        ${input.patientId},
        ${node.resourceType},
        ${node.resourceId},
        ${node.label},
        ${node.props as never},
        now()
      )
    `;
  }

  for (const edge of planned.edges) {
    await sql`
      INSERT INTO kg_edges (id, source_id, patient_id, from_node_id, to_node_id, rel_type, props, updated_at)
      VALUES (
        ${edge.id},
        ${input.sourceId},
        ${input.patientId},
        ${edge.fromNodeId},
        ${edge.toNodeId},
        ${edge.relType},
        '{}'::jsonb,
        now()
      )
    `;
  }

  for (let i = 0; i < planned.chunks.length; i++) {
    const chunk = planned.chunks[i]!;
    const embedding = embeddings[i] ?? [];
    const vector = toVectorLiteral(embedding);
    const chunkId = `${input.sourceId}:${input.patientId}:chunk:${chunk.id}`;
    const nodeRef =
      chunk.resourceId != null
        ? nodeId(
            input.sourceId,
            input.patientId,
            chunk.resourceType === "ConditionAssessment"
              ? "Condition"
              : chunk.resourceType,
            chunk.resourceId,
          )
        : null;

    await sql.query(
      `INSERT INTO kg_chunks (id, source_id, patient_id, node_id, resource_type, resource_id, text, embedding, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector, now())`,
      [
        chunkId,
        input.sourceId,
        input.patientId,
        nodeRef,
        chunk.resourceType,
        chunk.resourceId ?? "",
        chunk.text,
        vector,
      ],
    );
  }

  const syncedAt = new Date().toISOString();
  await sql`
    INSERT INTO kg_patient_sync (source_id, patient_id, synced_at, chunk_count, node_count)
    VALUES (
      ${input.sourceId},
      ${input.patientId},
      ${syncedAt}::timestamptz,
      ${planned.chunks.length},
      ${planned.nodes.length}
    )
    ON CONFLICT (source_id, patient_id) DO UPDATE SET
      synced_at = EXCLUDED.synced_at,
      chunk_count = EXCLUDED.chunk_count,
      node_count = EXCLUDED.node_count
  `;

  return {
    synced: true,
    nodeCount: planned.nodes.length,
    edgeCount: planned.edges.length,
    chunkCount: planned.chunks.length,
    syncedAt,
  };
}
