import { z } from "zod";
import { DATE_PATTERN, getLunarMonthInfo, parseBirthDate } from "./birth-calendar";
import { TIME_PATTERN } from "./birth-options";

export { toTimeIndex } from "./birth-options";

export const birthSchema = z.object({
  name: z.string().trim().max(40, "称呼请控制在 40 个字符以内").default(""),
  gender: z.custom<"男" | "女">((value) => value === "男" || value === "女", { message: "请选择排盘性别", fatal: false }),
  birthPlace: z.string().trim().max(100, "地点请控制在 100 个字符以内").default(""),
  calendar: z.enum(["solar", "lunar"], { message: "请选择公历或农历" }),
  birthDate: z.string().trim().regex(DATE_PATTERN, "请输入年-月-日，例如 2000-7-17"),
  birthTime: z.string().trim().default(""),
  birthTimeMode: z.enum(["exact", "period", "unknown"], { message: "请选择有效的出生时间输入方式" }).optional(),
  birthTimePeriod: z.string().trim().optional(),
  isLeapMonth: z.boolean().default(false)
}).superRefine((value, context) => {
  const issue = (field: string, message: string) => context.addIssue({ code: "custom", path: [field], message });
  const mode = value.birthTimeMode ?? "exact";
  if (mode === "exact") {
    if (!TIME_PATTERN.test(value.birthTime)) issue("birthTime", "请输入有效出生时间；不确定时可选择时辰或标记未知");
    if (value.birthTimePeriod) issue("birthTimePeriod", "准确时间模式不应同时提交时辰，请重新选择输入方式");
  } else if (mode === "period") {
    if (!/^(?:[0-9]|1[0-2])$/.test(value.birthTimePeriod ?? "")) issue("birthTimePeriod", "请选择出生时辰，早子与晚子需分别选择");
    if (value.birthTime) issue("birthTime", "时辰模式不应同时提交具体时间，请重新选择输入方式");
  } else {
    issue("birthTimeMode", "出生时间未知，暂不能生成确定命盘；请补充准确时间或出生时辰");
  }

  const parts = parseBirthDate(value.birthDate);
  if (DATE_PATTERN.test(value.birthDate) && !parts) issue("birthDate", "请输入 1900 至 2100 年之间有效的出生日期");
  if (parts) {
    const { year, month, day } = parts;
    if (value.calendar === "solar") {
      const date = new Date(Date.UTC(year, month - 1, day));
      if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) issue("birthDate", "该公历日期不存在，请核对月份和闰年");
    } else {
      const info = getLunarMonthInfo(year, month, value.isLeapMonth);
      if (value.isLeapMonth && info.leapMonth !== month) {
        issue("isLeapMonth", info.leapMonth ? `${year} 年只有闰${info.leapMonth}月，请核对月份或取消闰月` : `${year} 年没有闰月，请取消闰月选项`);
      } else if (info.dayCount === null || day > info.dayCount) {
        issue("birthDate", `该农历月份只有 ${info.dayCount ?? 0} 天，请核对出生日期`);
      }
    }
  }
  if (value.calendar === "solar" && value.isLeapMonth) {
    issue("isLeapMonth", "公历输入不使用农历闰月选项");
  }
});
