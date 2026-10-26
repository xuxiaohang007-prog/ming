import { z } from "zod";
import { REPORT_SECTIONS } from "../reading-contract";
import { buildReadingMaterial } from "../reading-material";
import { reportBindingIssue, reportResponseSchema } from "../report-contract";
import { REPORT_SCHEMA_VERSION, EVIDENCE_ID_PATTERN } from "../contract-version";
import type { ChartResponse, InterpretationResponse } from "../types";
import type { ReadingOptions } from "../reading-contract";
import { AIServiceError } from "./errors";

const text = (min: number, max: number) => z.string().trim().min(min).max(max);
export const modelNarrativeSchema = z.object({ sections: z.array(z.object({
  id: z.enum(["overview", "personality", "career", "resources", "relationships", "actions"]),
  summary: text(8, 180), body: text(20, 2400), bullet: text(8, 500),
  evidenceIds: z.array(z.string().regex(EVIDENCE_ID_PATTERN)).min(1).max(60)
}).strict()).length(6) }).strict();

export const MODEL_JSON_SCHEMA = {
  type: "object", additionalProperties: false, required: ["sections"], properties: {
    sections: { type: "array", minItems: 6, maxItems: 6, items: { type: "object", additionalProperties: false,
      required: ["id", "summary", "body", "bullet", "evidenceIds"], properties: {
        id: { type: "string", enum: REPORT_SECTIONS.map((section) => section.id) },
        summary: { type: "string" }, body: { type: "string" }, bullet: { type: "string" },
        evidenceIds: { type: "array", items: { type: "string" } }
      }
    } }
  }
};

export function assembleAIReport(value: unknown, chart: ChartResponse, reading: ReadingOptions, model: string): InterpretationResponse {
  const narrative = modelNarrativeSchema.safeParse(value);
  if (!narrative.success) throw new AIServiceError("AI_OUTPUT_INVALID");
  const material = buildReadingMaterial(chart, reading);
  const report: InterpretationResponse = {
    schemaVersion: REPORT_SCHEMA_VERSION, chartId: chart.chartId, generatedAt: new Date().toISOString(),
    source: "ai", provider: "openai", model, engineVersion: chart.engineVersion, ruleVersion: chart.ruleVersion, ruleHash: chart.ruleHash,
    reading: material.reading, limitations: material.limitations, headline: `${chart.form.name || "命主"}的命盘阅读报告`,
    abstract: "盘面事实由 iztro 计算并经应用核对；下文解释由 AI 依据本命材料生成，可能存在偏差。请将其作为文化阅读与自我观察，不用于确定性预测或重大决策。",
    highlights: [
      { label: "命宫地支", value: chart.earthlyBranchOfSoulPalace }, { label: "身宫地支", value: chart.earthlyBranchOfBodyPalace },
      { label: "五行局", value: chart.fiveElementsClass }, { label: "出生时辰", value: chart.time }
    ],
    sections: narrative.data.sections.map((section, index) => ({
      ...section, title: material.sections[index].title, eyebrow: material.sections[index].eyebrow, facts: material.sections[index].facts
    }))
  };
  const parsed = reportResponseSchema.safeParse(report);
  if (!parsed.success || reportBindingIssue(report, chart, reading)) throw new AIServiceError("AI_OUTPUT_INVALID");
  return parsed.data;
}
