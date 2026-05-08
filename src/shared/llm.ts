import OpenAI from "openai";
import { DEFAULT_DEEPSEEK_BASE_URL, DEFAULT_DEEPSEEK_MODEL, DEFAULT_OPENAI_MODEL } from "./env";

export type LlmProvider = "deepseek" | "openai";

export interface LlmConfig {
  provider: LlmProvider;
  apiKey: string;
  baseURL?: string;
  model: string;
  reasoningEffort: "high" | "max";
}

export function getLlmConfig(): LlmConfig {
  const provider = resolveProvider();

  if (provider === "deepseek") {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error("Missing DEEPSEEK_API_KEY. Set it in .env before using LLM workflows.");
    }

    return {
      provider,
      apiKey,
      baseURL: process.env.DEEPSEEK_BASE_URL || DEFAULT_DEEPSEEK_BASE_URL,
      model: process.env.DEEPSEEK_MODEL || process.env.deepseek_model || process.env.LLM_MODEL || DEFAULT_DEEPSEEK_MODEL,
      reasoningEffort: process.env.DEEPSEEK_REASONING_EFFORT === "max" ? "max" : "high"
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY. Set it in .env before using OpenAI workflows.");
  }

  return {
    provider,
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
    model: process.env.OPENAI_MODEL || process.env.openai_model || process.env.LLM_MODEL || DEFAULT_OPENAI_MODEL,
    reasoningEffort: "high"
  };
}

export function createLlmClient(config: LlmConfig): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL
  });
}

export function llmChatOptions(config: LlmConfig): Record<string, unknown> {
  if (config.provider !== "deepseek") {
    return {};
  }

  return {
    reasoning_effort: config.reasoningEffort,
    extra_body: {
      thinking: {
        type: "enabled"
      }
    }
  };
}

function resolveProvider(): LlmProvider {
  const rawProvider = (process.env.LLM_PROVIDER || "").trim().toLowerCase();
  if (rawProvider === "deepseek" || rawProvider === "openai") {
    return rawProvider;
  }

  if (process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_BASE_URL) {
    return "deepseek";
  }

  if (process.env.OPENAI_API_KEY) {
    return "openai";
  }

  return "deepseek";
}
