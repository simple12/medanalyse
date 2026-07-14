import { describe, expect, it } from "vitest";
import {
  applyLlmSettingsToEnv,
  authorizeSettingsWrite,
  isKvConfigured,
  normalizeLlmSettingsInput,
} from "./llm-settings.js";

describe("normalizeLlmSettingsInput", () => {
  it("accepts provider and optional model", () => {
    expect(normalizeLlmSettingsInput({ provider: "gemini" })).toEqual({
      provider: "gemini",
    });
    expect(
      normalizeLlmSettingsInput({
        provider: "openai",
        model: " gpt-4o-mini ",
      }),
    ).toEqual({ provider: "openai", model: "gpt-4o-mini" });
  });

  it("rejects invalid provider", () => {
    expect(() => normalizeLlmSettingsInput({ provider: "ollama" })).toThrow(
      /provider must/,
    );
  });
});

describe("applyLlmSettingsToEnv", () => {
  it("overlays provider and model onto env copies", () => {
    const merged = applyLlmSettingsToEnv(
      {
        LLM_PROVIDER: "openai",
        OPENAI_API_KEY: "sk-test",
        GEMINI_API_KEY: "g-test",
      },
      {
        provider: "gemini",
        model: "gemini-3.5-flash",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    );
    expect(merged.LLM_PROVIDER).toBe("gemini");
    expect(merged.GEMINI_MODEL).toBe("gemini-3.5-flash");
    expect(merged.OPENAI_API_KEY).toBe("sk-test");
    expect(merged.GEMINI_API_KEY).toBe("g-test");
  });

  it("returns env unchanged when settings are null", () => {
    const env = { LLM_PROVIDER: "anthropic" };
    expect(applyLlmSettingsToEnv(env, null)).toBe(env);
  });
});

describe("isKvConfigured / authorizeSettingsWrite", () => {
  it("detects KV url+token pairs", () => {
    expect(isKvConfigured({})).toBe(false);
    expect(
      isKvConfigured({
        KV_REST_API_URL: "https://example.upstash.io",
        KV_REST_API_TOKEN: "token",
      }),
    ).toBe(true);
    expect(
      isKvConfigured({
        UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
        UPSTASH_REDIS_REST_TOKEN: "token",
      }),
    ).toBe(true);
  });

  it("requires AGENT_SETTINGS_SECRET for writes", () => {
    expect(authorizeSettingsWrite({}, "secret")).toBe(false);
    expect(
      authorizeSettingsWrite({ AGENT_SETTINGS_SECRET: "secret" }, "secret"),
    ).toBe(true);
    expect(
      authorizeSettingsWrite({ AGENT_SETTINGS_SECRET: "secret" }, "wrong"),
    ).toBe(false);
  });
});
