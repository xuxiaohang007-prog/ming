import { z } from "zod";
import { CHART_ID_PATTERN, CHART_SCHEMA_VERSION, EVIDENCE_ID_PATTERN, STAR_TYPES, palaceIdFor, palaceLabel, starIdFor } from "./contract-version";
import { TIME_PATTERN, toTimeIndex } from "./birth-options";
import { birthSchema } from "./birth-schema";

const text = z.string().min(1);
const refId = z.string().regex(EVIDENCE_ID_PATTERN);
const group = z.enum(["major", "minor", "adjective"]);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const star = z.object({ id: refId, name: text, type: z.enum(STAR_TYPES), brightness: z.string(), mutagen: z.string() }).strict();
const palace = z.object({
  id: refId, index: z.number().int().min(0).max(11), name: text,
  heavenlyStem: text, earthlyBranch: text, isBodyPalace: z.boolean(),
  surroundedPalaces: z.object({ target: refId, opposite: refId, wealth: refId, career: refId }).strict(),
  majorStars: z.array(star), minorStars: z.array(star), adjectiveStars: z.array(star)
}).strict();
const evidence = z.object({
  id: refId, kind: z.enum(["palace", "star"]), palaceId: refId,
  palaceIndex: z.number().int().min(0).max(11), starId: refId.nullable(), starGroup: group.nullable(), label: text
}).strict();

