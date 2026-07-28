import { z } from "zod";

export const findingSchema = z.object({
  category: z.enum([
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
  ]),
  severity: z.enum(["info", "low", "medium", "high", "critical"]),
  title: z.string().min(1).max(200),
  summary: z.string().min(1).max(500),
  explanation: z.string().min(1).max(4000),
  evidence: z.string().min(1).max(4000),
  affectedFiles: z.array(z.string()).max(50),
  confidence: z.number().min(0).max(1).nullable(),
  isInference: z.boolean(),
});

export const aiAnalysisResponseSchema = z.object({
  summary: z.string().min(1).max(4000),
  overallStatus: z.enum([
    "no_significant_concerns",
    "review_recommended",
    "high_risk_concerns",
  ]),
  findings: z.array(findingSchema).max(50),
});

export type AiAnalysisResponseParsed = z.infer<typeof aiAnalysisResponseSchema>;
