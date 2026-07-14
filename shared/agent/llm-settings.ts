/**
 * Runtime LLM provider/model settings stored in Vercel KV / Upstash Redis.
 * Changing these does not require a redeploy; API keys stay in env vars.
 */

export const LLM_SETTINGS_KEY = "agent:llm-settings";

export type LlmSettingsProvider = "openai" | "anthropic" | "gemini" | "none";

export interface LlmSettings {
  provider: LlmSettingsProvider;
  /** Optional model id for the selected provider. */
  model?: string;
  updatedAt: string;
}

export type LlmSettingsSource = "kv" | "env";

export interface EffectiveLlmSettings {
  provider: LlmSettingsProvider;
  model: string | null;
  source: LlmSettingsSource;
  kvConfigured: boolean;
}

function kvUrl(env: NodeJS.ProcessEnv): string | undefined {
  return (
    env.KV_REST_API_URL?.trim() ||
    env.UPSTASH_REDIS_REST_URL?.trim() ||
    undefined
  );
}

function kvToken(env: NodeJS.ProcessEnv): string | undefined {
  return (
    env.KV_REST_API_TOKEN?.trim() ||
    env.UPSTASH_REDIS_REST_TOKEN?.trim() ||
    undefined
  );
}

export function isKvConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(kvUrl(env) && kvToken(env));
}

async function getRedis(env: NodeJS.ProcessEnv) {
  const url = kvUrl(env);
  const token = kvToken(env);
  if (!url || !token) return null;
  const { Redis } = await import("@upstash/redis");
  return new Redis({ url, token });
}

function isProvider(value: unknown): value is LlmSettingsProvider {
  return (
    value === "openai" ||
    value === "anthropic" ||
    value === "gemini" ||
    value === "none"
  );
}

export function normalizeLlmSettingsInput(input: {
  provider?: unknown;
  model?: unknown;
}): Omit<LlmSettings, "updatedAt"> {
  if (!isProvider(input.provider)) {
    throw new Error("provider must be openai, anthropic, gemini, or none");
  }

  let model: string | undefined;
  if (input.model != null && input.model !== "") {
    if (typeof input.model !== "string") {
      throw new Error("model must be a string");
    }
    model = input.model.trim();
    if (!model) {
      throw new Error("model must be a non-empty string when provided");
    }
    if (model.length > 120) {
      throw new Error("model must be at most 120 characters");
    }
  }

  return {
    provider: input.provider,
    ...(model ? { model } : {}),
  };
}

function parseStoredSettings(value: unknown): LlmSettings | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { provider?: unknown; model?: unknown; updatedAt?: unknown };
  if (!isProvider(record.provider)) return null;
  const model =
    typeof record.model === "string" && record.model.trim()
      ? record.model.trim()
      : undefined;
  const updatedAt =
    typeof record.updatedAt === "string" && record.updatedAt.trim()
      ? record.updatedAt
      : new Date(0).toISOString();
  return {
    provider: record.provider,
    ...(model ? { model } : {}),
    updatedAt,
  };
}

export async function loadLlmSettings(
  env: NodeJS.ProcessEnv = process.env,
): Promise<LlmSettings | null> {
  const redis = await getRedis(env);
  if (!redis) return null;
  try {
    const value = await redis.get<unknown>(LLM_SETTINGS_KEY);
    return parseStoredSettings(value);
  } catch {
    // KV outage should not block extractive ask answers.
    return null;
  }
}

export async function saveLlmSettings(
  input: { provider: LlmSettingsProvider; model?: string },
  env: NodeJS.ProcessEnv = process.env,
): Promise<LlmSettings> {
  const redis = await getRedis(env);
  if (!redis) {
    throw new Error(
      "Vercel KV / Upstash Redis is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN).",
    );
  }

  const settings: LlmSettings = {
    ...normalizeLlmSettingsInput(input),
    updatedAt: new Date().toISOString(),
  };
  await redis.set(LLM_SETTINGS_KEY, settings);
  return settings;
}

/**
 * Overlay KV settings onto env so existing provider/model resolvers stay env-based.
 * Keys remain from env; only provider/model selection changes.
 */
export function applyLlmSettingsToEnv(
  env: NodeJS.ProcessEnv,
  settings: LlmSettings | null,
): NodeJS.ProcessEnv {
  if (!settings) return env;

  const merged: NodeJS.ProcessEnv = { ...env };
  merged.LLM_PROVIDER = settings.provider;

  if (settings.model) {
    if (settings.provider === "openai") {
      merged.OPENAI_MODEL = settings.model;
    } else if (settings.provider === "anthropic") {
      merged.ANTHROPIC_MODEL = settings.model;
    } else if (settings.provider === "gemini") {
      merged.GEMINI_MODEL = settings.model;
    }
  }

  return merged;
}

export function defaultModelForProvider(
  provider: LlmSettingsProvider,
  env: NodeJS.ProcessEnv,
): string | null {
  if (provider === "openai") {
    return env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  }
  if (provider === "anthropic") {
    return env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-5";
  }
  if (provider === "gemini") {
    return env.GEMINI_MODEL?.trim() || env.GOOGLE_MODEL?.trim() || "gemini-3.5-flash";
  }
  return null;
}

export async function resolveEffectiveLlmSettings(
  env: NodeJS.ProcessEnv = process.env,
  resolveProvider: (env: NodeJS.ProcessEnv) => LlmSettingsProvider,
): Promise<EffectiveLlmSettings> {
  const kvConfigured = isKvConfigured(env);
  const stored = await loadLlmSettings(env);
  const effectiveEnv = applyLlmSettingsToEnv(env, stored);
  const provider = resolveProvider(effectiveEnv);
  const model =
    stored?.model?.trim() ||
    defaultModelForProvider(provider, effectiveEnv);

  return {
    provider,
    model,
    source: stored ? "kv" : "env",
    kvConfigured,
  };
}

export function authorizeSettingsWrite(
  env: NodeJS.ProcessEnv,
  secretHeader: string | undefined,
): boolean {
  const configured = env.AGENT_SETTINGS_SECRET?.trim();
  if (!configured) return false;
  return Boolean(secretHeader && secretHeader === configured);
}
