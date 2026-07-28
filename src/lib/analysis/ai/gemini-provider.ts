import { GoogleGenerativeAI } from "@google/generative-ai";

import {
  ANALYSIS_SYSTEM_PROMPT,
  buildAnalysisUserPrompt,
} from "@/lib/analysis/ai/prompts";
import { normalizeAiAnalysisPayload } from "@/lib/analysis/ai/normalize";
import { aiAnalysisResponseSchema } from "@/lib/analysis/ai/schema";
import type { AiAnalysisProvider } from "@/lib/analysis/ai/types";
import type { AnalysisContext, AiAnalysisResult } from "@/lib/analysis/types";

/**
 * Free-tier-friendly default on Google AI Studio.
 * Override with GEMINI_MODEL if needed.
 * @see https://ai.google.dev/gemini-api/docs/models
 */
const DEFAULT_MODEL =
  process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";

/**
 * Google Gemini provider (Google AI Studio free tier).
 * Server-side only — requires GEMINI_API_KEY.
 */
export class GeminiAnalysisProvider implements AiAnalysisProvider {
  readonly name = "gemini";

  isConfigured(): boolean {
    return Boolean(process.env.GEMINI_API_KEY?.trim());
  }

  async analyzePullRequest(
    context: AnalysisContext,
  ): Promise<AiAnalysisResult> {
    if (!this.isConfigured()) {
      throw new Error(
        "GEMINI_API_KEY is not configured. Get a free key at https://aistudio.google.com/apikey",
      );
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({
      model: DEFAULT_MODEL,
      systemInstruction: ANALYSIS_SYSTEM_PROMPT,
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    });

    let content: string;
    try {
      const result = await model.generateContent(
        buildAnalysisUserPrompt(context),
      );
      content = result.response.text();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Gemini request failed";
      // Controlled failure — no secrets in message path
      if (/429|quota|rate/i.test(message)) {
        throw new Error(
          "Gemini free-tier rate limit or quota exceeded. Wait and retry analysis.",
        );
      }
      if (/401|403|API key|permission/i.test(message)) {
        throw new Error(
          "Gemini API rejected the request. Check GEMINI_API_KEY and free-tier access.",
        );
      }
      throw new Error(`Gemini analysis failed: ${message.slice(0, 300)}`);
    }

    if (!content?.trim()) {
      throw new Error("Gemini returned empty content");
    }

    let json: unknown;
    try {
      json = JSON.parse(stripCodeFences(content)) as unknown;
    } catch {
      throw new Error("Gemini returned non-JSON content");
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
      model: DEFAULT_MODEL,
    };
  }
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}
