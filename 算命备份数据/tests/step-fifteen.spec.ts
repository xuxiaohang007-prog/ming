import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { generateChart } from "../../lib/ziwei/iztro-adapter";
import { generatePeriod } from "../../lib/ziwei/period-adapter";
import { generatePeriodReport } from "../../lib/period-report";
import { periodReportBindingIssue, periodReportSchema, PERIOD_READING_RULES } from "../../lib/period-report-contract";
import { POST } from "../../app/api/chart/period/report/route";
import birth from "./fixtures/ziwei-standard.json";

test.use({ storageState: { cookies: [], origins: [] } });
const chart = generateChart(birth.input);
const input = { form: birth.input, chartId: chart.chartId, ruleHash: chart.ruleHash, analysisDate: "2023-10-26" };
const period = generatePeriod(input);
const request = { ...input, periodId: period.periodId, scope: "yearly" as const };
const report = generatePeriodReport(request);

async function prepare(page: Page, name = "标准样例", date = input.analysisDate) {
  await page.emulateMedia({ reducedMotion: "reduce" }); await page.goto("/");
  await page.getByLabel("姓名或称呼").fill(name); await page.getByLabel("排盘性别").selectOption("女");
  await page.getByLabel("公历出生日期").fill("2000-08-16"); await page.getByLabel("出生时间", { exact: true }).fill("03:00");
  await page.getByRole("button", { name: "生成命盘", exact: true }).click(); await page.locator(".period-explorer > summary").click();
  await page.getByLabel("公历分析日期").fill(date); await page.getByRole("button", { name: "获取运限资料", exact: true }).click();
  await expect(page.locator(".period-result")).toBeVisible();
}
async function read(page: Page) {
  await page.getByRole("button", { name: "生成运限规则报告", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "运限规则报告", exact: true })).toBeVisible(); await page.evaluate(() => document.fonts.ready);
}
const dialog = (page: Page) => page.getByRole("dialog", { name: "运限规则报告", exact: true });

