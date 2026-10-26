import { expect, test } from "@playwright/test";
import { astro } from "iztro";
import * as astroImplementation from "iztro/lib/astro/astro";
import iztroPackage from "iztro/package.json";
import lockfile from "../../package-lock.json";
import fixture from "./fixtures/ziwei-standard.json";
import { generateChart } from "../../lib/ziwei/iztro-adapter";
import { FIXED_RULES, RULE_VERSION } from "../../lib/ziwei/rule-contract";
import { getRulesSnapshot } from "../../lib/ziwei/engine-rules";
import { ZiweiEngineError } from "../../lib/ziwei/errors";
import { validateEngineOutput } from "../../lib/ziwei/validate-output";
import { normalizeBirthInput } from "../../lib/birth-normalizer";
import { apiError } from "../../lib/api-error";
import type { ChartResponse } from "../../lib/types";

function restoreRules() {
  const config = astro.getConfig();
  for (const key of Object.keys(config.mutagens)) Reflect.deleteProperty(config.mutagens, key);
  for (const key of Object.keys(config.brightness)) Reflect.deleteProperty(config.brightness, key);
  astro.config(FIXED_RULES.config);
}

function captureFailure(operation: () => unknown) {
  try { operation(); } catch (error) { return error; }
  throw new Error("Expected an engine failure");
}

test("rules are pinned, immutable and recorded as detached snapshots", () => {
  expect(lockfile.packages["node_modules/iztro"].version).toBe("2.6.1");
  expect(lockfile.packages["node_modules/lunar-typescript"].version).toBe("1.8.6");
  expect(Object.isFrozen(FIXED_RULES)).toBe(true);
  expect(Object.isFrozen(FIXED_RULES.config)).toBe(true);
  const first = getRulesSnapshot();
  expect(first).toMatchObject({ ruleVersion: RULE_VERSION, rules: { engineVersion: "2.6.1", calendarVersion: "1.8.6", language: "zh-CN", timezone: "UTC+08:00", fixLeap: true, tablePolicy: "iztro-packaged-defaults", plugins: "none", config: { algorithm: "default", dayDivide: "forward", yearDivide: "normal", ageDivide: "normal", horoscopeDivide: "normal", mutagens: {}, brightness: {} } } });
  expect(first.ruleHash).toMatch(/^[a-f0-9]{64}$/);
  Reflect.set(first.rules.config, "dayDivide", "current");
  first.rules.config.mutagens.injected = ["unexpected"];
  const next = getRulesSnapshot();
  expect(next.rules.config.dayDivide).toBe("forward");
  expect(next.rules.config.mutagens).toEqual({});
  expect(next.ruleHash).toBe(first.ruleHash);
});

test("standard fixture matches the core palace stars and repeated calculation", async ({ request }) => {
  const response = await request.post("/api/chart/generate", { data: fixture.input });
  expect(response.status()).toBe(200);
  const chart: ChartResponse = await response.json();
  expect(chart).toMatchObject(fixture.expected);
  for (const expected of fixture.palaces) {
    const palace = chart.palaces.find((item) => item.earthlyBranch === expected.branch)!;
    expect(palace.majorStars.map((star) => star.name)).toEqual(expect.arrayContaining(expected.mainStars));
    if (!expected.mainStars.length) expect(palace.majorStars).toHaveLength(0);
  }
  const repeat = await request.post("/api/chart/generate", { data: fixture.input });
  const again: ChartResponse = await repeat.json();
  const { generatedAt: firstTime, ...firstCalculation } = chart;
  const { generatedAt: secondTime, ...secondCalculation } = again;
  expect(firstTime).toBeTruthy(); expect(secondTime).toBeTruthy();
  expect(secondCalculation).toEqual(firstCalculation);
  const renamed = await request.post("/api/chart/generate", { data: { ...fixture.input, name: "不同称呼", birthPlace: "另一个地点" } });
  const other: ChartResponse = await renamed.json();
  expect(other.palaces).toEqual(chart.palaces);
  expect(other.ruleHash).toBe(chart.ruleHash);
});

