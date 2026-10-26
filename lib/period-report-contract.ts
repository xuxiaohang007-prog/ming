import { z } from "zod";
import type { ChartResponse } from "./types";
import { palaceLabel } from "./contract-version";
import { periodBindingIssue, periodRequestSchema, periodResponseSchema } from "./period-contract";
import type { PeriodResponse } from "./period-contract";
import { canonical } from "./ziwei/canonical-json";

export const PERIOD_REPORT_VERSION = "ziwei-period-report/1.0.0";
export const PERIOD_READING_VERSION = "ziwei-period-reading-rules/1.0.0";
export const PERIOD_CHAPTERS = ["range", "soul", "themes", "transforms", "actions"] as const;
export const PERIOD_REPORT_LIMITS = Object.freeze([
  "本报告为产品预置的运限规则参考，未调用大模型，不是 iztro 官方解释或预测验证。",
  "只使用已核对的当前层级资料；不作事件、寿命、疾病、投资收益或吉凶评分判断。",
  "流年和虚岁按农历正月初一切换，分析时辰固定早子；不包含流月、流日、流时或真太阳时校正。",
  "本命与运限四化分开记录。本报告不改写本命盘或已有六章报告，不回答自由提问。"
]);
export const PERIOD_READING_RULES = Object.freeze({
  禄: Object.freeze({ id: "period:lu/1.0", text: "把化禄作为整理资源线索的文化阅读提示，不表示收入增长或收益保证。", action: "核对资料来源与实际条件，不把符号当作获利承诺。" }),
  权: Object.freeze({ id: "period:quan/1.0", text: "把化权作为核对责任与边界的文化阅读提示，不代表升职或获得权力。", action: "区分自己的职责和他人的决定，不从星曜推断结果。" }),
  科: Object.freeze({ id: "period:ke/1.0", text: "把化科作为整理表达与记录的文化阅读提示，不保证考试成绩或声誉。", action: "保留可复核的过程资料，以实际学习与沟通情况为准。" }),
  忌: Object.freeze({ id: "period:ji/1.0", text: "把化忌作为复核与约束的文化阅读提示，不预示灾祸、疾病或关系破裂。", action: "先澄清事实，不以符号给自己或他人作负面定论。" })
});
export const periodReportRequestSchema = periodRequestSchema.extend({ scope: z.enum(["yearly", "decadal"]), periodId: z.string().min(1).max(100) }).strict();
const text = z.string().min(1).max(400), id = z.string().min(1).max(240);
const reference = z.object({ id, kind: z.enum(["period", "period-palace", "flow-star", "natal-palace", "natal-star"]),
  label: text, palaceIndex: z.number().int().min(0).max(11).nullable(), natalEvidenceId: id.nullable() }).strict();
export const periodReportSchema = z.object({
  schemaVersion: z.literal(PERIOD_REPORT_VERSION), readingVersion: z.literal(PERIOD_READING_VERSION), source: z.literal("rules"),
  reportId: id, periodId: id, chartId: id, scope: z.enum(["yearly", "decadal"]), generatedAt: z.string().datetime(),
  engineVersion: text, calendarVersion: text, ruleVersion: text, ruleHash: z.string().regex(/^[a-f0-9]{64}$/),
  analysis: periodResponseSchema.shape.analysis, nominalAge: z.number().int().min(1).max(125),
  headline: text.max(100), abstract: text.max(800), limitations: z.array(text).length(4),
  sections: z.array(z.object({ id: z.enum(PERIOD_CHAPTERS), title: text.max(40), summary: text.max(180),
    facts: z.array(z.object({ text: text.max(800), referenceIds: z.array(id).min(1).max(40) }).strict()).min(1).max(12),
    body: z.string().min(20).max(2400), action: text.max(600), ruleIds: z.array(id).min(1).max(4)
  }).strict()).length(5), references: z.array(reference).min(1).max(160)
}).strict().superRefine((value, context) => {
  const references = new Set(value.references.map((item) => item.id));
  if (references.size !== value.references.length || value.sections.some((section, index) => section.id !== PERIOD_CHAPTERS[index] || section.facts.some((fact) => new Set(fact.referenceIds).size !== fact.referenceIds.length || fact.referenceIds.some((id) => !references.has(id))))) {
    context.addIssue({ code: "custom", message: "运限报告章节或引用不完整" });
  }
});
export type PeriodReport = z.infer<typeof periodReportSchema>;
export type PeriodReportReference = PeriodReport["references"][number];

