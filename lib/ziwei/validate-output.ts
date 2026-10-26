import { z } from "zod";
import { ZiweiEngineError } from "./errors";
import type { NormalizedBirthInput } from "../types";
import { STAR_TYPES } from "../contract-version";

const text = z.string().min(1);
const star = z.object({ name: text, type: z.enum(STAR_TYPES), brightness: z.string().optional(), mutagen: z.string().optional() });
const branchNames = ["寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥", "子", "丑"];
const outputSchema = z.object({
  solarDate: text, lunarDate: text, chineseDate: text, time: text, timeRange: text,
  soul: text, body: text, fiveElementsClass: text,
  earthlyBranchOfSoulPalace: text, earthlyBranchOfBodyPalace: text,
  palaces: z.array(z.object({
    index: z.number().int().min(0).max(11), name: text,
    heavenlyStem: text, earthlyBranch: text, isBodyPalace: z.boolean(),
    majorStars: z.array(star), minorStars: z.array(star), adjectiveStars: z.array(star)
  })).length(12)
});

export function validateEngineOutput(value: unknown, birthInput: NormalizedBirthInput) {
  const parsed = outputSchema.safeParse(value);
  if (!parsed.success) throw new ZiweiEngineError("ENGINE_OUTPUT_INVALID");
  const result = parsed.data;
  const bodyPalaces = result.palaces.filter((palace) => palace.isBodyPalace);
  if (
    result.solarDate !== birthInput.solarDate ||
    result.palaces.some((palace, index) => palace.index !== index || palace.earthlyBranch !== branchNames[index]) ||
    new Set(result.palaces.map((palace) => palace.name)).size !== 12 ||
    !branchNames.includes(result.earthlyBranchOfSoulPalace) ||
    bodyPalaces.length !== 1 || bodyPalaces[0].earthlyBranch !== result.earthlyBranchOfBodyPalace
  ) throw new ZiweiEngineError("ENGINE_OUTPUT_INVALID");
  return result;
}
