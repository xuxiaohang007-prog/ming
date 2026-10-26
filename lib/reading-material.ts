import { chartResponseSchema } from "./chart-contract";
import { palaceLabel } from "./contract-version";
import { parseReadingOptions, REPORT_SECTIONS } from "./reading-contract";
import type { ChartPalace, ChartResponse, ChartStar, ReportFact } from "./types";

const unique = <T,>(values: T[]) => [...new Set(values)];
function describeStar(star: ChartStar) {
  const annotations = [star.brightness ? `亮度${star.brightness}` : "", star.mutagen ? `化${star.mutagen}` : ""].filter(Boolean);
  return `${star.name}${annotations.length ? `（${annotations.join("、")}）` : ""}`;
}
function palaceFact(palace: ChartPalace, sectionId: string, prefix = ""): ReportFact {
  const major = palace.majorStars.filter((star) => star.type === "major");
  const auxiliary = [...palace.majorStars.filter((star) => star.type !== "major"), ...palace.minorStars];
  return {
    id: `${sectionId}:palace:${palace.index}`,
    text: `${prefix}${palaceLabel(palace.name)}位于${palace.heavenlyStem}${palace.earthlyBranch}${palace.isBodyPalace ? "，兼为身宫" : ""}；十四主星：${major.map(describeStar).join("、") || "空宫（无十四主星）"}；辅星与禄存、天马：${auxiliary.map(describeStar).join("、") || "无"}。`,
    evidenceIds: [palace.id, ...major.map((star) => star.id), ...auxiliary.map((star) => star.id)]
  };
}

export function buildReadingMaterial(input: ChartResponse, options?: unknown) {
  const chart = chartResponseSchema.parse(input);
  const reading = parseReadingOptions(options);
  const soul = chart.palaces.find((palace) => palace.id === chart.summary.soulPalaceId)!;
  const body = chart.palaces.find((palace) => palace.id === chart.summary.bodyPalaceId)!;
  const byName = (names: string[]) => chart.palaces.filter((palace) => names.includes(palace.name.replace(/宫$/, "")));
  const sections = REPORT_SECTIONS.map((definition) => {
    let primary = [soul];
    if (definition.id === "overview" || definition.id === "actions") primary = unique([soul, body]);
    if (definition.id === "career") primary = byName(["官禄"]);
    if (definition.id === "resources") primary = byName(["财帛"]);
    if (definition.id === "relationships") primary = byName(["夫妻", "兄弟", "仆役", "交友"]);
    if (!primary.length) throw new Error("READING_REQUIRED_PALACE_MISSING");
    const relatedIds = unique(primary.flatMap((palace) => Object.values(palace.surroundedPalaces)));
    const facts = primary.map((palace) => palaceFact(palace, definition.id));
    if (definition.id === "overview" || definition.id === "actions") facts.unshift({
      id: `${definition.id}:summary`, text: `本命盘命主为${chart.soul}，身主为${chart.body}，五行局为${chart.fiveElementsClass}。`, evidenceIds: unique([soul.id, body.id])
    });
    if (definition.id === "personality" && !soul.majorStars.some((star) => star.type === "major")) {
      const opposite = chart.palaces.find((palace) => palace.id === soul.surroundedPalaces.opposite)!;
      facts.push(palaceFact(opposite, definition.id, "命宫为空宫，以下仅为对宫原位参考，不计入命宫星曜："));
    }
    const related = chart.palaces.filter((palace) => relatedIds.includes(palace.id));
    return { ...definition, primaryPalaceIds: primary.map((palace) => palace.id), relatedPalaceIds: relatedIds,
      allowedEvidenceIds: related.flatMap((palace) => [palace.id, ...palace.majorStars.map((star) => star.id), ...palace.minorStars.map((star) => star.id), ...palace.adjectiveStars.map((star) => star.id)]), facts };
  });
  const selectedIds = new Set(sections.flatMap((section) => section.relatedPalaceIds));
  const limitations = [
    "本报告仅包含本命盘资料，未纳入大限、流年或事件时点，不支持对应预测。",
    "采用 UTC+08:00 标准时间，未校正出生地真太阳时。",
    chart.birthInput.timeMode === "period" ? "出生时间来自时辰范围，未推定准确分钟。" : "出生时间由用户提供，未进行独立核验。",
    "命理内容用于文化阅读与自我观察，不替代医疗、法律、投资或重大人生决策依据。"
  ];
  return {
    schemaVersion: "ziwei-reading-material/1.0.0" as const, chartId: chart.chartId,
    scope: "natal" as const, engineVersion: chart.engineVersion, ruleVersion: chart.ruleVersion, ruleHash: chart.ruleHash,
    reading, summary: { ...chart.summary, timePrecision: chart.birthInput.timeMode },
    capabilities: { horoscope: false, trueSolarTime: false } as const,
    limitations, sections,
    palaces: chart.palaces.filter((palace) => selectedIds.has(palace.id)).map((palace) => ({ ...palace })),
    evidence: chart.evidence.filter((item) => selectedIds.has(item.palaceId))
  };
}
export type ReadingMaterial = ReturnType<typeof buildReadingMaterial>;
