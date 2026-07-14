/**
 * Pluggable LLM access for the agent (AGENT_SPEC.md section 11).
 * Uses dynamic import() of the Vercel AI SDK so Vercel's CJS serverless wrapper
 * does not crash with ERR_REQUIRE_ESM on top-level require("ai").
 *
 * Providers:
 * - openai (OPENAI_API_KEY, optional OPENAI_MODEL, default gpt-4o-mini)
 * - anthropic / claude (ANTHROPIC_API_KEY, optional ANTHROPIC_MODEL, default claude-sonnet-4-5)
 * - gemini / google (GOOGLE_GENERATIVE_AI_API_KEY or GEMINI_API_KEY, optional
 *   GEMINI_MODEL / GOOGLE_MODEL, default gemini-3.5-flash)
 *
 * Runtime selection: provider + model may be stored in Vercel KV / Upstash Redis
 * (see llm-settings.ts). API keys remain in env; KV changes do not need a redeploy.
 */

import {
  applyLlmSettingsToEnv,
  loadLlmSettings,
} from "./llm-settings.js";

export type LlmProviderName = "openai" | "anthropic" | "gemini" | "none";

const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-5";
const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";
const GEMINI_MODEL_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;

function hasOpenAI(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.OPENAI_API_KEY?.trim());
}

/**
 * Normalize Gemini model IDs from env.
 * Empty/quoted/`models/`-prefixed/invalid values fall back to the default
 * so Vercel misconfig cannot produce `/models/:generateContent`.
 */
export function resolveGeminiModelName(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const raw = env.GEMINI_MODEL?.trim() || env.GOOGLE_MODEL?.trim() || "";
  if (!raw) return DEFAULT_GEMINI_MODEL;

  let model = raw.replace(/^["']+|["']+$/g, "").trim();
  if (model.toLowerCase().startsWith("models/")) {
    model = model.slice("models/".length).trim();
  }
  // Allow publisher paths like publishers/google/models/gemini-3.5-flash.
  if (model.includes("/")) {
    model = model.split("/").filter(Boolean).pop() || "";
  }

  if (!model || !GEMINI_MODEL_PATTERN.test(model)) {
    return DEFAULT_GEMINI_MODEL;
  }
  return model;
}

function hasAnthropic(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.ANTHROPIC_API_KEY?.trim());
}

function geminiApiKey(env: NodeJS.ProcessEnv): string | undefined {
  return (
    env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    env.GEMINI_API_KEY?.trim() ||
    env.GOOGLE_API_KEY?.trim() ||
    undefined
  );
}

function hasGemini(env: NodeJS.ProcessEnv): boolean {
  return Boolean(geminiApiKey(env));
}

export function resolveLlmProvider(
  env: NodeJS.ProcessEnv = process.env,
): LlmProviderName {
  const configured = env.LLM_PROVIDER?.trim().toLowerCase();

  if (configured === "none") return "none";

  if (configured === "anthropic" || configured === "claude") {
    return hasAnthropic(env) ? "anthropic" : "none";
  }

  if (configured === "gemini" || configured === "google") {
    return hasGemini(env) ? "gemini" : "none";
  }

  if (configured === "openai") {
    return hasOpenAI(env) ? "openai" : "none";
  }

  // Auto-detect when LLM_PROVIDER is unset.
  // Prefer the single present provider; if several exist, keep OpenAI then Anthropic then Gemini.
  if (!configured) {
    const openai = hasOpenAI(env);
    const anthropic = hasAnthropic(env);
    const gemini = hasGemini(env);
    const count = Number(openai) + Number(anthropic) + Number(gemini);
    if (count === 1) {
      if (openai) return "openai";
      if (anthropic) return "anthropic";
      if (gemini) return "gemini";
    }
    if (openai) return "openai";
    if (anthropic) return "anthropic";
    if (gemini) return "gemini";
    return "none";
  }

  return "none";
}

const SYSTEM_PROMPT_PREFIX = [
  "You are a clinical decision-support assistant for a FHIR patient chart demo.",
  "Answer only from the provided patient context.",
  "If the context is insufficient, say what is missing.",
  "Do not invent labs, meds, or diagnoses.",
  "Cite concrete facts from the context (values and dates when present).",
  "Keep the answer concise (under 180 words).",
  "Remind the clinician this is decision support only.",
];

export async function generateAgentAnswer(input: {
  question: string;
  contextBlocks: string[];
  env?: NodeJS.ProcessEnv;
}): Promise<string | null> {
  const baseEnv = input.env ?? process.env;
  const stored = await loadLlmSettings(baseEnv);
  const env = applyLlmSettingsToEnv(baseEnv, stored);
  const provider = resolveLlmProvider(env);
  if (provider === "none") return null;

  const { generateText } = await import("ai");
  const context = input.contextBlocks.join("\n");
  const prompt = [
    ...SYSTEM_PROMPT_PREFIX,
    "",
    "Patient context:",
    context,
    "",
    `Question: ${input.question}`,
  ].join("\n");

  if (provider === "anthropic") {
    const apiKey = env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) return null;
    const modelName = env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;
    const { createAnthropic } = await import("@ai-sdk/anthropic");
    const anthropic = createAnthropic({ apiKey });
    const { text } = await generateText({
      model: anthropic(modelName),
      temperature: 0.2,
      prompt,
    });
    return text.trim() || null;
  }

  if (provider === "gemini") {
    const apiKey = geminiApiKey(env);
    if (!apiKey) return null;
    const modelName = resolveGeminiModelName(env);
    const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
    const google = createGoogleGenerativeAI({ apiKey });
    // Gemini 3.x recommends omitting sampling params like temperature.
    const omitSampling = /^gemini-3[.-]/i.test(modelName);
    try {
      const { text } = await generateText({
        model: google(modelName),
        ...(omitSampling ? {} : { temperature: 0.2 }),
        prompt,
      });
      return text.trim() || null;
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "Gemini request failed";
      throw new Error(`${detail} (model=${modelName})`);
    }
  }

  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  const modelName = env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
  const { createOpenAI } = await import("@ai-sdk/openai");
  const openai = createOpenAI({ apiKey });
  const { text } = await generateText({
    model: openai(modelName),
    temperature: 0.2,
    prompt,
  });
  return text.trim() || null;
}
