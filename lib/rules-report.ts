import { buildDemoInterpretation } from "./demo-report";
import { buildReadingMaterial } from "./reading-material";
import { reportBindingIssue, reportResponseSchema } from "./report-contract";
import { INTERPRETATION_RULE_VERSION, ruleNarrativeFor } from "./interpretation-rulebook";
import { READING_LABELS } from "./reading-contract";
import type { ChartResponse, InterpretationResponse } from "./types";
import { AIServiceError } from "./ai/errors";

export function buildRulesInterpretation(chart: ChartResponse, options?: unknown): InterpretationResponse {
  const base = buildDemoInterpretation(chart, options);
  const material = buildReadingMaterial(chart, options);
  const report: InterpretationResponse = {
    ...base, source: "rules", interpretationVersion: INTERPRETATION_RULE_VERSION,
    headline: `${chart.form.name || "命主"}的本地规则解读`,
    abstract: `本次按「${READING_LABELS[material.reading.focus]}」整理真实盘面与预置规则参考。全程在本应用内计算，不需要 API 密钥或模型安装，未调用大模型；规则是产品自定义的文化观察提示，不是 iztro 官方解读或科学结论。自填问题仅保留，不作语义回答。`,
    sections: material.sections.map((section) => {
      return { id: section.id, title: section.title, eyebrow: section.eyebrow,
        ...ruleNarrativeFor(chart, section.id, section.primaryPalaceIds), facts: section.facts,
        evidenceIds: [...new Set(section.facts.flatMap((fact) => fact.evidenceIds))]
      };
    })
  };
  const parsed = reportResponseSchema.safeParse(report);
  if (!parsed.success || reportBindingIssue(report, chart, material.reading)) throw new AIServiceError("RULES_OUTPUT_INVALID");
  return parsed.data;
}
