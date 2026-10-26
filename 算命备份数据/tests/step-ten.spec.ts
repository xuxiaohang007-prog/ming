import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { generateChart } from "../../lib/ziwei/iztro-adapter";
import { buildRulesInterpretation } from "../../lib/rules-report";
import { buildDemoInterpretation } from "../../lib/demo-report";
import { reportOverviewSections, reportSourceLabel } from "../../lib/report-presentation";
import { reportBindingIssue } from "../../lib/report-contract";
import fixture from "./fixtures/ziwei-standard.json";

test.use({ storageState: { cookies: [], origins: [] }, timezoneId: "America/Los_Angeles" });
const chart = generateChart(fixture.input);
const report = buildRulesInterpretation(chart);
const python = process.env.PDF_TEST_PYTHON || path.join(process.env.USERPROFILE!, ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe");
type PdfInspection = { pages: string[]; pageCount: number; outsidePage: unknown[]; a4: boolean };

async function generate(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/"); await page.getByLabel("姓名或称呼").fill("标准样例");
  await page.getByLabel("排盘性别").selectOption("女"); await page.getByLabel("公历出生日期").fill("2000-08-16");
  await page.getByLabel("出生时间", { exact: true }).fill("03:00"); await page.getByRole("button", { name: "生成命盘", exact: true }).click();
  await expect(page.getByRole("button", { name: "生成本地解读", exact: true })).toBeVisible();
}
async function read(page: Page) {
  await page.getByRole("button", { name: "生成本地解读", exact: true }).click();
  await expect(page.locator(".report-cover h2")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}
async function inspectPdf(page: Page, name: string): Promise<PdfInspection> {
  await page.emulateMedia({ media: "print", reducedMotion: "reduce" });
  const file = test.info().outputPath(name);
  await page.pdf({ path: file, preferCSSPageSize: true, printBackground: true });
  const result: PdfInspection = JSON.parse(execFileSync(python, [path.resolve("算命备份数据/tests/pdf-inspect.py"), file], { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 }));
  expect(result.a4).toBe(true); expect(result.outsidePage).toEqual([]);
  for (const [index, content] of result.pages.entries()) {
    const plain = content.replace(/\s+/g, "");
    expect(plain).toContain(`第${index + 1}/${result.pageCount}页`);
    expect(plain).toContain("紫微命盘/阅读档案");
    expect(plain.length).toBeGreaterThan(40);
  }
  return result;
}

test("overview is derived from actual chapter summaries without invented scores", () => {
  for (const focus of ["balanced", "career", "resources", "relationships"] as const) {
    const value = buildRulesInterpretation(chart, { focus, question: "" });
    const selected = reportOverviewSections(value);
    expect(selected.map((item) => item.id)).toEqual(["personality", focus === "balanced" ? "career" : focus, "actions"]);
    selected.forEach((item) => expect(value.sections).toContain(item));
  }
  expect([reportSourceLabel("rules"), reportSourceLabel("demo"), reportSourceLabel("ai")]).toEqual(["本地规则参考", "流程示例", "AI 解释"]);
});

test("cover time stays UTC+8, cards match report, and print privacy is explicit", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await generate(page);
  const dated = { ...report, generatedAt: "2026-10-10T18:30:00.000Z" };
  await page.route("**/api/chart/interpret", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(dated) }));
  await read(page);
  await expect(page.locator(".report-cover time")).toHaveAttribute("datetime", dated.generatedAt);
  await expect(page.locator(".report-cover time")).toHaveText("2026/10/11 02:30:00（UTC+8）");
  const cards = page.locator(".report-overview-card"); await expect(cards).toHaveCount(3);
  for (const [index, section] of reportOverviewSections(dated).entries()) {
    await expect(cards.nth(index)).toContainText(section.summary);
    await expect(cards.nth(index)).toContainText(`${section.evidenceIds.length} 项盘面依据`);
    await expect(cards.nth(index)).toContainText("本地规则参考");
  }
  await expect(page.locator(".report-print-warning")).toContainText("出生档案");
  await page.locator(".report-cover").screenshot({ path: test.info().outputPath("report-cover-desktop.png"), animations: "disabled" });
  await page.locator(".report-overview").screenshot({ path: test.info().outputPath("report-overview-desktop.png"), animations: "disabled" });
});

