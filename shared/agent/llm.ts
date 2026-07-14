/**
 * Pluggable LLM access for the agent (AGENT_SPEC.md section 11).
 * Uses dynamic import() of the Vercel AI SDK so Vercel's CJS serverless wrapper
 * does not crash with ERR_REQUIRE_ESM on top-level require("ai").
 *
 * Providers:
 * - openai (OPENAI_API_KEY, optional OPENAI_MODEL, default gpt-4o-mini)
 * - anthropic / claude (ANTHROPIC_API_KEY, optional ANTHROPIC_MODEL, default claude-sonnet-4-5)
 */

export type LlmProviderName = "openai" | "anthropic" | "none";

const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-5";

export function resolveLlmProvider(
  env: NodeJS.ProcessEnv = process.env,
): LlmProviderName {
  const configured = env.LLM_PROVIDER?.trim().toLowerCase();
  const hasOpenAI = Boolean(env.OPENAI_API_KEY?.trim());
  const hasAnthropic = Boolean(env.ANTHROPIC_API_KEY?.trim());

  if (configured === "none") return "none";

  if (configured === "anthropic" || configured === "claude") {
    return hasAnthropic ? "anthropic" : "none";
  }

  if (configured === "openai") {
    return hasOpenAI ? "openai" : "none";
  }

  // Auto-detect when LLM_PROVIDER is unset: prefer explicitly present keys.
  // If both are set, prefer Anthropic only when OPENAI is absent? Prefer OpenAI
  // for backward compatibility when both exist; Anthropic when only Anthropic is set.
  if (!configured) {
    if (hasAnthropic && !hasOpenAI) return "anthropic";
    if (hasOpenAI) return "openai";
    return "none";
  }

  return "none";
}

export async function generateAgentAnswer(input: {
  question: string;
  contextBlocks: string[];
  env?: NodeJS.ProcessEnv;
}): Promise<string | null> {
  const env = input.env ?? process.env;
  const provider = resolveLlmProvider(env);
  if (provider === "none") return null;

  const { generateText } = await import("ai");
  const context = input.contextBlocks.join("\n");
  const prompt = [
    "You are a clinical decision-support assistant for a FHIR patient chart demo.",
    "Answer only from the provided patient context.",
    "If the context is insufficient, say what is missing.",
    "Do not invent labs, meds, or diagnoses.",
    "Cite concrete facts from the context (values and dates when present).",
    "Keep the answer concise (under 180 words).",
    "Remind the clinician this is decision support only.",
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
