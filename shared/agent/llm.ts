/**
 * Pluggable LLM access for the agent (AGENT_SPEC.md section 11).
 * Uses the Vercel AI SDK. OpenAI is the default development adapter.
 */

import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

export type LlmProviderName = "openai" | "none";

export function resolveLlmProvider(
  env: NodeJS.ProcessEnv = process.env,
): LlmProviderName {
  const configured = env.LLM_PROVIDER?.trim().toLowerCase();
  if (configured === "none") return "none";
  if (configured === "openai" || !configured) {
    return env.OPENAI_API_KEY?.trim() ? "openai" : "none";
  }
  // Unknown provider names fall back to none so the route still works extractively.
  return env.OPENAI_API_KEY?.trim() && configured === "openai" ? "openai" : "none";
}

export async function generateAgentAnswer(input: {
  question: string;
  contextBlocks: string[];
  env?: NodeJS.ProcessEnv;
}): Promise<string | null> {
  const env = input.env ?? process.env;
  const provider = resolveLlmProvider(env);
  if (provider === "none") return null;

  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const modelName = env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const openai = createOpenAI({ apiKey });

  const context = input.contextBlocks.join("\n");
  const { text } = await generateText({
    model: openai(modelName),
    temperature: 0.2,
    prompt: [
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
    ].join("\n"),
  });

  return text.trim() || null;
}
