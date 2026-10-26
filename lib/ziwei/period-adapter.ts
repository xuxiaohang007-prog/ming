import { z } from "zod";
import { generateChart } from "./iztro-adapter";
import { createEngineInstance } from "./engine-instance";
import { assertEngineRules, assertExpectedRuleHash, assertNoRuleOverrides } from "./engine-rules";
import { assertExpectedChartId } from "./chart-identity";
import { ZiweiEngineError, ZiweiRequestError } from "./errors";
import { BRANCHES, STEMS, PERIOD_PALACES, PERIOD_SCHEMA_VERSION, PERIOD_LIMITATIONS, TRANSFORM_LABELS, canonicalDate, lunarOn, natalStarsNamed, periodBindingIssue, periodIdFor, periodRequestSchema, periodResponseSchema } from "../period-contract";
import type { PeriodResponse } from "../period-contract";
import { STAR_TYPES, palaceIdFor } from "../contract-version";

const rawScope = z.object({ index: z.number().int().min(0).max(11), name: z.enum(["大限", "童限", "流年"]), heavenlyStem: z.enum(STEMS), earthlyBranch: z.enum(BRANCHES),
  palaceNames: z.array(z.enum(PERIOD_PALACES)).length(12), mutagen: z.array(z.string()).length(4),
  stars: z.array(z.array(z.object({ name: z.string().min(1).max(40), type: z.enum(STAR_TYPES), scope: z.enum(["decadal", "yearly"]) }).passthrough()).max(30)).length(12)
}).passthrough();

export function generatePeriodContext(input: unknown) {
  assertNoRuleOverrides(input);
  const parsed = periodRequestSchema.safeParse(input);
  if (!parsed.success) throw new ZiweiRequestError("INVALID_PERIOD_INPUT", parsed.error.issues[0].path[0] === "analysisDate" ? parsed.error.issues[0].message : "请提供有效的出生档案、命盘标识、规则指纹与公历分析日期。");
  const request = parsed.data, chart = generateChart(request.form);
  assertExpectedChartId(request.chartId, chart.chartId); assertExpectedRuleHash(request.ruleHash, chart.ruleHash);
  if (request.analysisDate < canonicalDate(chart.solarDate)) throw new ZiweiRequestError("PERIOD_OUT_OF_RANGE", "分析日期不能早于公历出生日期。");
  const target = lunarOn(request.analysisDate), birth = lunarOn(chart.solarDate);
  const nominalAge = target.getYear() - birth.getYear() + 1;
  let raw: { solarDate: string; lunarDate: string; nominalAge: number; decadal: z.infer<typeof rawScope>; yearly: z.infer<typeof rawScope> };
  let timeline: PeriodResponse["timeline"];
  try {
    const instance = createEngineInstance(chart.form, chart.birthInput);
    timeline = instance.decadalList().map((item) => ({ index: item.index, natalPalaceId: palaceIdFor(chart.chartId, item.index), ageRange: item.ageRange, yearRange: item.yearRange }));
    if (nominalAge > timeline[timeline.length - 1].ageRange[1]) throw new ZiweiRequestError("PERIOD_OUT_OF_RANGE", "该日期超出当前命盘十二个大限支持的虚岁范围，请选择更早的日期。");
    const value = instance.horoscope(request.analysisDate, 0).toJSON();
    raw = { solarDate: value.solarDate, lunarDate: value.lunarDate, nominalAge: value.age.nominalAge, decadal: rawScope.parse(value.decadal), yearly: rawScope.parse(value.yearly) };
  } catch (error) {
    if (error instanceof ZiweiRequestError) throw error;
    throw new ZiweiEngineError("ENGINE_COMPUTATION_FAILED");
  }
  assertEngineRules();
  if (canonicalDate(raw.solarDate) !== request.analysisDate || raw.nominalAge !== nominalAge) throw new ZiweiEngineError("ENGINE_OUTPUT_INVALID");
  const periodId = periodIdFor(chart.chartId, request.analysisDate);
  const mapScope = (scope: "decadal" | "yearly"): PeriodResponse["yearly"] => {
    const source = raw[scope];
    if (source.stars.some((stars) => stars.some((star) => star.scope !== scope))) throw new ZiweiEngineError("ENGINE_OUTPUT_INVALID");
    return { scope, name: source.name, index: source.index, heavenlyStem: source.heavenlyStem, earthlyBranch: source.earthlyBranch,
      ageRange: scope === "decadal" && source.name === "大限" ? timeline.find((item) => item.index === source.index)!.ageRange : null,
      palaces: source.palaceNames.map((name, index) => ({ index, natalPalaceId: palaceIdFor(chart.chartId, index), name,
        stars: source.stars[index].map((star, position) => ({ id: `${periodId}:${scope}:p:${index}:s:${position}`, name: star.name, type: star.type })) })),
      mutagens: source.mutagen.map((star, index) => ({ label: TRANSFORM_LABELS[index], star, natalStarIds: natalStarsNamed(chart, star) })) };
  };
  const result = periodResponseSchema.safeParse({ schemaVersion: PERIOD_SCHEMA_VERSION, source: "iztro", periodId, chartId: chart.chartId,
    engineVersion: chart.engineVersion, calendarVersion: chart.rules.calendarVersion, ruleVersion: chart.ruleVersion, ruleHash: chart.ruleHash,
    generatedAt: new Date().toISOString(), analysis: { solarDate: request.analysisDate, lunarDate: raw.lunarDate, timeIndex: 0, timezone: "UTC+08:00", horoscopeDivide: "normal", ageDivide: "normal" },
    nominalAge, timeline, decadal: mapScope("decadal"), yearly: mapScope("yearly"), limitations: PERIOD_LIMITATIONS });
  if (!result.success || periodBindingIssue(result.data, chart, request.analysisDate)) throw new ZiweiEngineError("ENGINE_OUTPUT_INVALID");
  return { period: result.data, chart };
}

export function generatePeriod(input: unknown): PeriodResponse { return generatePeriodContext(input).period; }