export function buildPeriodReportContent(chart: ChartResponse, period: PeriodResponse, scope: PeriodReport["scope"]): Omit<PeriodReport, "generatedAt"> {
  const layer = period[scope];
  const references = new Map<string, PeriodReportReference>();
  const add = (item: PeriodReportReference) => { references.set(item.id, item); return item.id; };
  const root = add({ id: period.periodId, kind: "period", label: `${period.analysis.solarDate} · ${layer.name} · UTC+8`, palaceIndex: null, natalEvidenceId: null });
  const natalReference = (id: string) => {
    const target = chart.evidence.find((item) => item.id === id)!;
    return add({ id, kind: target.kind === "star" ? "natal-star" : "natal-palace", label: `本命原位 · ${target.label}`, palaceIndex: target.palaceIndex, natalEvidenceId: id });
  };
  const palaceFact = (index: number) => {
    const target = layer.palaces[index], natal = chart.palaces[index];
    const ref = add({ id: `${period.periodId}:${scope}:p:${index}`, kind: "period-palace", label: `${layer.name}${palaceLabel(target.name)} · ${natal.earthlyBranch}`, palaceIndex: index, natalEvidenceId: natal.id });
    const stars = natal.majorStars.filter((star) => star.type === "major");
    const flowRefs = target.stars.map((star) => add({ id: star.id, kind: "flow-star", label: `${layer.name}${palaceLabel(target.name)} · ${star.name}`, palaceIndex: index, natalEvidenceId: null }));
    return { text: `${layer.name}${palaceLabel(target.name)}位于${natal.earthlyBranch}，对应本命${palaceLabel(natal.name)}；本命原位十四主星：${stars.map((star) => star.name).join("、") || "无"}；本层流曜：${target.stars.map((star) => star.name).join("、") || "无"}。`,
      referenceIds: [ref, natalReference(natal.id), ...stars.map((star) => natalReference(star.id)), ...flowRefs] };
  };
  const rangeFact = { text: `${period.analysis.solarDate}（${period.analysis.lunarDate}），UTC+8，当前虚岁 ${period.nominalAge}；${layer.name}${layer.heavenlyStem}${layer.earthlyBranch}。${layer.ageRange ? `大限虚岁范围 ${layer.ageRange[0]} 至 ${layer.ageRange[1]} 岁。` : layer.name === "童限" ? "尚未起大限，不补造十年范围。" : "仅覆盖当前农历年份的流年资料。"}`, referenceIds: [root] };
  const soulFact = palaceFact(layer.index);
  const themeFacts = ["官禄", "财帛", "夫妻"].map((name) => palaceFact(layer.palaces.find((item) => item.name === name)!.index));
  const transformFacts = layer.mutagens.map((item) => ({ text: `${layer.name}${layer.heavenlyStem}${layer.earthlyBranch}：${item.star}化${item.label}；定位本命原位，不替换本命四化。`, referenceIds: [root, ...item.natalStarIds.map(natalReference)] }));
  return { schemaVersion: PERIOD_REPORT_VERSION, readingVersion: PERIOD_READING_VERSION, source: "rules",
    reportId: `${period.periodId}:report:${scope}:v1`, periodId: period.periodId, chartId: chart.chartId, scope,
    engineVersion: period.engineVersion, calendarVersion: period.calendarVersion, ruleVersion: period.ruleVersion, ruleHash: period.ruleHash,
    analysis: { ...period.analysis }, nominalAge: period.nominalAge, headline: `${chart.form.name || "命主"}的${layer.name}规则报告`,
    abstract: `按 ${period.analysis.solarDate} 的${layer.name}资料整理五章阅读档案。事实来自 iztro，说明来自本产品预置规则；未调用大模型，不是官方命理解释，不作具体事件预测。`, limitations: [...PERIOD_REPORT_LIMITS],
    sections: [
      { id: "range", title: "范围与时间", summary: "先确认日期、层级与虚岁，再阅读同一份资料。", facts: [rangeFact], body: "分析日期是资料的核对条件，不是事件发生日期。流年与虚岁采用农历正月初一分界；名义区间不能当作精确公历日期或寿命预测。本报告与本命六章报告分开，不把两个层级的四化混在一起。", action: "记录本次日期与层级；更改日期、出生条件或规则后重新生成报告。", ruleIds: ["period:range/1.0"] },
      { id: "soul", title: "运限命宫", summary: "区分本层宫名、本命原位星曜与新增流曜。", facts: [soulFact], body: "运限命宫的位置用于核对本层宫名映射，不代表性格改变或命运定论。事实框的本命星曜保留原位属性，本层流曜另行标注。没有流曜或十四主星时明确写无，不借别处的星曜冒充本宫资料。", action: "分别打开本层宫位和本命原位引用，核对名称与实际位置。", ruleIds: ["period:layer-separation/1.0"] },
      { id: "themes", title: "主题宫位", summary: "分开核对官禄、财帛与夫妻宫，不从宫名直接预测结果。", facts: themeFacts, body: "三个主题宫位只说明本层十二宫对应关系，不从宫名或单颗星曜推断事业、财富、婚期或他人的行为。宫名发生轮转不意味着本命星体移动；这些计算资料不能替代真实经历、沟通或独立决策。", action: "把现实中需要了解的情况另行记录，保留事实与文化说明之间的区别。", ruleIds: ["period:theme-boundary/1.0"] },
      { id: "transforms", title: "四化定位", summary: "四化按本层干支记录，定位实际本命星体而不改写其四化。", facts: transformFacts,
        body: layer.mutagens.map((item) => `${item.star}化${item.label}：${PERIOD_READING_RULES[item.label].text}`).join("\n\n"),
        action: layer.mutagens.map((item) => PERIOD_READING_RULES[item.label].action).join("；"), ruleIds: layer.mutagens.map((item) => PERIOD_READING_RULES[item.label].id) },
      { id: "actions", title: "核对行动", summary: "先核对来源与边界，再保存一份可追溯的阅读档案。", facts: [rangeFact], body: "本报告只有计算事实和预置文化提示，不提供概率、评分或自由问答。核对出生条件、日期、层级、版本和引用后再保存。若需要现实决策，请依据独立事实处理；不要把报告当作医疗、法律、投资或重大人生决策的依据。", action: "确认资料后可打印保存；报告包含个人出生与日期信息，请谨慎分享。", ruleIds: ["period:checking/1.0"] }
    ], references: [...references.values()] };
}
export function periodReportBindingIssue(report: PeriodReport, chart: ChartResponse, period: PeriodResponse, scope: PeriodReport["scope"]) {
  if (!periodReportSchema.safeParse(report).success) return "PERIOD_REPORT_INVALID";
  if (periodBindingIssue(period, chart, period.analysis.solarDate)) return "PERIOD_REPORT_BINDING_INVALID";
  if (report.scope !== scope) return "PERIOD_REPORT_SCOPE_MISMATCH";
  const { generatedAt: _time, ...content } = report;
  return canonical(content) === canonical(buildPeriodReportContent(chart, period, scope)) ? null : "PERIOD_REPORT_CONTENT_MISMATCH";
}
