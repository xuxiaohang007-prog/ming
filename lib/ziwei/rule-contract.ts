export const RULE_VERSION = "ziwei-standard/1.0.0";
export const EXPECTED_ENGINE_VERSION = "2.6.1";
export const EXPECTED_CALENDAR_VERSION = "1.8.6";

export const FIXED_RULES = Object.freeze({
  language: "zh-CN" as const,
  timezone: "UTC+08:00" as const,
  fixLeap: true as const,
  config: Object.freeze({
    algorithm: "default" as const,
    dayDivide: "forward" as const,
    yearDivide: "normal" as const,
    horoscopeDivide: "normal" as const,
    ageDivide: "normal" as const
  })
});
