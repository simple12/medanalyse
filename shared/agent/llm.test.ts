import { describe, expect, it } from "vitest";
import { resolveLlmProvider } from "./llm.js";

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

  it("honors LLM_PROVIDER=anthropic / claude", () => {
    expect(
      resolveLlmProvider({
        LLM_PROVIDER: "claude",
        ANTHROPIC_API_KEY: "sk-ant-test",
        OPENAI_API_KEY: "sk-test",
      }),
    ).toBe("anthropic");
  });

  it("returns none when anthropic is requested without a key", () => {
    expect(
      resolveLlmProvider({
        LLM_PROVIDER: "anthropic",
      }),
    ).toBe("none");
  });
});