test("desktop contents track clicked and scrolled chapters", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await generate(page); await read(page);
  const nav = page.getByRole("navigation", { name: "报告章节" });
  const link = nav.getByRole("link", { name: "财富与资源", exact: true }); await link.click();
  await expect(page).toHaveURL(/#report-resources$/); await expect(link).toHaveAttribute("aria-current", "location");
  await expect(page.locator("#report-resources")).toBeFocused();
  await page.locator("#report-relationships").evaluate((element) => element.scrollIntoView());
  await expect(nav.getByRole("link", { name: "关系与相处", exact: true })).toHaveAttribute("aria-current", "location");
});

test("mobile sticky contents do not hide headings or overflow the page", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 1000 }); await generate(page); await read(page);
  const nav = page.getByRole("navigation", { name: "报告章节" });
  await nav.getByRole("link", { name: "行动建议", exact: true }).click();
  await expect(page).toHaveURL(/#report-actions$/);
  const navBox = await nav.boundingBox(), headingBox = await page.locator("#report-actions h3").boundingBox();
  expect(headingBox!.y).toBeGreaterThanOrEqual(navBox!.y + navBox!.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("report-contents-mobile.png"), animations: "disabled" });
});

test("birth changes clear chapter hash and explicitly invalidate the old report", async ({ page }) => {
  await generate(page); await read(page);
  await page.getByRole("navigation", { name: "报告章节" }).getByRole("link", { name: "性格与优势", exact: true }).click();
  await page.getByRole("button", { name: "修改信息", exact: true }).click();
  await expect(page.getByLabel("姓名或称呼")).toHaveValue("标准样例");
  await expect(page.locator(".notice")).toContainText("原命盘与报告已失效");
  await expect(page.locator(".report-section")).toHaveCount(0); expect(new URL(page.url()).hash).toBe("");
});

test("standard report PDF contains all six chapters, rule proofs and full provenance", async ({ page }) => {
  test.setTimeout(90_000); await generate(page); await read(page);
  const result = await inspectPdf(page, "standard-report.pdf");
  expect(result.pageCount).toBeGreaterThanOrEqual(8);
  const plain = result.pages.join("").replace(/\s+/g, "");
  expect(plain).toContain(chart.chartId); expect(plain).toContain(chart.ruleHash);
  expect(plain).toContain("本节规则依据"); expect(plain).toContain("未调用大模型");
  for (const section of report.sections) expect(plain).toContain(section.title);
  expect(plain).not.toContain("打印／另存PDF"); expect(plain).not.toContain("查看规则依据：");
});

test("long demo PDF preserves every paragraph and long title across multiple pages", async ({ page }) => {
  test.setTimeout(90_000); await generate(page); await page.getByRole("radio", { name: "示例模式", exact: true }).check();
  const value = buildDemoInterpretation(chart);
  value.headline = "标准样例的长标题排版验收：" + "阅读档案与实际命盘依据".repeat(7);
  const markers: string[] = [];
  value.sections.forEach((section, index) => {
    section.body = Array.from({ length: 24 }, (_, paragraph) => {
      const marker = `PRINT-S${index}-P${String(paragraph).padStart(2, "0")}`; markers.push(marker);
      return `${marker} 本段仅用于长报告分页验收，不构成个性化命理判断。核对出生条件、盘面事实与引用来源，保持标题和正文的阅读顺序，完整保存本段内容。`;
    }).join("\n\n");
  });
  expect(reportBindingIssue(value, chart)).toBeNull();
  await page.route("**/api/chart/interpret", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(value) }));
  await page.getByRole("button", { name: "开始 AI 解读（示例）", exact: true }).click(); await expect(page.locator(".report-cover h2")).toHaveText(value.headline);
  await page.evaluate(() => document.fonts.ready);
  const result = await inspectPdf(page, "long-report.pdf"); expect(result.pageCount).toBeGreaterThan(10);
  const plain = result.pages.join("").replace(/\s+/g, "");
  markers.forEach((marker) => expect(plain).toContain(marker)); expect(plain).toContain(value.headline);
  expect(plain).toContain(chart.chartId); expect(plain).toContain("流程示例");
});
