import { z } from "zod";
import { Solar } from "lunar-typescript";
import type { ChartResponse } from "./types";
import { CHART_ID_PATTERN, EVIDENCE_ID_PATTERN, STAR_TYPES, palaceIdFor } from "./contract-version";
import { periodStarsFor } from "./period-stars";

export const PERIOD_SCHEMA_VERSION = "ziwei-period/1.0.0";
export const PERIOD_PALACES = ["命宫", "父母", "福德", "田宅", "官禄", "仆役", "迁移", "疾厄", "财帛", "子女", "夫妻", "兄弟"] as const;
export const STEMS = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"] as const;
export const BRANCHES = ["寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥", "子", "丑"] as const;
export const TRANSFORM_LABELS = ["禄", "权", "科", "忌"] as const;
// Snapshot of iztro 2.6.1's packaged default table, used to verify returned references.
export const PERIOD_MUTAGENS = Object.freeze({
  甲: Object.freeze(["廉贞", "破军", "武曲", "太阳"]), 乙: Object.freeze(["天机", "天梁", "紫微", "太阴"]),
  丙: Object.freeze(["天同", "天机", "文昌", "廉贞"]), 丁: Object.freeze(["太阴", "天同", "天机", "巨门"]),
  戊: Object.freeze(["贪狼", "太阴", "右弼", "天机"]), 己: Object.freeze(["武曲", "贪狼", "天梁", "文曲"]),
  庚: Object.freeze(["太阳", "武曲", "太阴", "天同"]), 辛: Object.freeze(["巨门", "太阳", "文曲", "文昌"]),
  壬: Object.freeze(["天梁", "紫微", "左辅", "武曲"]), 癸: Object.freeze(["破军", "巨门", "太阴", "贪狼"])
});
export const PERIOD_LIMITATIONS = Object.freeze([
  "仅展示大限／童限与流年计算资料，不作吉凶评分或具体事件预测。",
  "按 UTC+8 公历日期调用，分析时辰固定早子；本步不展示流月、流日或流时。",
  "流年与虚岁以农历正月初一为界；原六章解读报告仍仅覆盖本命盘。"
]);
export function canonicalDate(value: string) { return value.split("-").map((part, index) => index ? String(Number(part)).padStart(2, "0") : part).join("-"); }
export const periodDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "请填写完整公历分析日期。")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number), date = new Date(Date.UTC(year, month - 1, day));
    return year >= 1900 && year <= 2100 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }, "分析日期应为 1900 至 2100 年之间真实存在的公历日期。");
export const periodRequestSchema = z.object({ form: z.object({}).passthrough(), chartId: z.string().regex(CHART_ID_PATTERN), ruleHash: z.string().regex(/^[a-f0-9]{64}$/), analysisDate: periodDateSchema }).strict();
const text = z.string().min(1).max(40), index = z.number().int().min(0).max(11), ageRange = z.tuple([z.number().int().min(2).max(125), z.number().int().min(2).max(125)]);
const scopeSchema = z.object({
  scope: z.enum(["decadal", "yearly"]), name: z.enum(["大限", "童限", "流年"]), index,
  heavenlyStem: z.enum(STEMS), earthlyBranch: z.enum(BRANCHES), ageRange: ageRange.nullable(),
  palaces: z.array(z.object({ index, natalPalaceId: z.string().regex(EVIDENCE_ID_PATTERN), name: z.enum(PERIOD_PALACES),
    stars: z.array(z.object({ id: z.string().min(1).max(160), name: text, type: z.enum(STAR_TYPES) }).strict()).max(30) }).strict()).length(12),
  mutagens: z.array(z.object({ label: z.enum(TRANSFORM_LABELS), star: text, natalStarIds: z.array(z.string().regex(EVIDENCE_ID_PATTERN)).min(1).max(4) }).strict()).length(4)
}).strict();
export const periodResponseSchema = z.object({
  schemaVersion: z.literal(PERIOD_SCHEMA_VERSION), source: z.literal("iztro"), periodId: z.string().max(100), chartId: z.string().regex(CHART_ID_PATTERN),
  engineVersion: text, calendarVersion: text, ruleVersion: text, ruleHash: z.string().regex(/^[a-f0-9]{64}$/), generatedAt: z.string().datetime(),
  analysis: z.object({ solarDate: periodDateSchema, lunarDate: text, timeIndex: z.literal(0), timezone: z.literal("UTC+08:00"), horoscopeDivide: z.literal("normal"), ageDivide: z.literal("normal") }).strict(),
  nominalAge: z.number().int().min(1).max(125),
  timeline: z.array(z.object({ index, natalPalaceId: z.string().regex(EVIDENCE_ID_PATTERN), ageRange,
    yearRange: z.tuple([z.number().int().min(1900).max(2225), z.number().int().min(1900).max(2225)]) }).strict()).length(12),
  decadal: scopeSchema, yearly: scopeSchema, limitations: z.array(z.string().max(160)).length(3)
}).strict();
export type PeriodResponse = z.infer<typeof periodResponseSchema>;
export function periodIdFor(chartId: string, date: string) { return `${chartId}:period:${date}`; }
export function lunarOn(value: string) { const [year, month, day] = value.split("-").map(Number); return Solar.fromYmd(year, month, day).getLunar(); }
export function natalStarsNamed(chart: ChartResponse, name: string) { return chart.palaces.flatMap((palace) => [...palace.majorStars, ...palace.minorStars, ...palace.adjectiveStars]).filter((star) => star.name === name).map((star) => star.id); }

