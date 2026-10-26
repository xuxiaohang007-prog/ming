import { expect, test } from "@playwright/test";
import { chartResponseSchema } from "../../lib/chart-contract";
import { reportResponseSchema, reportBindingIssue } from "../../lib/report-contract";
import fixture from "./fixtures/ziwei-standard.json";

test.use({ storageState: { cookies: [], origins: [] } });
for (const width of [375, 768, 1440]) {
  test(`integrated local workflow at ${width}px preserves evidence, invalidates and rebuilds`, async ({ page }, info) => {
    const errors: string[] = [], external: string[] = [];
    const origin = new URL(info.project.use.baseURL!).origin;
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      external.push(route.request().url()); return route.abort();
    });
    await page.setViewportSize({ width, height: 1000 }); await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/"); await page.getByLabel("姓名或称呼").fill("联调样例");
    await page.getByLabel("排盘性别").selectOption("女"); await page.getByLabel("公历出生日期").fill("2000-08-16");
    await page.getByLabel("出生时间", { exact: true }).fill("03:00"); await page.getByRole("button", { name: "生成命盘", exact: true }).click();
    await expect(page.locator(".ziwei-palace")).toHaveCount(12);
    await page.getByLabel("阅读侧重点").selectOption("resources");
    await page.getByLabel("自填问题（选填）", { exact: true }).fill("联调隐私主题，仅保留，不作语义解答");
    await page.getByRole("button", { name: "生成本地解读", exact: true }).click();
    await expect(page.locator(".report-cover h2")).toHaveText("联调样例的本地规则解读");
    await expect(page.locator(".report-section")).toHaveCount(6);
    await expect(page.locator(".report-overview-card").nth(1).getByRole("heading")).toHaveText("财富与资源");
    await page.locator("#report-personality").getByRole("button", { name: "查看相关盘面：命宫 · 紫微", exact: true }).click();
    await expect(page.locator("#palace-detail .evidence-highlight")).toContainText("紫微");
    await page.getByRole("button", { name: "查看已有报告", exact: true }).click();
    await expect(page.locator(".report-cover h2")).toHaveText("联调样例的本地规则解读");
    await page.getByRole("navigation", { name: "报告章节" }).getByRole("link", { name: "行动建议", exact: true }).click();
    await expect(page.locator("#report-actions")).toBeFocused();
    await page.emulateMedia({ media: "print", reducedMotion: "reduce" });
    await expect(page.locator(".report-print-provenance")).toBeVisible(); await expect(page.locator(".report-reading")).toBeHidden();
    expect(await page.locator("body").innerText()).not.toContain("联调隐私主题");
    await page.emulateMedia({ media: "screen", reducedMotion: "reduce" });
    await page.getByRole("button", { name: "新建命盘", exact: true }).click();
    await expect(page.getByLabel("姓名或称呼")).toHaveValue(""); expect(new URL(page.url()).hash).toBe("");
    await expect(page.locator(".report-section")).toHaveCount(0);
    await page.getByLabel("排盘性别").selectOption("男"); await page.getByLabel("公历出生日期").fill("1995-05-20");
    await page.getByLabel("出生时间", { exact: true }).fill("23:00"); await page.getByRole("button", { name: "生成命盘", exact: true }).click();
    await page.getByRole("button", { name: "生成本地解读", exact: true }).click();
    await expect(page.locator(".report-cover h2")).toHaveText("命主的本地规则解读");
    await expect(page.locator(".report-cover-meta")).toContainText("综合阅读");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(external).toEqual([]); expect(errors).toEqual([]);
    await page.evaluate(() => document.fonts.ready);
    await page.locator(".report-cover").screenshot({ path: info.outputPath(`integrated-report-${width}.png`), animations: "disabled" });
  });
}

test("HTTP integration verifies official fixture, report binding, no-store and invalid inputs", async ({ request }) => {
  const generated = await request.post("/api/chart/generate", { data: fixture.input });
  expect(generated.status()).toBe(200); expect(generated.headers()["cache-control"]).toBe("no-store");
  const chart = chartResponseSchema.parse(await generated.json());
  expect(chart).toMatchObject(fixture.expected);
  for (const expected of fixture.palaces) {
    const palace = chart.palaces.find((item) => item.earthlyBranch === expected.branch)!;
    expect(palace.majorStars.filter((star) => star.type === "major").map((star) => star.name)).toEqual(expected.mainStars);
  }
  const interpreted = await request.post("/api/chart/interpret", { data: { form: chart.form, chartId: chart.chartId, ruleHash: chart.ruleHash, mode: "rules" } });
  expect(interpreted.status()).toBe(200); expect(interpreted.headers()["cache-control"]).toBe("no-store");
  const report = reportResponseSchema.parse(await interpreted.json()); expect(reportBindingIssue(report, chart)).toBeNull(); expect(report.source).toBe("rules");
  const malformed = await request.post("/api/chart/generate", { data: { ...fixture.input, birthDate: "2000-02-30" } });
  expect(malformed.status()).toBe(400); expect(malformed.headers()["cache-control"]).toBe("no-store");
  const stale = await request.post("/api/chart/interpret", { data: { form: chart.form, chartId: chart.chartId, ruleHash: "0".repeat(64), mode: "rules" } });
  expect(stale.status()).toBe(409); expect((await stale.json()).code).toBe("RULES_CHANGED");
});
