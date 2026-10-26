import { astro } from "iztro";
import { normalizeBirthInput } from "../birth-normalizer";
import type { ChartEvidence, ChartResponse, ChartStar, StarGroup, StarType } from "../types";
import { assertEngineRules, assertNoRuleOverrides, getRulesSnapshot } from "./engine-rules";
import { createEngineInstance } from "./engine-instance";
import { ZiweiEngineError } from "./errors";
import { validateEngineOutput } from "./validate-output";
import { createChartId } from "./chart-identity";
import { CHART_SCHEMA_VERSION, palaceIdFor, palaceLabel, starIdFor } from "../contract-version";
import { chartResponseSchema } from "../chart-contract";

export function generateChart(input: unknown): ChartResponse {
  assertNoRuleOverrides(input);
  const { form, birthInput } = normalizeBirthInput(input);
  assertEngineRules();
  const dateStr = form.birthDate.split("-").map(Number).join("-");
  const timeIndex = birthInput.timeIndex;
  let instance: ReturnType<typeof astro.bySolar>;
  let rawResult: unknown;
  let relations: Array<{ target: number; opposite: number; wealth: number; career: number }>;
  try {
    instance = createEngineInstance(form, birthInput);
    rawResult = instance.toJSON();
    relations = Array.from({ length: 12 }, (_, index) => {
      const related = instance.surroundedPalaces(index).toJSON();
      return { target: related.target.index, opposite: related.opposite.index, wealth: related.wealth.index, career: related.career.index };
    });
  } catch {
    throw new ZiweiEngineError("ENGINE_COMPUTATION_FAILED");
  }
  assertEngineRules();
  if (form.calendar === "lunar") {
    const [year, month, day] = dateStr.split("-").map(Number);
    const lunar = instance.rawDates.lunarDate;
    if (lunar.lunarYear !== year || lunar.lunarMonth !== month || lunar.lunarDay !== day || lunar.isLeap !== form.isLeapMonth) {
      throw new ZiweiEngineError("ENGINE_OUTPUT_INVALID");
    }
  }
  const result = validateEngineOutput(rawResult, birthInput);
  const provenance = getRulesSnapshot();
  const chartId = createChartId({ solarDate: birthInput.solarDate, timeIndex, gender: form.gender, timezone: birthInput.timezone, engineVersion: provenance.rules.engineVersion, ruleHash: provenance.ruleHash });
  const evidence: ChartEvidence[] = [];
  const palaces = result.palaces.map((palace) => {
    const id = palaceIdFor(chartId, palace.index);
    evidence.push({ id, kind: "palace", palaceId: id, palaceIndex: palace.index, starId: null, starGroup: null, label: palaceLabel(palace.name) });
    function mapStars(stars: { name: string; type: StarType; brightness?: string; mutagen?: string }[], group: StarGroup): ChartStar[] {
      return stars.map((star, index) => {
        const starId = starIdFor(id, group, index);
        evidence.push({ id: starId, kind: "star", palaceId: id, palaceIndex: palace.index, starId, starGroup: group, label: `${palaceLabel(palace.name)} · ${star.name}` });
        return { id: starId, name: star.name, type: star.type, brightness: star.brightness || "", mutagen: star.mutagen || "" };
      });
    }
    return {
      id, index: palace.index, name: palace.name, heavenlyStem: palace.heavenlyStem,
      earthlyBranch: palace.earthlyBranch, isBodyPalace: palace.isBodyPalace,
      surroundedPalaces: {
        target: palaceIdFor(chartId, relations[palace.index].target), opposite: palaceIdFor(chartId, relations[palace.index].opposite),
        wealth: palaceIdFor(chartId, relations[palace.index].wealth), career: palaceIdFor(chartId, relations[palace.index].career)
      },
      majorStars: mapStars(palace.majorStars, "major"), minorStars: mapStars(palace.minorStars, "minor"), adjectiveStars: mapStars(palace.adjectiveStars, "adjective")
    };
  });
  const chart: ChartResponse = {
    schemaVersion: CHART_SCHEMA_VERSION, chartId, generatedAt: new Date().toISOString(),
    source: "iztro", engineVersion: provenance.rules.engineVersion, form, birthInput, ...provenance,
    solarDate: result.solarDate, lunarDate: result.lunarDate, chineseDate: result.chineseDate,
    time: result.time, timeRange: result.timeRange,
    soul: result.soul, body: result.body, fiveElementsClass: result.fiveElementsClass,
    earthlyBranchOfSoulPalace: result.earthlyBranchOfSoulPalace,
    earthlyBranchOfBodyPalace: result.earthlyBranchOfBodyPalace,
    palaces, evidence,
    summary: {
      scope: "natal", soul: result.soul, body: result.body, fiveElementsClass: result.fiveElementsClass,
      soulPalaceId: palaces.find((palace) => palace.earthlyBranch === result.earthlyBranchOfSoulPalace)!.id,
      bodyPalaceId: palaces.find((palace) => palace.isBodyPalace)!.id
    }
  };
  const parsed = chartResponseSchema.safeParse(chart);
  if (!parsed.success) throw new ZiweiEngineError("RESPONSE_CONTRACT_INVALID");
  return parsed.data;
}