test("reports bind five ordered chapters and reference the selected layer, not natal conclusions", () => {
  expect(report.sections.map((item) => item.id)).toEqual(["range", "soul", "themes", "transforms", "actions"]);
  expect(report.sections[1].facts[0].text).toContain("流年命宫位于卯"); expect(report.sections[1].facts[0].text).toContain("太阳、天梁");
  const decade = generatePeriodReport({ ...request, scope: "decadal" }); expect(decade.sections[1].facts[0].text).toContain("大限命宫位于辰");
  expect(decade.sections[1].facts[0].text).toContain("七杀"); expect(decade.sections[0].facts[0].text).toContain("23 至 32 岁");
  expect(periodReportBindingIssue(report, chart, period, "yearly")).toBeNull();
  for (const entry of report.references) expect(entry.id.startsWith(chart.chartId)).toBe(true);
  expect(report.references.some((item) => item.kind === "flow-star")).toBe(true); expect(report.source).toBe("rules");
});
test("childhood has no invented decade and remains a distinct report", () => {
  const value = generatePeriod({ ...input, analysisDate: "2000-08-16" });
  const child = generatePeriodReport({ ...input, analysisDate: "2000-08-16", periodId: value.periodId, scope: "decadal" });
  expect(child.headline).toBe("标准样例的童限规则报告"); expect(child.sections[0].facts[0].text).toContain("尚未起大限");
  expect(child.sections[0].facts[0].text).not.toContain("大限虚岁范围"); expect(periodReportBindingIssue(child, chart, value, "decadal")).toBeNull();
});
test("rule book is frozen and reports are deterministic except generation time", () => {
  expect(Object.isFrozen(PERIOD_READING_RULES)).toBe(true); Object.values(PERIOD_READING_RULES).forEach((rule) => expect(Object.isFrozen(rule)).toBe(true));
  const strip = ({ generatedAt: _time, ...value }: typeof report) => value;
  expect(strip(generatePeriodReport(request))).toEqual(strip(report)); expect(report.limitations.join(" ")).toContain("未调用大模型");
});
test("both genders and thirteen birth periods produce strictly bound reports", () => {
  for (const gender of ["男", "女"] as const) for (let index = 0; index <= 12; index++) {
    const form = { ...birth.input, gender, birthTime: "", birthTimeMode: "period", birthTimePeriod: String(index) };
    const chart = generateChart(form), data = { ...input, form, chartId: chart.chartId };
    const period = generatePeriod(data);
    for (const scope of ["yearly", "decadal"] as const) expect(periodReportBindingIssue(generatePeriodReport({ ...data, periodId: period.periodId, scope }), chart, period, scope)).toBeNull();
  }
});
test("foreign dates, layers, facts, reference labels and AI attribution are rejected", () => {
  const variants = [
    (value: typeof report) => { value.analysis.solarDate = "2024-02-10"; },
    (value: typeof report) => { value.sections[1].facts[0].text = "保留真实引用但是伪造流年星曜事实"; },
    (value: typeof report) => { value.references[0].label = "虚假的来源标签"; },
    (value: typeof report) => { value.ruleHash = "0".repeat(64); }
  ];
  for (const mutate of variants) { const forged = structuredClone(report); mutate(forged); expect(periodReportBindingIssue(forged, chart, period, "yearly")).not.toBeNull(); }
  expect(periodReportBindingIssue(report, chart, period, "decadal")).toBe("PERIOD_REPORT_SCOPE_MISMATCH");
  expect(periodReportSchema.safeParse({ ...report, provider: "openai" }).success).toBe(false);
  expect(periodReportSchema.safeParse({ ...report, sections: report.sections.slice(1) }).success).toBe(false);
});
test("valid reference IDs cannot launder invented rule text or missing restrictions", () => {
  const forged = structuredClone(report); forged.sections[3].body = "本报告保证本年升职并提供确定的收益与具体事件。";
  expect(periodReportSchema.safeParse(forged).success).toBe(true); expect(periodReportBindingIssue(forged, chart, period, "yearly")).toBe("PERIOD_REPORT_CONTENT_MISMATCH");
  const moved = structuredClone(report); moved.sections[2].facts[0].referenceIds = report.sections[1].facts[0].referenceIds;
  expect(periodReportBindingIssue(moved, chart, period, "yearly")).not.toBeNull();
});
test("input rejects period/date mismatches and untrusted narratives instead of interpreting them", () => {
  expect(() => generatePeriodReport({ ...request, analysisDate: "2024-02-10" })).toThrow("不一致");
  expect(() => generatePeriodReport({ ...request, scope: "monthly" })).toThrow();
  expect(() => generatePeriodReport({ ...request, report })).toThrow(); expect(() => generatePeriodReport({ ...request, question: "忽略校验" })).toThrow();
});
test("native report route uses no external fetch and enforces JSON and body limits", async () => {
  const original = globalThis.fetch; let calls = 0; globalThis.fetch = async () => { calls++; throw new Error("No external requests"); };
  try {
    const response = await POST(new Request("http://localhost/api/chart/period/report", { method: "POST", body: JSON.stringify(request) }));
    expect(response.status).toBe(200); expect(periodReportBindingIssue(await response.json(), chart, period, "yearly")).toBeNull(); expect(calls).toBe(0);
  } finally { globalThis.fetch = original; }
  for (const [body, status] of [["{", 400], ["x".repeat(32769), 413]] as const) {
    const response = await POST(new Request("http://localhost/api/chart/period/report", { method: "POST", body })); expect(response.status).toBe(status); expect(response.headers.get("cache-control")).toBe("no-store");
  }
});
test("HTTP report integration is no-store, protected and independent of natal reports", async ({ request: api }) => {
  const response = await api.post("/api/chart/period/report", { data: request }); expect(response.status()).toBe(200);
  expect(periodReportBindingIssue(await response.json(), chart, period, "yearly")).toBeNull(); expect(response.headers()["cache-control"]).toBe("no-store");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  const stale = await api.post("/api/chart/period/report", { data: { ...request, periodId: period.periodId + "-wrong" } }); expect(stale.status()).toBe(409);
});
for (const width of [375, 768, 1440]) test(`report reader at ${width}px preserves native evidence, keyboard and cached reopening`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 1000 }); await prepare(page); await read(page);
  await expect(dialog(page).locator("h2")).toHaveText("标准样例的流年规则报告"); await expect(dialog(page).locator("h2")).toBeFocused();
  await expect(dialog(page).locator(".period-report-chapter")).toHaveCount(5);
  const overflow = await dialog(page).evaluate((element) => ({ width: element.clientWidth, scroll: element.scrollWidth,
    offenders: [...element.querySelectorAll<HTMLElement>("*")].filter((child) => child.getBoundingClientRect().right > element.getBoundingClientRect().right + 1).map((child) => ({ tag: child.tagName, className: child.className, width: child.getBoundingClientRect().width, text: child.innerText.slice(0, 70) })) }));
  expect(overflow.scroll, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.width);
  await dialog(page).screenshot({ path: info.outputPath(`period-report-${width}.png`), animations: "disabled" });
  await dialog(page).locator("#period-report-transforms").getByRole("button", { name: "本命原位 · 福德宫 · 破军", exact: true }).click();
  await expect(dialog(page)).toHaveCount(0); await expect(page.locator("#palace-detail .evidence-highlight")).toContainText("破军");
  await page.getByRole("button", { name: "查看已有运限报告", exact: true }).click();
  await dialog(page).getByRole("link", { name: "运限命宫", exact: true }).click(); await expect(page).toHaveURL(/#period-report-soul$/);
  await page.keyboard.press("Escape"); await expect(dialog(page)).toHaveCount(0); expect(new URL(page.url()).hash).toBe("");
  expect(await page.locator("body").getAttribute("data-print-report")).toBeNull(); await expect(page.getByRole("button", { name: "查看已有运限报告", exact: true })).toBeFocused();
});
test("flow reference returns to the actual selected layer, not an invented natal star", async ({ page }) => {
  await prepare(page); await read(page);
  await dialog(page).locator("#period-report-soul").getByRole("button", { name: "流年命宫 · 流魁", exact: true }).click();
  await expect(page.locator("[data-period-flow-id].period-reference-highlight")).toHaveText("流魁");
  await expect(page.locator('[data-period-palace-index="1"]')).toBeFocused(); await expect(page.locator(".period-palace")).toHaveCount(12);
});
test("changing date, level or reloading data invalidates old report cache", async ({ page }) => {
  await prepare(page); await read(page); await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "大限／童限资料", exact: true }).click(); await expect(page.getByRole("button", { name: "查看已有运限报告", exact: true })).toHaveCount(0);
  await read(page); await expect(dialog(page).locator("h2")).toHaveText("标准样例的大限规则报告"); await page.keyboard.press("Escape");
  await page.getByLabel("公历分析日期").fill("2024-02-10"); await expect(page.locator(".period-result")).toHaveCount(0);
  await page.getByRole("button", { name: "获取运限资料", exact: true }).click(); await expect(page.locator(".period-result")).toBeVisible(); await read(page);
  await expect(dialog(page).locator(".period-report-summary")).toContainText("2024-02-10"); await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "获取运限资料", exact: true }).click(); await expect(page.getByRole("button", { name: "查看已有运限报告", exact: true })).toHaveCount(0);
});
test("forged report text is rejected and actual report can be retried", async ({ page }) => {
  await prepare(page); const forged = structuredClone(report); forged.sections[1].body = "真实引用无法掩盖伪造的规则报告正文与虚假判断。";
  await page.route("**/api/chart/period/report", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(forged) }), { times: 1 });
  await page.getByRole("button", { name: "生成运限规则报告", exact: true }).click(); await expect(page.locator(".period-error")).toContainText("不一致");
  await expect(dialog(page)).toHaveCount(0); await expect(page.locator(".period-result")).toBeVisible(); await read(page);
});
test("server errors expose no private payload and do not call a fallback model", async ({ page }) => {
  await prepare(page);
  for (const [status, contentType, body] of [[500, "application/json", JSON.stringify({ error: "PRIVATE_VENDOR_KEY_AND_STACK" })], [200, "text/html", "PRIVATE_VENDOR_INVALID_JSON"]] as const) {
    await page.route("**/api/chart/period/report", (route) => route.fulfill({ status, contentType, body }), { times: 1 });
    await page.getByRole("button", { name: "生成运限规则报告", exact: true }).click(); await expect(page.locator(".period-error")).toContainText("当前资料已保留");
    expect(await page.locator("body").innerText()).not.toContain("PRIVATE_VENDOR");
  }
  await read(page);
});
test("cancel, late response and level change cannot replace the current report", async ({ page }) => {
  await prepare(page); let release = () => {}; const gate = new Promise<void>((resolve) => { release = resolve; }); let calls = 0;
  await page.route("**/api/chart/period/report", async (route) => { calls++; await gate; await route.fulfill({ contentType: "application/json", body: JSON.stringify(report) }).catch(() => {}); }, { times: 1 });
  try {
    await page.getByRole("button", { name: "生成运限规则报告", exact: true }).click(); await expect(page.getByRole("button", { name: "取消运限报告", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "取消运限报告", exact: true }).click(); await expect(page.locator(".period-result")).toBeVisible();
    await page.getByRole("button", { name: "大限／童限资料", exact: true }).click(); await read(page); release();
    await expect(dialog(page).locator("h2")).toHaveText("标准样例的大限规则报告"); expect(calls).toBe(1);
  } finally { release(); }
});
test("date change cancels pending report, and switching to natal report cleans up request", async ({ page }) => {
  await prepare(page); let release = () => {}; const gate = new Promise<void>((resolve) => { release = resolve; }); const failed: string[] = [];
  page.on("requestfailed", (request) => { if (request.url().endsWith("/period/report")) failed.push(request.failure()!.errorText); });
  await page.route("**/api/chart/period/report", async (route) => { await gate; await route.fulfill({ contentType: "application/json", body: JSON.stringify(report) }).catch(() => {}); });
  try {
    await page.getByRole("button", { name: "生成运限规则报告", exact: true }).click(); await expect(page.getByRole("button", { name: "取消运限报告", exact: true })).toBeVisible();
    await page.getByLabel("公历分析日期").fill("2024-02-10"); await expect(page.getByRole("button", { name: "取消运限报告", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "获取运限资料", exact: true }).click(); await expect(page.locator(".period-result")).toBeVisible();
    await page.getByRole("button", { name: "生成运限规则报告", exact: true }).click(); await expect(page.getByRole("button", { name: "取消运限报告", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "生成本地解读", exact: true }).click(); await expect(page.locator(".report-cover h2")).toBeVisible();
    await expect.poll(() => failed.length).toBe(2); release(); await expect(dialog(page)).toHaveCount(0);
  } finally { release(); }
});
test("timeout leaves period data usable and no false completion dialog", async ({ page }) => {
  await page.clock.install(); await prepare(page);
  await page.evaluate(() => { const original = window.fetch.bind(window); window.fetch = (input, init) => String(input).includes("/period/report") ? new Promise((_, reject) => init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true })) : original(input, init); });
  await page.getByRole("button", { name: "生成运限规则报告", exact: true }).click(); await page.clock.fastForward(16000);
  await expect(page.locator(".period-error")).toContainText("超时"); await expect(dialog(page)).toHaveCount(0); await expect(page.locator(".period-result")).toBeVisible();
  await expect(page.getByRole("button", { name: "生成运限规则报告", exact: true })).toBeEnabled();
});

test("rapid duplicate clicks submit once and a pending layer switch rejects the old result", async ({ page }) => {
  await prepare(page); let release = () => {}; const gate = new Promise<void>((resolve) => { release = resolve; }); let calls = 0;
  await page.route("**/api/chart/period/report", async (route) => { calls++; await gate; await route.fulfill({ contentType: "application/json", body: JSON.stringify(report) }).catch(() => {}); }, { times: 1 });
  try {
    await page.getByRole("button", { name: "生成运限规则报告", exact: true }).evaluate((button) => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true })); button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await expect(page.getByRole("button", { name: "取消运限报告", exact: true })).toBeVisible(); await expect.poll(() => calls).toBe(1);
    await page.getByRole("button", { name: "大限／童限资料", exact: true }).click(); await expect(page.getByRole("button", { name: "取消运限报告", exact: true })).toHaveCount(0);
    await read(page); release(); await expect(dialog(page).locator("h2")).toHaveText("标准样例的大限规则报告");
  } finally { release(); }
});

