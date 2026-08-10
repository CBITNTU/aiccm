import { describe, expect, it } from "vitest";
import { SUPPORTED_MODELS, getProviderName, resolveModel } from "@/lib/ai/models";

// Provider factories read API keys lazily (at request time, not construction),
// but set dummies defensively so model construction can never throw on env.
process.env.OPENAI_API_KEY ??= "test-dummy-key";
process.env.DEEPSEEK_API_KEY ??= "test-dummy-key";
process.env.GOOGLE_GENERATIVE_AI_API_KEY ??= "test-dummy-key";

function modelIdOf(model: unknown): string | undefined {
  return (model as { modelId?: string })?.modelId;
}

describe("getProviderName", () => {
  it("routes ollama/ prefixed IDs to ollama", () => {
    expect(getProviderName("ollama/qwen2.5:7b")).toBe("ollama");
    expect(getProviderName("ollama/qwen3:14b")).toBe("ollama");
  });

  it("routes deepseek- prefixed IDs to deepseek", () => {
    expect(getProviderName("deepseek-v4-flash")).toBe("deepseek");
    expect(getProviderName("deepseek-chat")).toBe("deepseek");
  });

  it("routes gemini- prefixed IDs to google", () => {
    expect(getProviderName("gemini-2.5-flash")).toBe("google");
    expect(getProviderName("gemini-2.5-pro")).toBe("google");
  });

  it("defaults everything else to openai", () => {
    expect(getProviderName("gpt-5-mini")).toBe("openai");
    expect(getProviderName("gpt-4o")).toBe("openai");
    expect(getProviderName("some-unknown-model")).toBe("openai");
  });

  it("matches the declared provider for every SUPPORTED_MODELS entry", () => {
    for (const model of SUPPORTED_MODELS) {
      expect(getProviderName(model.id)).toBe(model.provider);
    }
  });
});

describe("resolveModel", () => {
  it("returns a model for ollama/ IDs with the prefix stripped", () => {
    const model = resolveModel("ollama/qwen2.5:7b");
    expect(model).toBeDefined();
    expect(modelIdOf(model)).toBe("qwen2.5:7b");
  });

  it("returns a deepseek model for deepseek- IDs", () => {
    const model = resolveModel("deepseek-v4-flash");
    expect(model).toBeDefined();
    expect(modelIdOf(model)).toBe("deepseek-v4-flash");
  });

  it("returns a google model for gemini- IDs", () => {
    const model = resolveModel("gemini-2.5-flash");
    expect(model).toBeDefined();
    expect(modelIdOf(model)).toBe("gemini-2.5-flash");
  });

  it("defaults to openai for other IDs", () => {
    const model = resolveModel("gpt-5-nano");
    expect(model).toBeDefined();
    expect(modelIdOf(model)).toBe("gpt-5-nano");
  });

  it("resolves every SUPPORTED_MODELS entry without throwing", () => {
    for (const { id } of SUPPORTED_MODELS) {
      expect(resolveModel(id)).toBeDefined();
    }
  });
});
