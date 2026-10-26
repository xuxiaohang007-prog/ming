import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { astro } from "iztro";
import { getHoroscopeStar } from "iztro/lib/star";
import { getMutagensByHeavenlyStem } from "iztro/lib/utils";
import { generateChart } from "../../lib/ziwei/iztro-adapter";
import { generatePeriod } from "../../lib/ziwei/period-adapter";
import { POST } from "../../app/api/chart/period/route";
import { STEMS, BRANCHES, PERIOD_MUTAGENS, periodBindingIssue, periodResponseSchema } from "../../lib/period-contract";
import { periodStarsFor } from "../../lib/period-stars";
import { FIXED_RULES } from "../../lib/ziwei/rule-contract";
import * as astroImplementation from "iztro/lib/astro/astro";
import birth from "./fixtures/ziwei-standard.json";
import fixture from "./fixtures/period-standard.json";

test.use({ storageState: { cookies: [], origins: [] } });
const chart = generateChart(birth.input);
const input = { form: birth.input, chartId: chart.chartId, ruleHash: chart.ruleHash, analysisDate: fixture.analysisDate };
const period = generatePeriod(input);
async function open(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" }); await page.goto("/");
  await page.getByLabel("姓名或称呼").fill("标准样例"); await page.getByLabel("排盘性别").selectOption("女");
  await page.getByLabel("公历出生日期").fill("2000-08-16"); await page.getByLabel("出生时间", { exact: true }).fill("03:00");
  await page.getByRole("button", { name: "生成命盘", exact: true }).click();
  await page.locator(".period-explorer > summary").click(); await page.getByLabel("公历分析日期").fill(fixture.analysisDate);
}
async function calculate(page: Page) { await page.getByRole("button", { name: "获取运限资料", exact: true }).click(); await expect(page.locator(".period-result")).toBeVisible(); }

