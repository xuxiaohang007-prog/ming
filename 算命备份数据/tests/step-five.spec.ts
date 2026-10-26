import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { generateChart } from "../../lib/ziwei/iztro-adapter";
import { createChartId } from "../../lib/ziwei/chart-identity";
import { chartResponseSchema } from "../../lib/chart-contract";
import { reportBindingIssue, reportResponseSchema } from "../../lib/report-contract";
import { buildDemoInterpretation } from "../../lib/demo-report";
import { CHART_SCHEMA_VERSION, REPORT_SCHEMA_VERSION } from "../../lib/contract-version";
import fixture from "./fixtures/ziwei-standard.json";
import type { ChartResponse, InterpretationResponse } from "../../lib/types";

async function fillBirth(page: Page) {
  await page.getByLabel("姓名或称呼").fill("标准样例");
  await page.getByLabel("排盘性别").selectOption("女");
  await page.getByLabel("公历出生日期").fill("2000-08-16");
  await page.getByLabel("出生时间", { exact: true }).fill("03:00");
}

test("versioned DTO is serializable and all evidence points to actual palace or star records", () => {
  const chart = generateChart(fixture.input);
  expect(chart.schemaVersion).toBe(CHART_SCHEMA_VERSION);
  expect(chart.chartId).toMatch(/^zw_[a-f0-9]{64}$/);
  expect(chart.generatedAt).toMatch(/Z$/);
  expect(chartResponseSchema.safeParse(JSON.parse(JSON.stringify(chart))).success).toBe(true);
  const targets = new Set(chart.palaces.flatMap((palace) => [palace.id, ...palace.majorStars.map((star) => star.id), ...palace.minorStars.map((star) => star.id), ...palace.adjectiveStars.map((star) => star.id)]));
  expect(chart.evidence).toHaveLength(targets.size);
  for (const ref of chart.evidence) {
    expect(targets.has(ref.id)).toBe(true);
    expect(ref.id.startsWith(`${chart.chartId}:`)).toBe(true);
    expect(ref.palaceId).toBe(chart.palaces[ref.palaceIndex].id);
  }
  expect(chart.summary).toMatchObject({ scope: "natal", soul: fixture.expected.soul, body: fixture.expected.body });
  expect(chart).not.toHaveProperty("planets"); expect(chart).not.toHaveProperty("risingSign");
});

test("equivalent calendars, minute detail, input mode and display fields retain one identity", async ({ request }) => {
  const cases = [fixture.input,
    { ...fixture.input, name: "另一个称呼", birthPlace: "另一个地点", birthDate: "2000-08-16" },
    { ...fixture.input, calendar: "lunar", birthDate: "2000-7-17" },
    { ...fixture.input, birthTime: "03:59" },
    { ...fixture.input, birthTime: "", birthTimeMode: "period", birthTimePeriod: "2" }
  ];
  const charts: ChartResponse[] = [];
  for (const data of cases) {
    const response = await request.post("/api/chart/generate", { data }); expect(response.status()).toBe(200); charts.push(await response.json());
  }
  for (const chart of charts.slice(1)) {
    expect(chart.chartId).toBe(charts[0].chartId); expect(chart.palaces).toEqual(charts[0].palaces); expect(chart.evidence).toEqual(charts[0].evidence);
  }
});

test("date, time period, gender and rule version change chart identity", () => {
  const base = generateChart(fixture.input);
  for (const input of [{ ...fixture.input, birthDate: "2000-8-17" }, { ...fixture.input, birthTime: "05:00" }, { ...fixture.input, gender: "男" }]) expect(generateChart(input).chartId).not.toBe(base.chartId);
  const conditions = { solarDate: base.birthInput.solarDate, timeIndex: base.birthInput.timeIndex, gender: base.form.gender, timezone: base.birthInput.timezone, engineVersion: base.engineVersion, ruleHash: base.ruleHash };
  expect(createChartId({ ...conditions, ruleHash: "0".repeat(64) })).not.toBe(base.chartId);
  expect(createChartId({ ...conditions, engineVersion: "next-version" })).not.toBe(base.chartId);
});

test("response contract rejects incomplete metadata, wrong namespaces and invalid evidence", () => {
  const chart = generateChart(fixture.input);
  const incomplete = { ...chart, generatedAt: undefined };
  expect(chartResponseSchema.safeParse(incomplete).success).toBe(false);
  const wrong = structuredClone(chart); wrong.palaces[0].id = `${chart.chartId}:p:1`;
  expect(chartResponseSchema.safeParse(wrong).success).toBe(false);
  const duplicate = structuredClone(chart); duplicate.evidence.push(duplicate.evidence[0]);
  expect(chartResponseSchema.safeParse(duplicate).success).toBe(false);
  const badTarget = structuredClone(chart); badTarget.evidence[0].palaceIndex = 1;
  expect(chartResponseSchema.safeParse(badTarget).success).toBe(false);
  const badSummary = structuredClone(chart); badSummary.summary.soul = "不存在的命主";
  expect(chartResponseSchema.safeParse(badSummary).success).toBe(false);
});

