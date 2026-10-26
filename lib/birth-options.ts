export const BIRTH_YEAR_MIN = 1900;
export const BIRTH_YEAR_MAX = 2100;
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const TIME_PERIODS = [
  { index: 0, name: "早子时", start: "00:00", end: "00:59" },
  { index: 1, name: "丑时", start: "01:00", end: "02:59" },
  { index: 2, name: "寅时", start: "03:00", end: "04:59" },
  { index: 3, name: "卯时", start: "05:00", end: "06:59" },
  { index: 4, name: "辰时", start: "07:00", end: "08:59" },
  { index: 5, name: "巳时", start: "09:00", end: "10:59" },
  { index: 6, name: "午时", start: "11:00", end: "12:59" },
  { index: 7, name: "未时", start: "13:00", end: "14:59" },
  { index: 8, name: "申时", start: "15:00", end: "16:59" },
  { index: 9, name: "酉时", start: "17:00", end: "18:59" },
  { index: 10, name: "戌时", start: "19:00", end: "20:59" },
  { index: 11, name: "亥时", start: "21:00", end: "22:59" },
  { index: 12, name: "晚子时", start: "23:00", end: "23:59" }
] as const;

export function toTimeIndex(time: string): number {
  if (!TIME_PATTERN.test(time)) throw new Error("出生时间必须为有效的 HH:mm");
  const hour = Number(time.slice(0, 2));
  return hour === 23 ? 12 : Math.floor((hour + 1) / 2);
}