test("scalar global config drift is rejected without resetting it per request", () => {
  for (const config of [{ dayDivide: "current" as const }, { algorithm: "zhongzhou" as const }, { yearDivide: "exact" as const }]) {
    try {
      astro.config(config);
      const error = captureFailure(() => generateChart(fixture.input));
      expect(error).toBeInstanceOf(ZiweiEngineError);
      expect(error).toMatchObject({ code: "ENGINE_CONFIG_CHANGED" });
      expect(apiError(error).status).toBe(500);
    } finally { restoreRules(); }
  }
  expect(generateChart(fixture.input).ruleVersion).toBe(RULE_VERSION);
});

test("custom mutagen and brightness tables cannot silently change the rules", () => {
  try {
    astro.config({ mutagens: { 庚: ["太阳", "武曲", "天同", "天相"] } });
    expect(captureFailure(() => generateChart(fixture.input))).toMatchObject({ code: "ENGINE_CONFIG_CHANGED" });
  } finally { restoreRules(); }
  try {
    astro.config({ brightness: { 贪狼: Array.from({ length: 12 }, () => "旺" as const) } });
    expect(captureFailure(() => generateChart(fixture.input))).toMatchObject({ code: "ENGINE_CONFIG_CHANGED" });
  } finally { restoreRules(); }
});

test("a changed runtime iztro version is rejected until the contract is updated", () => {
  const version = iztroPackage.version;
  try {
    iztroPackage.version = "9.9.9";
    expect(captureFailure(() => generateChart(fixture.input))).toMatchObject({ code: "ENGINE_VERSION_MISMATCH" });
  } finally { iztroPackage.version = version; }
});

test("vendor exceptions and malformed output return 500 without mock data or private errors", async () => {
  // The public re-export is read-only; fault injection targets its underlying implementation.
  const descriptor = Object.getOwnPropertyDescriptor(astroImplementation, "bySolar")!;
  const original = astro.bySolar;
  try {
    Object.defineProperty(astroImplementation, "bySolar", { ...descriptor, value: () => { throw new Error("private-vendor-details"); } });
    const response = apiError(captureFailure(() => generateChart(fixture.input)));
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.code).toBe("ENGINE_COMPUTATION_FAILED");
    expect(body).not.toHaveProperty("palaces");
    expect(JSON.stringify(body)).not.toContain("private-vendor-details");
    Object.defineProperty(astroImplementation, "bySolar", { ...descriptor, value: (...args: Parameters<typeof astro.bySolar>) => {
      const instance = original(...args); const json = instance.toJSON(); json.palaces = [];
      Object.defineProperty(instance, "toJSON", { value: () => json }); return instance;
    } });
    const bad = apiError(captureFailure(() => generateChart(fixture.input)));
    expect(bad.status).toBe(500);
    expect((await bad.json()).code).toBe("ENGINE_OUTPUT_INVALID");
  } finally { Object.defineProperty(astroImplementation, "bySolar", descriptor); }
  expect(generateChart(fixture.input).palaces).toHaveLength(12);
});

test("output validation rejects duplicate branches and inconsistent body palace flags", () => {
  const birth = normalizeBirthInput(fixture.input).birthInput;
  const raw = astro.bySolar("2000-8-16", 2, "女", true, "zh-CN").toJSON();
  const duplicate = structuredClone(raw);
  duplicate.palaces[1].earthlyBranch = duplicate.palaces[0].earthlyBranch;
  expect(captureFailure(() => validateEngineOutput(duplicate, birth))).toMatchObject({ code: "ENGINE_OUTPUT_INVALID" });
  const body = structuredClone(raw);
  body.palaces.forEach((palace) => { palace.isBodyPalace = false; });
  expect(captureFailure(() => validateEngineOutput(body, birth))).toMatchObject({ code: "ENGINE_OUTPUT_INVALID" });
});

