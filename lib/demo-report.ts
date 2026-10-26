import type { ChartResponse, InterpretationResponse } from "@/lib/types";
import { REPORT_SCHEMA_VERSION } from "@/lib/contract-version";
import { reportBindingIssue, reportResponseSchema } from "@/lib/report-contract";
import { ZiweiEngineError } from "@/lib/ziwei/errors";
import { buildReadingMaterial } from "@/lib/reading-material";
import { READING_LABELS } from "@/lib/reading-contract";

const copy = {
  overview: { summary: "先核对命盘摘要，再按主题阅读实际宫位。", body: "下方事实来自固定规则下的真实排盘，而不是模型推断。请先核对出生条件；本阶段仅提供报告流程示例，尚未调用大模型，不从星曜直接得出人生结论。", bullet: "返回盘面核对宫位与出生条件，有误时修改信息后重新排盘。" },
  personality: { summary: "命宫事实是阅读起点，不等同于性格定论。", body: "本节展示命宫及必要的对宫参考，不自动推断性格。空宫并不意味着没有可读信息，对宫星曜也不能伪装成本宫已有星曜；个性化解释仍需后续模型结合相关宫位与实际经历。", bullet: "把盘面作为自我观察线索，不以单颗星曜或亮度给自己贴标签。" },
  career: { summary: "查看官禄宫及关联资料，不编造事业趋势。", body: "本节依据官禄宫的实际星曜准备事业与学习阅读材料，目前尚未进行个性化职业判断。没有运限或流年资料时，不能据此生成具体年份、升职时点或考试结果。", bullet: "后续阅读宜结合真实技能与学习目标，不将本命盘当作职业保证。" },
  resources: { summary: "核对财帛宫事实，明确资源主题的阅读边界。", body: "本节呈现财帛宫的计算事实，不生成财富评分、收益判断或投资结论。未来解释只能以条件与倾向表述，不应将盘面代替财务记录、风险评估或独立决策。", bullet: "本节不提供投资建议；如需资源规划，请先整理实际收支与风险条件。" },
  relationships: { summary: "分开查看关系宫位，不预言具体关系事件。", body: "夫妻、兄弟、交友等宫位的实际事实在下方独立列出。本阶段尚无个性化关系解释，也不预测婚期、分离或他人的行为；未来阅读应尊重现实沟通和双方自主选择。", bullet: "关系观察以真实相处为主，不能把星曜描述当作对他人的确定判断。" },
  actions: { summary: "先确认事实与缺失资料，再讨论可执行行动。", body: "先确认历法、排盘性别和出生时间。修改输入后应重新排盘，旧报告不可与新盘混用。这里的建议是通用核验流程，不是假装由模型生成的个性化决策；尚未提供的资料已在报告边界中明确列出。", bullet: "需要更深入阅读时补充实际目标，并始终保留事实与解释之间的区别。" }
};

export function buildDemoInterpretation(chart: ChartResponse, options?: unknown): InterpretationResponse {
  const material = buildReadingMaterial(chart, options);
  const report: InterpretationResponse = {
    schemaVersion: REPORT_SCHEMA_VERSION, chartId: chart.chartId, generatedAt: new Date().toISOString(),
    source: "demo",
    engineVersion: chart.engineVersion,
    ruleVersion: chart.ruleVersion,
    ruleHash: chart.ruleHash,
    reading: material.reading, limitations: material.limitations,
    headline: `${chart.form.name || "命主"}的命盘阅读示例`,
    abstract: `本次侧重点为「${READING_LABELS[material.reading.focus]}」。盘面事实与固定说明分开展示，用于检查六章阅读、引用回溯与打印流程；尚未调用大模型，自填问题只作为后续分析主题保存，不生成个性化判断。`,
    highlights: [
      { label: "命宫地支", value: chart.earthlyBranchOfSoulPalace },
      { label: "身宫地支", value: chart.earthlyBranchOfBodyPalace },
      { label: "五行局", value: chart.fiveElementsClass },
      { label: "出生时辰", value: chart.time }
    ],
    sections: material.sections.map((section) => ({
      id: section.id, title: section.title, eyebrow: section.eyebrow, ...copy[section.id], facts: section.facts,
      evidenceIds: [...new Set(section.facts.flatMap((fact) => fact.evidenceIds))]
    }))
  };
  const parsed = reportResponseSchema.safeParse(report);
  if (!parsed.success || reportBindingIssue(report, chart, material.reading)) throw new ZiweiEngineError("RESPONSE_CONTRACT_INVALID");
  return parsed.data;
}
