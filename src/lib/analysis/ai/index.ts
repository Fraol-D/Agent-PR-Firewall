import { GeminiAnalysisProvider } from "@/lib/analysis/ai/gemini-provider";
import { OpenRouterAnalysisProvider } from "@/lib/analysis/ai/openrouter-provider";
import type { AiAnalysisProvider } from "@/lib/analysis/ai/types";

export type AiProviderName = "openrouter" | "gemini";

/**
 * Active provider selection.
 * Default: openrouter (free model cohere/north-mini-code:free).
 * Set AI_PROVIDER=gemini to use the Gemini implementation instead.
 * No paid fallbacks.
 */
export function getActiveAiProviderName(): AiProviderName {
  const raw = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (raw === "gemini") return "gemini";
  return "openrouter";
}

/**
 * Default AI provider factory.
 * Architecture: Analysis Engine → AiAnalysisProvider → concrete provider.
 */
export function createDefaultAiProvider(): AiAnalysisProvider {
  switch (getActiveAiProviderName()) {
    case "gemini":
      return new GeminiAnalysisProvider();
    case "openrouter":
    default:
      return new OpenRouterAnalysisProvider();
  }
}

export function isAiProviderConfigured(): boolean {
  return createDefaultAiProvider().isConfigured();
}

export type { AiAnalysisProvider } from "@/lib/analysis/ai/types";
export { OpenRouterAnalysisProvider } from "@/lib/analysis/ai/openrouter-provider";
export { GeminiAnalysisProvider } from "@/lib/analysis/ai/gemini-provider";
