import OpenAI from "openai";

import {
  ANALYSIS_SYSTEM_PROMPT,
  buildAnalysisUserPrompt,
} from "@/lib/analysis/ai/prompts";
import { normalizeAiAnalysisPayload } from "@/lib/analysis/ai/normalize";
import { aiAnalysisResponseSchema } from "@/lib/analysis/ai/schema";
import type { AiAnalysisProvider } from "@/lib/analysis/ai/types";
import type { AnalysisContext, AiAnalysisResult } from "@/lib/analysis/types";

/** Exact free model required for $0 budget development. */
export const DEFAULT_OPENROUTER_MODEL = "cohere/north-mini-code:free";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * JSON Schema matching `aiAnalysisResponseSchema` for OpenRouter structured output.
 * Kept in sync with Zod validation in schema.ts.
 */
const ANALYSIS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    overallStatus: {
      type: "string",
      enum: [
        "no_significant_concerns",
        "review_recommended",
        "high_risk_concerns",
      ],
    },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          category: {
            type: "string",
            enum: [
              "SECURITY",
              "DATA",
              "AUTHENTICATION",
              "PERFORMANCE",
              "RELIABILITY",
              "DATABASE",
              "API",
              "DEPENDENCY",
              "CONFIGURATION",
              "MAINTAINABILITY",
              "SCOPE",
              "OTHER",
            ],
          },
          severity: {
            type: "string",
            enum: ["info", "low", "medium", "high", "critical"],
          },
          title: { type: "string" },
          summary: { type: "string" },
          explanation: { type: "string" },
          evidence: { type: "string" },
          affectedFiles: {
            type: "array",
            items: { type: "string" },
          },
          confidence: {
            anyOf: [{ type: "number" }, { type: "null" }],
          },
          isInference: { type: "boolean" },
        },
        required: [
          "category",
          "severity",
          "title",
          "summary",
          "explanation",
          "evidence",
          "affectedFiles",
          "confidence",
          "isInference",
        ],
      },
    },
  },
  required: ["summary", "overallStatus", "findings"],
} as const;

function getModel(): string {
  return process.env.OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL;
}

/**
 * OpenRouter provider (OpenAI-compatible).
 * Default free model: cohere/north-mini-code:free
 * Server-side only — OPENROUTER_API_KEY must never reach the client.
 */
export class OpenRouterAnalysisProvider implements AiAnalysisProvider {
  readonly name = "openrouter";

  isConfigured(): boolean {
    return Boolean(process.env.OPENROUTER_API_KEY?.trim());
  }

  async analyzePullRequest(
    context: AnalysisContext,
  ): Promise<AiAnalysisResult> {
    if (!this.isConfigured()) {
      throw new Error(
        "OPENROUTER_API_KEY is not configured. Get a free key at https://openrouter.ai/keys",
      );
    }

    const model = getModel();
    const client = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: OPENROUTER_BASE_URL,
      defaultHeaders: {
        "HTTP-Referer":
          process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000",
        "X-Title": "Agent PR Firewall",
      },
    });

    let content: string | null | undefined;

    try {
      const response = await client.chat.completions.create({
        model,
        temperature: 0.2,
        // Structured output when supported; final result still Zod-validated.
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "pr_analysis",
            strict: true,
            schema: ANALYSIS_JSON_SCHEMA,
          },
        },
        messages: [
          { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
          { role: "user", content: buildAnalysisUserPrompt(context) },
        ],
      });

      content = response.choices[0]?.message?.content;
    } catch (err) {
      throw normalizeOpenRouterError(err);
    }

    if (!content?.trim()) {
      throw new Error("OpenRouter returned empty content");
    }

    // Reasoning models may wrap JSON; strip fences if present. Never surface reasoning.
    let json: unknown;
    try {
      json = JSON.parse(stripCodeFences(content)) as unknown;
    } catch {
      throw new Error("OpenRouter returned non-JSON content");
    }

    const parsed = aiAnalysisResponseSchema.safeParse(
      normalizeAiAnalysisPayload(json),
    );
    if (!parsed.success) {
      throw new Error(
        `AI response failed validation: ${parsed.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
          .join("; ")}`,
      );
    }

    return {
      summary: parsed.data.summary,
      overallStatus: parsed.data.overallStatus,
      findings: parsed.data.findings.map((f) => ({
        ...f,
        confidence: f.confidence,
      })),
      provider: this.name,
      model,
    };
  }
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}

function normalizeOpenRouterError(err: unknown): Error {
  const message = err instanceof Error ? err.message : "OpenRouter request failed";
  const lower = message.toLowerCase();

  if (/api key|unauthorized|401|invalid.*key|authentication/i.test(message)) {
    return new Error(
      "OpenRouter rejected the API key. Check OPENROUTER_API_KEY.",
    );
  }
  if (/429|rate limit|too many requests/i.test(lower)) {
    return new Error(
      "OpenRouter rate limit exceeded. Wait and retry analysis.",
    );
  }
  if (/404|not found|unavailable|no endpoints/i.test(lower)) {
    return new Error(
      "OpenRouter free model is unavailable. Retry later or check OPENROUTER_MODEL.",
    );
  }
  if (/timeout|etimedout|aborted/i.test(lower)) {
    return new Error("OpenRouter request timed out. Retry analysis.");
  }
  if (/402|credits|payment|billing/i.test(lower)) {
    return new Error(
      "OpenRouter billing/credits issue. This project requires free-tier models only.",
    );
  }

  // Never leak raw provider payloads that might include headers/keys
  return new Error(`OpenRouter analysis failed: ${message.slice(0, 280)}`);
}