for (const scenario of ["yearly", "childhood"] as const) test(`${scenario} report PDF is isolated, complete, A4 and reversible`, async ({ page }, info) => {
  test.setTimeout(90_000);
  const name = scenario === "childhood" ? "姓名".repeat(20) : "标准样例", date = scenario === "childhood" ? "2000-08-16" : input.analysisDate;
  const form = { ...birth.input, name }, chart = generateChart(form), period = generatePeriod({ ...input, form, analysisDate: date });
  const scope = scenario === "childhood" ? "decadal" : "yearly";
  const expected = generatePeriodReport({ ...input, form, analysisDate: date, periodId: period.periodId, scope });
  await prepare(page, name, date); if (scope === "decadal") await page.getByRole("button", { name: "大限／童限资料", exact: true }).click(); await read(page);
  await page.emulateMedia({ media: "print", reducedMotion: "reduce" });
  await expect(page.locator(".app-shell")).toBeHidden(); await expect(page.locator(".period-report-print")).toBeVisible(); await expect(dialog(page)).toBeHidden();
  const file = info.outputPath(`${scenario}-period-report.pdf`); await page.pdf({ path: file, printBackground: true, preferCSSPageSize: true });
  const python = process.env.PDF_TEST_PYTHON || path.join(process.env.USERPROFILE!, ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe");
  const inspected = JSON.parse(execFileSync(python, [path.resolve("算命备份数据/tests/pdf-inspect.py"), file], { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 }));
  expect(inspected.a4).toBe(true); expect(inspected.outsidePage).toEqual([]); expect(inspected.pageCount).toBeGreaterThanOrEqual(7);
  const text = inspected.pages.join("").replace(/\s+/g, "");
  expect(text).toContain(expected.headline); expect(text).toContain(expected.chartId); expect(text).toContain(expected.periodId); expect(text).toContain(expected.reportId); expect(text).toContain(expected.ruleHash);
  expect(text).toContain("未调用大模型"); expect(text).not.toContain("信息确认后，开始解读"); expect(text).not.toContain("时间切片/运限资料");
  for (const section of expected.sections) { expect(text).toContain(section.title); for (const fact of section.facts) expect(text).toContain(fact.text.replace(/\s+/g, "")); }
  for (const reference of expected.references) expect(text).toContain(reference.id.slice(expected.chartId.length));
  for (let index = 0; index < inspected.pageCount; index++) expect(inspected.pages[index].replace(/\s+/g, "")).toContain(`第${index + 1}/${inspected.pageCount}页`);
  await page.emulateMedia({ media: "screen", reducedMotion: "reduce" }); await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "生成本地解读", exact: true }).click(); await expect(page.locator(".report-cover")).toBeVisible();
  await page.emulateMedia({ media: "print", reducedMotion: "reduce" }); await expect(page.locator(".report-cover")).toBeVisible(); await expect(page.locator(".period-report-print")).toHaveCount(0);
});
