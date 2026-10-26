import { createHash } from "node:crypto";
import { canonical } from "./canonical-json";
import { CHART_ID_PATTERN } from "../contract-version";
import { ZiweiRequestError } from "./errors";

type IdentityConditions = {
  solarDate: string;
  timeIndex: number;
  gender: "男" | "女";
  timezone: string;
  engineVersion: string;
  ruleHash: string;
};

export function createChartId(conditions: IdentityConditions) {
  const fingerprint = createHash("sha256").update(canonical({ identityVersion: "ziwei-natal-identity/1", ...conditions })).digest("hex");
  return `zw_${fingerprint}`;
}

export function assertExpectedChartId(value: unknown, actual: string) {
  if (value === undefined) return;
  if (typeof value !== "string" || !CHART_ID_PATTERN.test(value)) throw new ZiweiRequestError("INVALID_CHART_ID", "命盘标识格式无效，请重新生成命盘。");
  if (value !== actual) throw new ZiweiRequestError("CHART_MISMATCH", "解读请求与已确认命盘不一致，请重新生成命盘。", 409);
}