test("period matches a saved fixed fixture including all twelve palaces and real flow stars", () => {
  expect(period.nominalAge).toBe(fixture.nominalAge); expect(period.decadal).toMatchObject(fixture.decadal); expect(period.yearly).toMatchObject(fixture.yearly);
  expect(period.yearly.palaces.map((item) => item.name)).toEqual(fixture.yearlyPalaces);
  expect(period.yearly.palaces.map((item) => item.stars.map((star) => star.name))).toEqual(fixture.yearlyStars);
  expect(period.yearly.mutagens.map((item) => item.star)).toEqual(fixture.yearlyMutagens);
  expect(period.timeline.map((item) => item.index)).toEqual(fixture.timelineIndices);
  expect(period.timeline[0].ageRange).toEqual(fixture.firstRange); expect(period.timeline[0].yearRange).toEqual(fixture.firstYearRange);
  expect(periodBindingIssue(period, chart, input.analysisDate)).toBeNull();
});
test("packaged tables match immutable verification snapshots for ten stems and twelve branches", () => {
  for (const stem of STEMS) {
    expect(Object.isFrozen(PERIOD_MUTAGENS[stem])).toBe(true); expect(getMutagensByHeavenlyStem(stem)).toEqual(PERIOD_MUTAGENS[stem]);
    for (const branch of BRANCHES) for (const scope of ["decadal", "yearly"] as const) {
      expect(getHoroscopeStar(stem, branch, scope).map((stars) => stars.map(({ name, type }) => ({ name, type })))).toEqual(periodStarsFor(stem, branch, scope));
    }
  }
});
test("lunar New Year, not January first, Li Chun or birthday, changes year and nominal age", () => {
  const before = generatePeriod({ ...input, analysisDate: "2024-02-09" }), after = generatePeriod({ ...input, analysisDate: "2024-02-10" });
  expect(before.nominalAge).toBe(24); expect(before.yearly).toMatchObject({ heavenlyStem: "癸", earthlyBranch: "卯" });
  expect(after.nominalAge).toBe(25); expect(after.yearly).toMatchObject({ heavenlyStem: "甲", earthlyBranch: "辰" });
  expect(generatePeriod({ ...input, analysisDate: "2024-01-01" }).yearly.heavenlyStem).toBe("癸");
  expect(generatePeriod({ ...input, analysisDate: "2024-08-16" }).nominalAge).toBe(25);
  expect(generatePeriod({ ...input, analysisDate: "2022-01-31" }).decadal.ageRange).toEqual([13, 22]);
  expect(generatePeriod({ ...input, analysisDate: "2022-02-01" }).decadal.ageRange).toEqual([23, 32]);
});
test("childhood is distinct from an invented ten-year period", () => {
  const first = generatePeriod({ ...input, analysisDate: "2000-08-16" });
  expect(first.nominalAge).toBe(1); expect(first.decadal).toMatchObject({ name: "童限", index: 4, ageRange: null });
  const second = generatePeriod({ ...input, analysisDate: "2001-08-16" });
  expect(second.nominalAge).toBe(2); expect(second.decadal).toMatchObject({ name: "童限", index: 0, ageRange: null });
});
test("equivalent birth calendars and all periods/genders retain the fixed calculation conditions", () => {
  const lunar = { ...birth.input, calendar: "lunar", birthDate: "2000-7-17" };
  expect(generatePeriod({ ...input, form: lunar }).yearly).toEqual(period.yearly);
  for (const gender of ["男", "女"] as const) for (let time = 0; time <= 12; time++) {
    const form = { ...birth.input, gender, birthTime: "", birthTimeMode: "period", birthTimePeriod: String(time) };
    const value = generateChart(form), request = { ...input, form, chartId: value.chartId };
    expect(periodBindingIssue(generatePeriod(request), value, input.analysisDate)).toBeNull();
  }
});
test("invalid dates, pre-birth dates, unsupported ages, extra fields and changed rules are rejected", () => {
  for (const analysisDate of ["2023-2-30", "2023-02-30", "1900-02-29", "2100-02-29", "2101-01-01", "2023-10-26T00:00:00Z"]) expect(() => generatePeriod({ ...input, analysisDate })).toThrow();
  expect(() => generatePeriod({ ...input, analysisDate: "1999-12-31" })).toThrow("不能早于");
  const old = generateChart({ ...birth.input, birthDate: "1900-01-01" });
  expect(() => generatePeriod({ form: old.form, chartId: old.chartId, ruleHash: old.ruleHash, analysisDate: "2100-12-31" })).toThrow("十二个大限");
  expect(() => generatePeriod({ ...input, horoscopeDivide: "exact" })).toThrow("固定排盘规则");
  expect(() => generatePeriod({ ...input, ruleHash: "0".repeat(64) })).toThrow("规则已更新");
  try { astro.config({ horoscopeDivide: "exact" }); expect(() => generatePeriod(input)).toThrow("ENGINE_CONFIG_CHANGED"); } finally { astro.config(FIXED_RULES.config); }
});
test("plausible IDs cannot disguise wrong palaces, timelines, transformations or flow stars", () => {
  const changedDate = structuredClone(period); changedDate.analysis.solarDate = "2024-02-10";
  expect(periodBindingIssue(changedDate, chart, input.analysisDate)).toBe("PERIOD_DATE_MISMATCH");
  const wrongScope = structuredClone(period); wrongScope.yearly.palaces[0].name = "命宫";
  expect(periodBindingIssue(wrongScope, chart, input.analysisDate)).toBe("PERIOD_PALACES_INVALID");
  const wrongRange = structuredClone(period); wrongRange.timeline[0].ageRange[1] = 13;
  expect(periodBindingIssue(wrongRange, chart, input.analysisDate)).toBe("PERIOD_TIMELINE_INVALID");
  const wrongStar = structuredClone(period); wrongStar.yearly.palaces[1].stars[0].name = "流禄";
  expect(periodResponseSchema.safeParse(wrongStar).success).toBe(true); expect(periodBindingIssue(wrongStar, chart, input.analysisDate)).toBe("PERIOD_STARS_INVALID");
  const wrongTarget = structuredClone(period); wrongTarget.yearly.mutagens[0].natalStarIds = period.yearly.mutagens[1].natalStarIds;
  expect(periodBindingIssue(wrongTarget, chart, input.analysisDate)).toBe("PERIOD_MUTAGEN_INVALID");
  const foreign = generateChart({ ...birth.input, birthTime: "05:00" }); expect(periodBindingIssue(period, foreign, input.analysisDate)).toBe("PERIOD_BINDING_MISMATCH");
});
test("calculation is host-timezone independent and does not mutate the natal chart", () => {
  const original = JSON.stringify(chart), timezone = process.env.TZ;
  try {
    for (const value of ["UTC", "America/Los_Angeles", "Asia/Shanghai"]) { process.env.TZ = value; expect(generatePeriod(input).yearly).toEqual(period.yearly); }
  } finally { if (timezone === undefined) delete process.env.TZ; else process.env.TZ = timezone; }
  expect(JSON.stringify(chart)).toBe(original);
});
test("real route needs no key or external fetch, enforces body size and returns safe no-store errors", async () => {
  const fetch = globalThis.fetch; let calls = 0; globalThis.fetch = async () => { calls++; throw new Error("No external request allowed"); };
  try {
    const response = await POST(new Request("http://localhost/api/chart/period", { method: "POST", body: JSON.stringify(input) }));
    expect(response.status).toBe(200); expect((await response.json()).yearly.index).toBe(1); expect(calls).toBe(0);
  } finally { globalThis.fetch = fetch; }
  for (const [body, status] of [["{", 400], ["x".repeat(32769), 413]] as const) {
    const response = await POST(new Request("http://localhost/api/chart/period", { method: "POST", body }));
    expect(response.status).toBe(status); expect(response.headers.get("cache-control")).toBe("no-store");
  }
});
test("HTTP period integration is bound, private, and respects existing security headers", async ({ request }) => {
  const response = await request.post("/api/chart/period", { data: input }); expect(response.status()).toBe(200);
  const value = await response.json(); expect(periodBindingIssue(value, chart, input.analysisDate)).toBeNull();
  expect(JSON.stringify(value)).not.toContain("标准样例"); expect(value.form).toBeUndefined();
  expect(response.headers()["cache-control"]).toBe("no-store"); expect(response.headers()["x-frame-options"]).toBe("DENY");
  const stale = await request.post("/api/chart/period", { data: { ...input, ruleHash: "0".repeat(64) } }); expect(stale.status()).toBe(409);
  const invalid = await request.post("/api/chart/period", { data: { ...input, analysisDate: "2023-02-30" } }); expect(invalid.status()).toBe(400); expect((await invalid.json()).code).toBe("INVALID_PERIOD_INPUT");
});
for (const width of [375, 768, 1440]) test(`period browsing at ${width}px keeps natal stars and reports separate`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 }); await open(page);
  const natal = await page.locator(".ziwei-grid").first().innerText(); await calculate(page);
  await expect(page.locator(".period-summary")).toContainText("24 岁"); await expect(page.locator(".period-palace")).toHaveCount(12);
  expect(await page.locator(".ziwei-grid").first().innerText()).toBe(natal);
  await page.locator(".period-mutagens").getByRole("button", { name: "福德宫 · 破军", exact: true }).click();
  await expect(page.locator("#palace-detail .evidence-highlight")).toContainText("破军"); await expect(page.locator("#palace-detail .evidence-highlight")).toContainText("运限资料定位");
  await page.getByRole("button", { name: "大限／童限资料", exact: true }).click(); await expect(page.locator(".period-layer-heading")).toContainText("23 至 32 岁");
  await page.locator(".period-timeline > summary").click(); await expect(page.locator(".period-timeline li")).toHaveCount(12);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => document.fonts.ready); await page.locator(".period-content").screenshot({ path: test.info().outputPath(`period-${width}.png`), animations: "disabled" });
  await page.getByLabel("公历分析日期").fill("2024-02-10"); await expect(page.locator(".period-result")).toHaveCount(0); await calculate(page);
  await expect(page.locator(".period-summary")).toContainText("25 岁");
  await page.getByRole("button", { name: "生成本地解读", exact: true }).click(); await expect(page.locator(".report-cover h2")).toHaveText("标准样例的本地规则解读");
  await expect(page.locator(".report-section")).toHaveCount(6); await expect(page.locator(".report-limitations")).toContainText("本命");
  await expect(page.locator(".period-result")).toHaveCount(0);
});
test("client rejects a forged flow star, keeps the chart and retries the actual engine", async ({ page }) => {
  await open(page); const forged = structuredClone(period); forged.yearly.palaces[1].stars[0].name = "流禄";
  await page.route("**/api/chart/period", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(forged) }), { times: 1 });
  await page.getByRole("button", { name: "获取运限资料", exact: true }).click(); await expect(page.locator(".period-error")).toContainText("不一致");
  await expect(page.locator(".period-result")).toHaveCount(0); await expect(page.locator(".ziwei-palace")).toHaveCount(12); await calculate(page);
});
test("date changes and cancellation prevent late old results from replacing newer data", async ({ page }) => {
  await open(page); let release = () => {}; const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/chart/period", async (route) => { await gate; await route.fulfill({ contentType: "application/json", body: JSON.stringify(period) }).catch(() => {}); }, { times: 1 });
  try {
    await page.getByRole("button", { name: "获取运限资料", exact: true }).click(); await expect(page.getByRole("button", { name: "取消获取运限", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "取消获取运限", exact: true }).click(); await expect(page.locator(".period-status")).toContainText("已取消");
    await page.getByLabel("公历分析日期").fill("2024-02-10"); await calculate(page); release();
    await expect(page.locator(".period-summary")).toContainText("2024-02-10"); await expect(page.locator(".period-summary")).not.toContainText("24 岁");
  } finally { release(); }
});
test("invalid local dates do not send requests and childhood is clearly labeled on screen", async ({ page }) => {
  await open(page); const requests: string[] = []; page.on("request", (request) => { if (request.url().endsWith("/api/chart/period")) requests.push(request.url()); });
  await page.getByLabel("公历分析日期").fill("1999-12-31"); await page.getByRole("button", { name: "获取运限资料", exact: true }).click();
  await expect(page.locator(".period-error")).toContainText("不能早于"); expect(requests).toHaveLength(0);
  await page.getByLabel("公历分析日期").fill("2000-08-16"); await calculate(page); await page.getByRole("button", { name: "大限／童限资料", exact: true }).click();
  await expect(page.locator(".period-layer-heading")).toContainText("童限"); await expect(page.locator(".period-layer-heading")).toContainText("尚未起大限");
});

test("changing a date during a pending request invalidates that request, not just its display", async ({ page }) => {
  await open(page); let release = () => {}; const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/chart/period", async (route) => { await gate; await route.fulfill({ contentType: "application/json", body: JSON.stringify(period) }).catch(() => {}); }, { times: 1 });
  try {
    await page.getByRole("button", { name: "获取运限资料", exact: true }).click(); await expect(page.getByRole("button", { name: "取消获取运限", exact: true })).toBeVisible();
    await page.getByLabel("公历分析日期").fill("2024-02-10"); await expect(page.getByRole("button", { name: "取消获取运限", exact: true })).toHaveCount(0);
    await calculate(page); release(); await expect(page.locator(".period-summary")).toContainText("2024-02-10");
  } finally { release(); }
});
test("a stalled period request times out without losing the natal chart", async ({ page }) => {
  await page.clock.install(); await open(page);
  await page.evaluate(() => {
    const original = window.fetch.bind(window);
    window.fetch = (input, init) => String(input).includes("/api/chart/period") ? new Promise((_, reject) => init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true })) : original(input, init);
  });
  await page.getByRole("button", { name: "获取运限资料", exact: true }).click(); await page.clock.fastForward(16000);
  await expect(page.locator(".period-error")).toContainText("超时"); await expect(page.locator(".period-result")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "获取运限资料", exact: true })).toBeEnabled(); await expect(page.locator(".ziwei-palace")).toHaveCount(12);
});
test("opening a natal report aborts an in-flight period request and ignores its late result", async ({ page }) => {
  await open(page); const failed: string[] = []; page.on("requestfailed", (request) => { if (request.url().endsWith("/api/chart/period")) failed.push(request.failure()!.errorText); });
  let release = () => {}; const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/chart/period", async (route) => { await gate; await route.fulfill({ contentType: "application/json", body: JSON.stringify(period) }).catch(() => {}); });
  try {
    await page.getByRole("button", { name: "获取运限资料", exact: true }).click();
    await expect(page.getByRole("button", { name: "取消获取运限", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "生成本地解读", exact: true }).click();
    await expect(page.locator(".report-cover h2")).toBeVisible(); await expect.poll(() => failed.length).toBe(1); release();
    await expect(page.locator(".report-section")).toHaveCount(6); await expect(page.locator(".period-result")).toHaveCount(0);
    await expect(page.locator(".report-limitations")).toContainText("未纳入大限、流年");
  } finally { release(); }
});
test("vendor period exceptions are sanitized and never replaced with sample data", async () => {
  const original = astroImplementation.bySolar;
  Reflect.set(astroImplementation, "bySolar", (...args: Parameters<typeof original>) => {
    const value = original(...args); value.horoscope = () => { throw new Error("PRIVATE_BIRTH_RECORD_AND_VENDOR_STACK"); }; return value;
  });
  try {
    const response = await POST(new Request("http://localhost/api/chart/period", { method: "POST", body: JSON.stringify(input) }));
    expect(response.status).toBe(500); const value = await response.json(); expect(value.code).toBe("ENGINE_COMPUTATION_FAILED");
    expect(JSON.stringify(value)).not.toContain("PRIVATE_BIRTH"); expect(value.yearly).toBeUndefined();
  } finally { Reflect.set(astroImplementation, "bySolar", original); }
});
