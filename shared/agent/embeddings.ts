/**
 * Embedding helper for GraphRAG chunks.
 * Locked to OpenAI text-embedding-3-small (1536-dim) for stable pgvector schema.
 * Uses dynamic import() of `ai` so Vercel CJS serverless wrappers do not hit
 * ERR_REQUIRE_ESM when loading unrelated agent routes (e.g. review).
 */

export const EMBEDDING_MODEL_ID = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

/** Do not auto-retry embedding calls (avoids burning tokens on transient failures). */
export const EMBEDDING_MAX_RETRIES = 0;

export function canEmbed(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.OPENAI_API_KEY?.trim());
}

async function openAiEmbeddingModel(env: NodeJS.ProcessEnv) {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required to embed GraphRAG chunks");
  }
  const { createOpenAI } = await import("@ai-sdk/openai");
  const openai = createOpenAI({ apiKey });
  return openai.embedding(EMBEDDING_MODEL_ID);
}

export async function embedText(
  text: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<number[]> {
  const { embed } = await import("ai");
  const model = await openAiEmbeddingModel(env);
  const { embedding } = await embed({
    model,
    value: text,
    maxRetries: EMBEDDING_MAX_RETRIES,
  });
  return embedding;
}

export async function embedTexts(
  texts: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const { embedMany } = await import("ai");
  const model = await openAiEmbeddingModel(env);
  const { embeddings } = await embedMany({
    model,
    values: texts,
    maxRetries: EMBEDDING_MAX_RETRIES,
  });
  return embeddings;
}

/** Format a JS number[] as a pgvector literal. */
export function toVectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}