export function periodBindingIssue(value: PeriodResponse, chart: ChartResponse, date: string) {
  if (!periodResponseSchema.safeParse(value).success) return "PERIOD_STRUCTURE_INVALID";
  if (value.chartId !== chart.chartId || value.ruleHash !== chart.ruleHash || value.ruleVersion !== chart.ruleVersion || value.engineVersion !== chart.engineVersion || value.calendarVersion !== chart.rules.calendarVersion) return "PERIOD_BINDING_MISMATCH";
  if (value.analysis.solarDate !== date || value.periodId !== periodIdFor(chart.chartId, date) || date < canonicalDate(chart.solarDate)) return "PERIOD_DATE_MISMATCH";
  const lunar = lunarOn(date), birthday = lunarOn(chart.solarDate);
  const age = lunar.getYear() - birthday.getYear() + 1;
  if (value.nominalAge !== age || value.analysis.lunarDate !== lunar.toString() || value.yearly.heavenlyStem !== lunar.getYearGan() || value.yearly.earthlyBranch !== lunar.getYearZhi()) return "PERIOD_DATE_MISMATCH";
  const start = ({ 水二局: 2, 木三局: 3, 金四局: 4, 土五局: 5, 火六局: 6 } as Record<string, number>)[chart.fiveElementsClass];
  const soul = chart.palaces.find((palace) => palace.id === chart.summary.soulPalaceId)!.index;
  const direction = (chart.form.gender === "男") === (STEMS.indexOf(chart.chineseDate[0] as typeof STEMS[number]) % 2 === 0) ? 1 : -1;
  for (const [position, item] of value.timeline.entries()) {
    const expectedIndex = (soul + direction * position + 120) % 12, first = start + 10 * position;
    if (!start || item.index !== expectedIndex || item.natalPalaceId !== palaceIdFor(chart.chartId, expectedIndex) || item.ageRange[0] !== first || item.ageRange[1] !== first + 9 || item.yearRange[0] !== birthday.getYear() + first - 1 || item.yearRange[1] !== birthday.getYear() + first + 8) return "PERIOD_TIMELINE_INVALID";
  }
  const decade = value.timeline.find((item) => age >= item.ageRange[0] && age <= item.ageRange[1]);
  const child = chart.palaces.find((palace) => palace.name.replace(/宫$/, "") === ["命", "财帛", "疾厄", "夫妻", "福德", "官禄"][age - 1]);
  if (value.decadal.scope !== "decadal" || value.yearly.scope !== "yearly" || value.yearly.name !== "流年" || value.yearly.ageRange !== null || value.yearly.index !== BRANCHES.indexOf(value.yearly.earthlyBranch)) return "PERIOD_SCOPE_INVALID";
  if (value.decadal.index !== (decade?.index ?? child?.index) || value.decadal.name !== (decade ? "大限" : "童限") || JSON.stringify(value.decadal.ageRange) !== JSON.stringify(decade?.ageRange ?? null)) return "PERIOD_SCOPE_INVALID";
  const anchor = chart.palaces[value.decadal.index];
  if (value.decadal.heavenlyStem !== anchor.heavenlyStem || value.decadal.earthlyBranch !== anchor.earthlyBranch) return "PERIOD_SCOPE_INVALID";
  for (const scope of [value.decadal, value.yearly]) {
    const expectedStars = periodStarsFor(scope.heavenlyStem, scope.earthlyBranch, scope.scope);
    for (const [position, palace] of scope.palaces.entries()) {
      if (palace.index !== position || palace.natalPalaceId !== palaceIdFor(chart.chartId, position) || palace.name !== PERIOD_PALACES[(position - scope.index + 12) % 12]) return "PERIOD_PALACES_INVALID";
      if (new Set(palace.stars.map((star) => star.name)).size !== palace.stars.length || palace.stars.some((star, starIndex) => star.id !== `${value.periodId}:${scope.scope}:p:${position}:s:${starIndex}`)) return "PERIOD_STARS_INVALID";
      if (JSON.stringify(palace.stars.map(({ name, type }) => ({ name, type }))) !== JSON.stringify(expectedStars[position])) return "PERIOD_STARS_INVALID";
    }
    for (const [position, transform] of scope.mutagens.entries()) {
      if (transform.label !== TRANSFORM_LABELS[position] || transform.star !== PERIOD_MUTAGENS[scope.heavenlyStem][position] || JSON.stringify(transform.natalStarIds) !== JSON.stringify(natalStarsNamed(chart, transform.star))) return "PERIOD_MUTAGEN_INVALID";
    }
  }
  return JSON.stringify(value.limitations) === JSON.stringify(PERIOD_LIMITATIONS) ? null : "PERIOD_LIMITATIONS_INVALID";
}
