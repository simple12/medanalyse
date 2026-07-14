import { describe, expect, it } from "vitest";
import { resolveGeminiModelName, resolveLlmProvider } from "./llm.js";

describe("resolveLlmProvider", () => {
  it("uses anthropic when only ANTHROPIC_API_KEY is set", () => {
    expect(
      resolveLlmProvider({
        ANTHROPIC_API_KEY: "sk-ant-test",
      }),
    ).toBe("anthropic");
  });

  it("uses openai when only OPENAI_API_KEY is set", () => {
    expect(
      resolveLlmProvider({
        OPENAI_API_KEY: "sk-test",
      }),
    ).toBe("openai");
  });

  it("uses gemini when only GEMINI_API_KEY is set", () => {
    expect(
      resolveLlmProvider({
        GEMINI_API_KEY: "gemini-test",
      }),
    ).toBe("gemini");
  });

  it("honors LLM_PROVIDER=anthropic / claude", () => {
    expect(
      resolveLlmProvider({
        LLM_PROVIDER: "claude",
        ANTHROPIC_API_KEY: "sk-ant-test",
        OPENAI_API_KEY: "sk-test",
      }),
    ).toBe("anthropic");
  });

  it("honors LLM_PROVIDER=gemini even when other keys exist", () => {
    expect(
      resolveLlmProvider({
        LLM_PROVIDER: "gemini",
        GEMINI_API_KEY: "gemini-test",
        OPENAI_API_KEY: "sk-test",
        ANTHROPIC_API_KEY: "sk-ant-test",
      }),
    ).toBe("gemini");
  });

  it("returns none when gemini is requested without a key", () => {
    expect(
      resolveLlmProvider({
        LLM_PROVIDER: "gemini",
      }),
    ).toBe("none");
  });

  it("returns none when anthropic is requested without a key", () => {
    expect(
      resolveLlmProvider({
        LLM_PROVIDER: "anthropic",
      }),
    ).toBe("none");
  });
});

describe("resolveGeminiModelName", () => {
  it("defaults when unset or empty", () => {
    expect(resolveGeminiModelName({})).toBe("gemini-3.5-flash");
    expect(resolveGeminiModelName({ GEMINI_MODEL: "" })).toBe(
      "gemini-3.5-flash",
    );
    expect(resolveGeminiModelName({ GEMINI_MODEL: "   " })).toBe(
      "gemini-3.5-flash",
    );
  });

  it("strips models/ prefix and quotes", () => {
    expect(
      resolveGeminiModelName({ GEMINI_MODEL: "models/gemini-3.1-flash-lite" }),
    ).toBe("gemini-3.1-flash-lite");
    expect(
      resolveGeminiModelName({ GEMINI_MODEL: '"gemini-3.5-flash"' }),
    ).toBe("gemini-3.5-flash");
  });

  it("falls back when the value is invalid", () => {
    expect(resolveGeminiModelName({ GEMINI_MODEL: "!!!" })).toBe(
      "gemini-3.5-flash",
    );
    expect(resolveGeminiModelName({ GEMINI_MODEL: "models/" })).toBe(
      "gemini-3.5-flash",
    );
  });
});
