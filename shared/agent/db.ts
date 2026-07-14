/**
 * Neon / Postgres access for the patient knowledge graph (AGENT_SPEC.md §9).
 * Uses the Neon serverless driver so Vercel functions stay connection-light.
 */

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

export type SqlClient = NeonQueryFunction<false, false>;

let cachedSql: SqlClient | null = null;
let migrated = false;

const SCHEMA_STATEMENTS = [
  `CREATE EXTENSION IF NOT EXISTS vector`,
  `CREATE TABLE IF NOT EXISTS kg_nodes (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    patient_id TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    label TEXT NOT NULL,
    props JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS kg_nodes_source_patient_resource_uidx
    ON kg_nodes (source_id, patient_id, resource_type, resource_id)`,
  `CREATE INDEX IF NOT EXISTS kg_nodes_patient_idx ON kg_nodes (source_id, patient_id)`,
  `CREATE TABLE IF NOT EXISTS kg_edges (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    patient_id TEXT NOT NULL,
    from_node_id TEXT NOT NULL,
    to_node_id TEXT NOT NULL,
    rel_type TEXT NOT NULL,
    props JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS kg_edges_patient_idx ON kg_edges (source_id, patient_id)`,
  `CREATE INDEX IF NOT EXISTS kg_edges_from_idx ON kg_edges (from_node_id)`,
  `CREATE INDEX IF NOT EXISTS kg_edges_to_idx ON kg_edges (to_node_id)`,
  `CREATE TABLE IF NOT EXISTS kg_chunks (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    patient_id TEXT NOT NULL,
    node_id TEXT,
    resource_type TEXT NOT NULL,
    resource_id TEXT NOT NULL DEFAULT '',
    text TEXT NOT NULL,
    embedding vector(1536),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS kg_chunks_source_patient_resource_uidx
    ON kg_chunks (source_id, patient_id, resource_type, resource_id)`,
  `CREATE INDEX IF NOT EXISTS kg_chunks_patient_idx ON kg_chunks (source_id, patient_id)`,
  `CREATE TABLE IF NOT EXISTS kg_patient_sync (
    source_id TEXT NOT NULL,
    patient_id TEXT NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    chunk_count INTEGER NOT NULL DEFAULT 0,
    node_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (source_id, patient_id)
  )`,
];

export function resolveDatabaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return (
    env.DATABASE_URL?.trim() ||
    env.POSTGRES_URL?.trim() ||
    env.POSTGRES_PRISMA_URL?.trim() ||
    env.DATABASE_URL_POOLED?.trim() ||
    undefined
  );
}

export function isGraphDbConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(resolveDatabaseUrl(env));
}

export function getSql(env: NodeJS.ProcessEnv = process.env): SqlClient | null {
  const url = resolveDatabaseUrl(env);
  if (!url) return null;
  if (!cachedSql) {
    cachedSql = neon(url);
  }
  return cachedSql;
}

/** Reset cached client (tests). */
export function resetSqlCache(): void {
  cachedSql = null;
  migrated = false;
}

/**
 * Apply idempotent schema. Safe to call on every ask; runs once per cold start.
 */
export async function ensureGraphSchema(
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  const sql = getSql(env);
  if (!sql) return false;
  if (migrated) return true;

  for (const statement of SCHEMA_STATEMENTS) {
    await sql.query(statement);
  }

  try {
    await sql.query(`
      CREATE INDEX IF NOT EXISTS kg_chunks_embedding_hnsw_idx
      ON kg_chunks
      USING hnsw (embedding vector_cosine_ops)
    `);
  } catch {
    // Optional on small/empty free-plan DBs.
  }

  migrated = true;
  return true;
}
