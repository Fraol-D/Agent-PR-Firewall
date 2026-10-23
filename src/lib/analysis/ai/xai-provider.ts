/**
 * Optional xAI provider kept for abstraction extensibility only.
 * Not used by the default factory — development uses Gemini free tier.
 * Do not require XAI_API_KEY for normal Stage 2 setup.
 */

import OpenAI from "openai";

import {
  ANALYSIS_SYSTEM_PROMPT,
  buildAnalysisUserPrompt,
} from "@/lib/analysis/ai/prompts";
import { aiAnalysisResponseSchema } from "@/lib/analysis/ai/schema";
import type { AiAnalysisProvider } from "@/lib/analysis/ai/types";
import type { AnalysisContext, AiAnalysisResult } from "@/lib/analysis/types";

const DEFAULT_MODEL = process.env.XAI_MODEL?.trim() || "grok-4.5";

/**
 * xAI provider (paid credits required). Not the default.
 */
export class XaiAnalysisProvider implements AiAnalysisProvider {
  readonly name = "xai";

  isConfigured(): boolean {
    return Boolean(process.env.XAI_API_KEY?.trim());
  }

  async analyzePullRequest(
    context: AnalysisContext,
  ): Promise<AiAnalysisResult> {
    if (!this.isConfigured()) {
      throw new Error("XAI_API_KEY is not configured");
    }

    const client = new OpenAI({
      apiKey: process.env.XAI_API_KEY,
      baseURL: "https://api.x.ai/v1",
    });

    const response = await client.chat.completions.create({
      model: DEFAULT_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
        { role: "user", content: buildAnalysisUserPrompt(context) },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("AI provider returned empty content");
    }

    let json: unknown;
    try {
      json = JSON.parse(content) as unknown;
    } catch {
      throw new Error("AI provider returned non-JSON content");
    }

    const parsed = aiAnalysisResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error(
        `AI response failed validation: ${parsed.error.issues
          .slice(0, 3)
          .map((i) => i.message)
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