export const chartResponseSchema = z.object({
  schemaVersion: z.literal(CHART_SCHEMA_VERSION), chartId: z.string().regex(CHART_ID_PATTERN), generatedAt: z.string().datetime(),
  source: z.literal("iztro"), engineVersion: text, ruleVersion: text, ruleHash: hash,
  rules: z.object({
    ruleVersion: text, engineVersion: text, calendarVersion: text, language: z.literal("zh-CN"), timezone: z.literal("UTC+08:00"),
    fixLeap: z.literal(true), tablePolicy: z.literal("iztro-packaged-defaults"), plugins: z.literal("none"),
    config: z.object({
      algorithm: z.literal("default"), dayDivide: z.literal("forward"), yearDivide: z.literal("normal"),
      horoscopeDivide: z.literal("normal"), ageDivide: z.literal("normal"),
      mutagens: z.record(z.array(text)), brightness: z.record(z.array(text))
    }).strict()
  }).strict(),
  form: z.object({
    name: z.string(), gender: z.enum(["男", "女"]), birthPlace: z.string(), calendar: z.enum(["solar", "lunar"]),
    birthDate: text, birthTime: z.string(), birthTimeMode: z.enum(["exact", "period", "unknown"]).optional(), birthTimePeriod: z.string().optional(), isLeapMonth: z.boolean()
  }).strict(),
  birthInput: z.object({
    originalDate: text, originalTime: z.string().nullable(), originalTimePeriod: z.string().nullable(), calendar: z.enum(["solar", "lunar"]),
    isLeapMonth: z.boolean(), solarDate: text, timeMode: z.enum(["exact", "period"]), timeIndex: z.number().int().min(0).max(12),
    timeLabel: text, timeRange: text, timezone: z.literal("UTC+08:00"), dayDivide: z.literal("forward"), fixLeap: z.literal(true)
  }).strict(),
  solarDate: text, lunarDate: text, chineseDate: text, time: text, timeRange: text,
  soul: text, body: text, fiveElementsClass: text, earthlyBranchOfSoulPalace: text, earthlyBranchOfBodyPalace: text,
  palaces: z.array(palace).length(12), evidence: z.array(evidence),
  summary: z.object({ scope: z.literal("natal"), soul: text, body: text, fiveElementsClass: text, soulPalaceId: refId, bodyPalaceId: refId }).strict()
}).strict().superRefine((chart, context) => {
  const issue = (path: string[], message: string) => context.addIssue({ code: "custom", path, message });
  const branches = ["寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥", "子", "丑"];
  if (new Set(chart.palaces.map((item) => item.name)).size !== 12) issue(["palaces"], "宫名重复");
  const expected = new Map<string, { palaceId: string; palaceIndex: number; kind: "palace" | "star"; starId: string | null; starGroup: "major" | "minor" | "adjective" | null; label: string }>();
  for (const [index, item] of chart.palaces.entries()) {
    if (item.index !== index || item.earthlyBranch !== branches[index] || item.id !== palaceIdFor(chart.chartId, index)) issue(["palaces"], "宫位索引、地支或命盘命名空间不一致");
    const offsets = { target: 0, opposite: 6, wealth: 8, career: 4 } as const;
    for (const key of Object.keys(offsets) as (keyof typeof offsets)[]) {
      if (item.surroundedPalaces[key] !== palaceIdFor(chart.chartId, (index + offsets[key]) % 12)) issue(["palaces"], "三方四正关系不一致");
    }
    expected.set(item.id, { palaceId: item.id, palaceIndex: index, kind: "palace", starId: null, starGroup: null, label: palaceLabel(item.name) });
    const groups = [["major", item.majorStars], ["minor", item.minorStars], ["adjective", item.adjectiveStars]] as const;
    for (const [category, stars] of groups) stars.forEach((value, starIndex) => {
      if (value.id !== starIdFor(item.id, category, starIndex)) issue(["palaces"], "星曜引用 ID 不一致");
      expected.set(value.id, { palaceId: item.id, palaceIndex: index, kind: "star", starId: value.id, starGroup: category, label: `${palaceLabel(item.name)} · ${value.name}` });
    });
  }
  if (new Set(chart.evidence.map((item) => item.id)).size !== chart.evidence.length || chart.evidence.length !== expected.size) issue(["evidence"], "引用目录重复或不完整");
  for (const item of chart.evidence) {
    const target = expected.get(item.id);
    if (!target || Object.entries(target).some(([key, value]) => item[key as keyof typeof item] !== value)) issue(["evidence"], "引用目录指向错误的宫位或星曜");
  }
  const soul = chart.palaces.find((item) => item.earthlyBranch === chart.earthlyBranchOfSoulPalace);
  const body = chart.palaces.filter((item) => item.isBodyPalace);
  if (!soul || body.length !== 1 || body[0].earthlyBranch !== chart.earthlyBranchOfBodyPalace || chart.summary.soulPalaceId !== soul.id || chart.summary.bodyPalaceId !== body[0].id) issue(["summary"], "命宫或身宫引用不一致");
  if (chart.summary.soul !== chart.soul || chart.summary.body !== chart.body || chart.summary.fiveElementsClass !== chart.fiveElementsClass) issue(["summary"], "兼容字段与摘要不一致");
  if (chart.rules.ruleVersion !== chart.ruleVersion || chart.rules.engineVersion !== chart.engineVersion) issue(["rules"], "规则版本不一致");
  const birth = chart.birthInput;
  if (!birthSchema.safeParse(chart.form).success) issue(["form"], "命盘出生条件无效");
  if (birth.solarDate !== chart.solarDate || birth.originalDate !== chart.form.birthDate || birth.calendar !== chart.form.calendar || birth.isLeapMonth !== chart.form.isLeapMonth || birth.timeMode !== (chart.form.birthTimeMode ?? "exact")) issue(["birthInput"], "出生信息与归一化来源不一致");
  if (birth.timeMode === "exact") {
    if (!birth.originalTime || !TIME_PATTERN.test(birth.originalTime) || birth.originalTime !== chart.form.birthTime || birth.originalTimePeriod !== null || toTimeIndex(birth.originalTime) !== birth.timeIndex) issue(["birthInput"], "准确时间归一化不一致");
  } else if (birth.originalTime !== null || birth.originalTimePeriod !== chart.form.birthTimePeriod || Number(birth.originalTimePeriod) !== birth.timeIndex) issue(["birthInput"], "时辰来源不一致");
});
