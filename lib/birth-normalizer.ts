import { Lunar } from "lunar-typescript";
import { birthSchema } from "./birth-schema";
import { TIME_PERIODS, toTimeIndex } from "./birth-options";
import type { FortuneFormData, NormalizedBirthInput } from "./types";
import { FIXED_RULES } from "./ziwei/rule-contract";

export function normalizeBirthInput(input: unknown): { form: FortuneFormData; birthInput: NormalizedBirthInput } {
  const form = birthSchema.parse(input);
  const [year, month, day] = form.birthDate.split("-").map(Number);
  const mode = form.birthTimeMode === "period" ? "period" : "exact";
  const index = mode === "period" ? Number(form.birthTimePeriod) : toTimeIndex(form.birthTime);
  const period = TIME_PERIODS[index];
  let solarDate = `${year}-${month}-${day}`;
  if (form.calendar === "lunar") {
    const solar = Lunar.fromYmd(year, form.isLeapMonth ? -month : month, day).getSolar();
    solarDate = `${solar.getYear()}-${solar.getMonth()}-${solar.getDay()}`;
  }
  return {
    form,
    birthInput: {
      originalDate: form.birthDate,
      originalTime: mode === "exact" ? form.birthTime : null,
      originalTimePeriod: mode === "period" ? form.birthTimePeriod! : null,
      calendar: form.calendar, isLeapMonth: form.isLeapMonth, solarDate,
      timeMode: mode, timeIndex: index, timeLabel: period.name,
      timeRange: `${period.start} 至 ${period.end}`,
      timezone: FIXED_RULES.timezone, dayDivide: FIXED_RULES.config.dayDivide, fixLeap: FIXED_RULES.fixLeap
    }
  };
}