test("report structure and references bind to the exact chart rather than only its rules", () => {
  const chart = generateChart(fixture.input); const report = buildDemoInterpretation(chart);
  expect(report.schemaVersion).toBe(REPORT_SCHEMA_VERSION);
  expect(reportResponseSchema.safeParse(report).success).toBe(true);
  expect(reportBindingIssue(report, chart)).toBeNull();
  const other = generateChart({ ...fixture.input, birthTime: "05:00" });
  expect(other.ruleHash).toBe(chart.ruleHash);
  expect(reportBindingIssue(buildDemoInterpretation(other), chart)).toBe("CHART_MISMATCH");
  const unknown = structuredClone(report); unknown.sections[0].evidenceIds = [`${chart.chartId}:p:0:s:major:999`];
  expect(reportBindingIssue(unknown, chart)).toBe("UNKNOWN_EVIDENCE");
  const duplicates = structuredClone(report); duplicates.sections[0].evidenceIds.push(duplicates.sections[0].evidenceIds[0]);
  expect(reportResponseSchema.safeParse(duplicates).success).toBe(false);
});

test("API rejects a mismatched or malformed chart ID and retains old request compatibility", async ({ request }) => {
  const chartResponse = await request.post("/api/chart/generate", { data: fixture.input }); const chart: ChartResponse = await chartResponse.json();
  const otherResponse = await request.post("/api/chart/generate", { data: { ...fixture.input, birthTime: "05:00" } }); const other: ChartResponse = await otherResponse.json();
  const wrong = await request.post("/api/chart/interpret", { data: { form: fixture.input, ruleHash: chart.ruleHash, chartId: other.chartId } });
  expect(wrong.status()).toBe(409); expect((await wrong.json()).code).toBe("CHART_MISMATCH");
  const malformed = await request.post("/api/chart/interpret", { data: { form: fixture.input, chartId: "bad" } });
  expect(malformed.status()).toBe(400); expect((await malformed.json()).code).toBe("INVALID_CHART_ID");
  const matching = await request.post("/api/chart/interpret", { data: { form: fixture.input, ruleHash: chart.ruleHash, chartId: chart.chartId } });
  expect(matching.status()).toBe(200); expect((await matching.json()).chartId).toBe(chart.chartId);
  const legacy = await request.post("/api/chart/interpret", { data: { form: fixture.input } }); expect(legacy.status()).toBe(200);
});

test("related report references locate the real star on mobile and keep the report available", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 1000 }); await page.goto("/"); await fillBirth(page);
  await page.getByRole("button", { name: "生成命盘", exact: true }).click();
  await page.getByRole("button", { name: "开始 AI 解读（示例）" }).click();
  await expect(page.getByRole("heading", { name: "标准样例的命盘阅读示例" })).toBeVisible();
  await page.locator("#report-personality").getByRole("button", { name: "查看相关盘面：命宫 · 紫微", exact: true }).click();
  await expect(page.getByRole("heading", { name: "标准样例的紫微命盘" })).toBeVisible();
  await expect(page.locator("#palace-detail .evidence-highlight")).toContainText("紫微");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("evidence-star-mobile.png"), fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "查看已有报告" }).click();
  await expect(page.getByRole("heading", { name: "标准样例的命盘阅读示例" })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("report-evidence-mobile.png"), fullPage: true, animations: "disabled" });
});

test("malformed success payload is rejected before a chart is rendered", async ({ page }) => {
  await page.goto("/"); await fillBirth(page);
  await page.route("**/api/chart/generate", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ source: "iztro", palaces: [] }) }), { times: 1 });
  await page.getByRole("button", { name: "生成命盘", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "格式不完整" })).toBeVisible();
  await expect(page.locator(".ziwei-palace")).toHaveCount(0);
  await expect(page.getByLabel("公历出生日期")).toHaveValue("2000-08-16");
});

test("a foreign report with matching rules is blocked by the client chart binding", async ({ page }) => {
  const otherChart = generateChart({ ...fixture.input, birthTime: "05:00" });
  const foreign: InterpretationResponse = buildDemoInterpretation(otherChart);
  await page.goto("/"); await fillBirth(page);
  await page.getByRole("button", { name: "生成命盘", exact: true }).click();
  await page.route("**/api/chart/interpret", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(foreign) }), { times: 1 });
  await page.getByRole("button", { name: "开始 AI 解读（示例）" }).click();
  await expect(page.getByRole("button", { name: "返回录入，重新排盘" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "标准样例的命盘阅读示例" })).not.toBeVisible();
});
