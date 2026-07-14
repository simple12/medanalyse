-- Knowledge graph + pgvector chunks for Journey C GraphRAG (AGENT_SPEC.md section 9).

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS kg_nodes (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  label TEXT NOT NULL,
  props JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS kg_nodes_source_patient_resource_uidx
  ON kg_nodes (source_id, patient_id, resource_type, resource_id);

CREATE INDEX IF NOT EXISTS kg_nodes_patient_idx
  ON kg_nodes (source_id, patient_id);

CREATE TABLE IF NOT EXISTS kg_edges (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  from_node_id TEXT NOT NULL REFERENCES kg_nodes (id) ON DELETE CASCADE,
  to_node_id TEXT NOT NULL REFERENCES kg_nodes (id) ON DELETE CASCADE,
  rel_type TEXT NOT NULL,
  props JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kg_edges_patient_idx
  ON kg_edges (source_id, patient_id);

CREATE INDEX IF NOT EXISTS kg_edges_from_idx
  ON kg_edges (from_node_id);

CREATE INDEX IF NOT EXISTS kg_edges_to_idx
  ON kg_edges (to_node_id);

CREATE TABLE IF NOT EXISTS kg_chunks (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  node_id TEXT REFERENCES kg_nodes (id) ON DELETE SET NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL,
  embedding vector(1536),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS kg_chunks_source_patient_resource_uidx
  ON kg_chunks (source_id, patient_id, resource_type, resource_id);

CREATE INDEX IF NOT EXISTS kg_chunks_patient_idx
  ON kg_chunks (source_id, patient_id);

-- HNSW requires enough rows for meaningful use; create if supported.
CREATE INDEX IF NOT EXISTS kg_chunks_embedding_hnsw_idx
  ON kg_chunks
  USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS kg_patient_sync (
  source_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  chunk_count INTEGER NOT NULL DEFAULT 0,
  node_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (source_id, patient_id)
);
