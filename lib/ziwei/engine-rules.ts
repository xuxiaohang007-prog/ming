import { createHash } from "node:crypto";
import { astro } from "iztro";
import iztroPackage from "iztro/package.json";
import appPackage from "../../package.json";
import { EXPECTED_CALENDAR_VERSION, EXPECTED_ENGINE_VERSION, FIXED_RULES, RULE_VERSION } from "./rule-contract";
import { ZiweiEngineError, ZiweiRequestError } from "./errors";
import type { ZiweiRulesSnapshot } from "../types";
import { canonical } from "./canonical-json";

const expectedConfig = { ...FIXED_RULES.config, mutagens: {}, brightness: {} };
const expectedConfigString = canonical(expectedConfig);
const snapshot: ZiweiRulesSnapshot = {
  ruleVersion: RULE_VERSION,
  engineVersion: EXPECTED_ENGINE_VERSION,
  calendarVersion: EXPECTED_CALENDAR_VERSION,
  language: FIXED_RULES.language,
  timezone: FIXED_RULES.timezone,
  fixLeap: FIXED_RULES.fixLeap,
  tablePolicy: "iztro-packaged-defaults",
  plugins: "none",
  config: expectedConfig
};
const ruleHash = createHash("sha256").update(canonical(snapshot)).digest("hex");

// Initialize once. No request is allowed to switch the process-wide rules.
astro.config(FIXED_RULES.config);

export function assertEngineRules() {
  if (iztroPackage.version !== EXPECTED_ENGINE_VERSION || appPackage.dependencies.iztro !== EXPECTED_ENGINE_VERSION || appPackage.dependencies["lunar-typescript"] !== EXPECTED_CALENDAR_VERSION) {
    throw new ZiweiEngineError("ENGINE_VERSION_MISMATCH");
  }
  if (canonical(astro.getConfig()) !== expectedConfigString) throw new ZiweiEngineError("ENGINE_CONFIG_CHANGED");
}

export function getRulesSnapshot() {
  assertEngineRules();
  return { ruleVersion: RULE_VERSION, ruleHash, rules: structuredClone(snapshot) };
}

export function assertNoRuleOverrides(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return;
  const forbidden = ["config", "rules", "algorithm", "language", "timezone", "dayDivide", "yearDivide", "ageDivide", "horoscopeDivide", "fixLeap", "astroType", "plugins"];
  if (forbidden.some((key) => Object.prototype.hasOwnProperty.call(input, key))) {
    throw new ZiweiRequestError("UNSUPPORTED_RULE_OVERRIDE", "当前仅支持固定排盘规则，不接受流派、语言或时间基准覆盖。");
  }
}

export function assertExpectedRuleHash(value: unknown, actual: string) {
  if (value === undefined) return;
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new ZiweiRequestError("INVALID_RULE_HASH", "排盘规则标识无效，请重新生成命盘。");
  if (value !== actual) throw new ZiweiRequestError("RULES_CHANGED", "排盘规则已更新，请返回录入页重新生成命盘后再解读。", 409);
}