test("requests cannot override process rules and concurrent calculations share one snapshot", async ({ request }) => {
  const original = await request.post("/api/chart/generate", { data: fixture.input });
  const baseline: ChartResponse = await original.json();
  for (const override of [{ config: { dayDivide: "current" } }, { language: "en-US" }, { algorithm: "zhongzhou" }, { timezone: "UTC" }, { plugins: [] }]) {
    const response = await request.post("/api/chart/generate", { data: { ...fixture.input, ...override } });
    expect(response.status()).toBe(400);
    expect((await response.json()).code).toBe("UNSUPPORTED_RULE_OVERRIDE");
  }
  const results = await Promise.all(Array.from({ length: 12 }, (_, index) => request.post("/api/chart/generate", { data: { ...fixture.input, name: `并发样例${index}`, birthTime: index % 2 ? "03:59" : "03:00" } })));
  for (const result of results) {
    expect(result.status()).toBe(200); const chart: ChartResponse = await result.json();
    expect(chart.palaces).toEqual(baseline.palaces); expect(chart.ruleHash).toBe(baseline.ruleHash); expect(chart.rules).toEqual(baseline.rules);
  }
});

test("month, year, lunar New Year and leap-month halves retain their original date", async ({ request }) => {
  for (const birthDate of ["2000-8-31", "2023-12-31", "2024-2-9", "2024-2-10"]) {
    const response = await request.post("/api/chart/generate", { data: { ...fixture.input, birthDate, birthTime: "23:59" } });
    expect(response.status()).toBe(200); const chart: ChartResponse = await response.json();
    expect(chart.birthInput.solarDate).toBe(birthDate); expect(chart.birthInput.timeIndex).toBe(12); expect(chart.rules.config.dayDivide).toBe("forward");
  }
  for (const birthDate of ["2023-2-15", "2023-2-16"]) {
    const response = await request.post("/api/chart/generate", { data: { ...fixture.input, calendar: "lunar", birthDate, isLeapMonth: true } });
    expect(response.status()).toBe(200); const chart: ChartResponse = await response.json();
    expect(chart.birthInput.originalDate).toBe(birthDate); expect(chart.rules.fixLeap).toBe(true);
  }
});

test("reports require matching rules and retain the actual engine provenance", async ({ request }) => {
  const result = await request.post("/api/chart/generate", { data: fixture.input }); const chart: ChartResponse = await result.json();
  const matched = await request.post("/api/chart/interpret", { data: { form: fixture.input, ruleHash: chart.ruleHash } });
  expect(matched.status()).toBe(200);
  expect(await matched.json()).toMatchObject({ ruleVersion: chart.ruleVersion, ruleHash: chart.ruleHash, engineVersion: chart.engineVersion });
  const stale = await request.post("/api/chart/interpret", { data: { form: fixture.input, ruleHash: "0".repeat(64) } });
  expect(stale.status()).toBe(409); expect((await stale.json()).code).toBe("RULES_CHANGED");
  const malformed = await request.post("/api/chart/interpret", { data: { form: fixture.input, ruleHash: "bad" } });
  expect(malformed.status()).toBe(400);
});

test("rules can be inspected and a stale report leads back to the retained birth draft", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("姓名或称呼").fill("标准样例");
  await page.getByLabel("排盘性别").selectOption("女");
  await page.getByLabel("公历出生日期").fill("2000-08-16");
  await page.getByLabel("出生时间", { exact: true }).fill("03:00");
  await page.getByRole("button", { name: "生成命盘", exact: true }).click();
  await expect(page.getByRole("heading", { name: "标准样例的紫微命盘" })).toBeVisible();
  const rules = page.locator("details.rule-summary"); await rules.locator("summary").click();
  await expect(rules.getByText(RULE_VERSION, { exact: true })).toBeVisible();
  await expect(rules.getByText("农历正月初一", { exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("rules-desktop.png"), fullPage: true });
  await page.route("**/api/chart/interpret", (route) => route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "排盘规则已更新", code: "RULES_CHANGED" }) }), { times: 1 });
  await page.getByRole("button", { name: "开始 AI 解读（示例）" }).click();
  await page.getByRole("button", { name: "返回录入，重新排盘" }).click();
  await expect(page.getByLabel("公历出生日期")).toHaveValue("2000-08-16");
  await expect(page.getByLabel("姓名或称呼")).toHaveValue("标准样例");
});
