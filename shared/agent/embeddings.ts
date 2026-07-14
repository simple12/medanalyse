/**
 * Embedding helper for GraphRAG chunks.
 * Locked to OpenAI text-embedding-3-small (1536-dim) for stable pgvector schema.
 */

import { embed, embedMany } from "ai";

export const EMBEDDING_MODEL_ID = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

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
  const model = await openAiEmbeddingModel(env);
  const { embedding } = await embed({ model, value: text });
  return embedding;
}

export async function embedTexts(
  texts: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const model = await openAiEmbeddingModel(env);
  const { embeddings } = await embedMany({ model, values: texts });
  return embeddings;
}

/** Format a JS number[] as a pgvector literal. */
export function toVectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}
