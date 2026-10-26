import { z } from "zod";
import { CHART_ID_PATTERN, EVIDENCE_ID_PATTERN, REPORT_SCHEMA_VERSION } from "./contract-version";
import type { ChartResponse, InterpretationResponse } from "./types";
import { buildReadingMaterial } from "./reading-material";
import { readingOptionsSchema, REPORT_SECTIONS } from "./reading-contract";
import type { ReadingOptions } from "./reading-contract";
import { ruleNarrativeFor, INTERPRETATION_RULE_VERSION } from "./interpretation-rulebook";

const text = z.string().trim().min(1);
const references = z.array(z.string().regex(EVIDENCE_ID_PATTERN)).min(1).max(60);
export const reportResponseSchema = z.object({
  schemaVersion: z.literal(REPORT_SCHEMA_VERSION), chartId: z.string().regex(CHART_ID_PATTERN), generatedAt: z.string().datetime(),
  source: z.enum(["demo", "ai", "rules"]), interpretationVersion: z.literal(INTERPRETATION_RULE_VERSION).optional(), provider: z.literal("openai").optional(), model: text.max(100).optional(), engineVersion: text, ruleVersion: text, ruleHash: z.string().regex(/^[a-f0-9]{64}$/),
  headline: text.max(100), abstract: text.min(20).max(800),
  reading: readingOptionsSchema,
  limitations: z.array(text.max(300)).min(1).max(8),
  highlights: z.array(z.object({ label: text.max(40), value: text.max(120) }).strict()).length(4),
  sections: z.array(z.object({
    id: z.enum(["overview", "personality", "career", "resources", "relationships", "actions"]),
    title: text.max(40), eyebrow: text.max(60), summary: text.min(8).max(180),
    facts: z.array(z.object({ id: text.max(100), text: text.max(800), evidenceIds: references }).strict()).min(1).max(12),
    appliedRules: z.array(z.object({ ruleId: text.max(80), starId: z.string().regex(EVIDENCE_ID_PATTERN) }).strict()).max(12).optional(),
    body: text.min(20).max(2400), bullet: text.min(8).max(500), evidenceIds: references
  }).strict()).length(6)
}).strict().superRefine((report, context) => {
  if (report.source === "ai" ? !report.model || report.provider !== "openai" : report.model !== undefined || report.provider !== undefined) context.addIssue({ code: "custom", path: ["source"], message: "报告来源与模型信息不一致" });
  if (report.source === "rules" ? report.interpretationVersion !== INTERPRETATION_RULE_VERSION || report.sections.some((section) => section.appliedRules === undefined) : report.interpretationVersion !== undefined || report.sections.some((section) => section.appliedRules !== undefined)) context.addIssue({ code: "custom", path: ["source"], message: "规则来源与版本信息不一致" });
  if (new Set(report.sections.map((section) => section.id)).size !== report.sections.length || report.sections.some((section) => new Set(section.evidenceIds).size !== section.evidenceIds.length)) {
    context.addIssue({ code: "custom", path: ["sections"], message: "报告章节或引用重复" });
  }
  report.sections.forEach((section, index) => {
    const definition = REPORT_SECTIONS[index];
    if (!definition || section.id !== definition.id || section.title !== definition.title || section.eyebrow !== definition.eyebrow) context.addIssue({ code: "custom", path: ["sections", index], message: "报告六章顺序、标识或标题不完整" });
    if (new Set(section.facts.map((fact) => fact.id)).size !== section.facts.length || section.facts.some((fact) => new Set(fact.evidenceIds).size !== fact.evidenceIds.length || fact.evidenceIds.some((id) => !section.evidenceIds.includes(id)))) context.addIssue({ code: "custom", path: ["sections", index, "facts"], message: "事实重复或缺少事实引用" });
  });
});

export function reportBindingIssue(report: InterpretationResponse, chart: ChartResponse, expectedReading?: ReadingOptions) {
  if (report.chartId !== chart.chartId) return "CHART_MISMATCH";
  if (report.ruleHash !== chart.ruleHash || report.ruleVersion !== chart.ruleVersion || report.engineVersion !== chart.engineVersion) return "RULES_CHANGED";
  const refs = new Set(chart.evidence.map((item) => item.id));
  if (report.sections.some((section) => [...section.evidenceIds, ...section.facts.flatMap((fact) => fact.evidenceIds)].some((id) => !refs.has(id)))) return "UNKNOWN_EVIDENCE";
  if (!reportResponseSchema.safeParse(report).success) return "REPORT_STRUCTURE_INVALID";
  if (expectedReading && (report.reading.focus !== expectedReading.focus || report.reading.question !== expectedReading.question)) return "READING_MISMATCH";
  const material = buildReadingMaterial(chart, report.reading);
  if (JSON.stringify(report.limitations) !== JSON.stringify(material.limitations)) return "FACT_MISMATCH";
  const highlights = [
    { label: "命宫地支", value: chart.earthlyBranchOfSoulPalace }, { label: "身宫地支", value: chart.earthlyBranchOfBodyPalace },
    { label: "五行局", value: chart.fiveElementsClass }, { label: "出生时辰", value: chart.time }
  ];
  if (JSON.stringify(report.highlights) !== JSON.stringify(highlights)) return "FACT_MISMATCH";
  for (const [index, section] of report.sections.entries()) {
    const expected = material.sections[index];
    if (!expected || section.id !== expected.id || section.facts.length !== expected.facts.length) return "FACT_MISMATCH";
    for (const [factIndex, fact] of section.facts.entries()) {
      const original = expected.facts[factIndex];
      if (fact.id !== original.id || fact.text !== original.text || JSON.stringify(fact.evidenceIds) !== JSON.stringify(original.evidenceIds)) return "FACT_MISMATCH";
    }
    if (section.evidenceIds.some((id) => !expected.allowedEvidenceIds.includes(id))) return "IRRELEVANT_EVIDENCE";
    if (report.source === "rules") {
      const original = ruleNarrativeFor(chart, section.id, expected.primaryPalaceIds);
      if (section.summary !== original.summary || section.body !== original.body || section.bullet !== original.bullet || JSON.stringify(section.appliedRules) !== JSON.stringify(original.appliedRules) || section.appliedRules?.some((rule) => !section.evidenceIds.includes(rule.starId))) return "RULE_MISMATCH";
    }
  }
  return null;
}
