import { LunarYear } from "lunar-typescript";
import { BIRTH_YEAR_MAX, BIRTH_YEAR_MIN } from "./birth-options";

export const DATE_PATTERN = /^\d{4}-\d{1,2}-\d{1,2}$/;

export function parseBirthDate(date: string) {
  if (!DATE_PATTERN.test(date)) return null;
  const [year, month, day] = date.split("-").map(Number);
  if (year < BIRTH_YEAR_MIN || year > BIRTH_YEAR_MAX || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

export function getLunarMonthInfo(year: number, month: number, isLeapMonth: boolean) {
  const lunarYear = LunarYear.fromYear(year);
  return {
    leapMonth: lunarYear.getLeapMonth(),
    dayCount: lunarYear.getMonth(isLeapMonth ? -month : month)?.getDayCount() ?? null
  };
}
