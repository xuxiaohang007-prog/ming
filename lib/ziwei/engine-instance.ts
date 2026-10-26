import { astro } from "iztro";
import type { FortuneFormData, NormalizedBirthInput } from "../types";
import { FIXED_RULES } from "./rule-contract";

export function createEngineInstance(form: FortuneFormData, birth: NormalizedBirthInput) {
  const date = form.birthDate.split("-").map(Number).join("-");
  return form.calendar === "solar"
    ? astro.bySolar(date, birth.timeIndex, form.gender, FIXED_RULES.fixLeap, FIXED_RULES.language)
    : astro.byLunar(date, birth.timeIndex, form.gender, form.isLeapMonth, FIXED_RULES.fixLeap, FIXED_RULES.language);
}
