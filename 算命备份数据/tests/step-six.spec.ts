import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { astro } from "iztro";
import { generateChart } from "../../lib/ziwei/iztro-adapter";
import { chartResponseSchema } from "../../lib/chart-contract";
import fixture from "./fixtures/ziwei-standard.json";

async function generate(page: Page) {
  await page.goto("/");
  await page.getByLabel("姓名或称呼").fill("林清月");
  await page.getByLabel("排盘性别").selectOption("女");
  await page.getByLabel("公历出生日期").fill("2000-08-16");
  await page.getByLabel("出生时间", { exact: true }).fill("03:00");
  await page.getByRole("button", { name: "生成命盘", exact: true }).click();
  await expect(page.locator(".ziwei-palace")).toHaveCount(12);
}

test("all palace relationships and star types are preserved from the official engine", () => {
  const chart = generateChart(fixture.input);
  const native = astro.bySolar("2000-8-16", 2, "女", true, "zh-CN");
  expect(chart.schemaVersion).toBe("ziwei-chart/1.1.0");
  for (const palace of chart.palaces) {
    const related = native.surroundedPalaces(palace.index).toJSON();
    for (const key of ["target", "opposite", "wealth", "career"] as const) expect(palace.surroundedPalaces[key]).toBe(chart.palaces[related[key].index].id);
    for (const group of ["majorStars", "minorStars", "adjectiveStars"] as const) expect(palace[group].map((star) => star.type)).toEqual(native.palaces[palace.index][group].map((star) => star.type));
  }
  expect(chart.palaces.flatMap((palace) => palace.majorStars).filter((star) => star.type === "major")).toHaveLength(14);
});

test("contract rejects corrupted relations and unknown star types", () => {
  const chart = generateChart(fixture.input);
  const invalid = structuredClone(chart); invalid.palaces[0].surroundedPalaces.opposite = chart.palaces[1].id;
  expect(chartResponseSchema.safeParse(invalid).success).toBe(false);
  const foreign = structuredClone(chart); foreign.palaces[1].surroundedPalaces.wealth = generateChart({ ...fixture.input, birthTime: "05:00" }).palaces[9].id;
  expect(chartResponseSchema.safeParse(foreign).success).toBe(false);
  expect(chartResponseSchema.safeParse({ ...chart, palaces: chart.palaces.map((palace, index) => index ? palace : { ...palace, majorStars: [{ ...palace.majorStars[0], type: "invented" }] }) }).success).toBe(false);
});

test("empty palaces separate opposite references and keep original stars untouched", async ({ page }) => {
  await generate(page);
  const chart = generateChart(fixture.input);
  const empty = chart.palaces.find((palace) => !palace.majorStars.some((star) => star.type === "major"))!;
  await page.locator(`[data-palace-index="${empty.index}"]`).click();
  await expect(page.locator(`[data-palace-index="${empty.index}"] .empty-palace`)).toContainText("空宫");
  await expect(page.locator("#palace-detail .empty-palace-note")).toContainText("不计入本宫星曜");
  const opposite = chart.palaces.find((palace) => palace.id === empty.surroundedPalaces.opposite)!;
  for (const star of opposite.majorStars.filter((star) => star.type === "major")) await expect(page.getByLabel("对宫参考主星")).toContainText(star.name);
  const native = astro.bySolar("2000-8-16", 2, "女", true, "zh-CN");
  expect(chart.palaces[empty.index].majorStars.map((star) => star.name)).toEqual(native.palaces[empty.index].majorStars.map((star) => star.name));
});

test("relationship highlights, layered stars and terminology work on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await generate(page);
  await expect(page.locator(".ziwei-related")).toHaveCount(4);
  await expect(page.locator(".ziwei-palace .relation-badge")).toHaveCount(3);
  await page.getByRole("button", { name: "三方四正 · 开", exact: true }).click();
  await expect(page.locator(".ziwei-related")).toHaveCount(0);
  await page.getByRole("button", { name: "三方四正 · 关", exact: true }).click();
  await page.getByRole("button", { name: "完整星曜 · 关", exact: true }).click();
  const chart = generateChart(fixture.input);
  expect(await page.locator(".ziwei-grid .star-name").count()).toBe(chart.palaces.reduce((sum, palace) => sum + palace.majorStars.length + palace.minorStars.length + palace.adjectiveStars.length, 0));
  await expect(page.locator(".ziwei-grid .star-brightness").first()).toBeVisible();
  await page.locator("#palace-detail summary").click();
  await expect(page.locator("#palace-detail .palace-glossary")).toContainText("不转成分数");
  await page.getByRole("navigation", { name: "宫位三方四正", exact: true }).getByRole("button").nth(1).click();
  await expect(page.locator('[data-palace-index="10"]')).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: test.info().outputPath("chart-full-desktop.png"), fullPage: true, animations: "disabled" });
});

test("directional keyboard navigation follows grid and skips the center", async ({ page }) => {
  await generate(page);
  const start = page.locator('[data-palace-index="0"]');
  await start.focus(); await start.press("ArrowUp");
  await expect(page.locator('[data-palace-index="1"]')).toBeFocused();
  await page.locator('[data-palace-index="1"]').press("ArrowRight");
  await expect(page.locator('[data-palace-index="8"]')).toBeFocused();
  await page.locator('[data-palace-index="8"]').press("Home");
  await expect(page.locator('[data-palace-index="4"]')).toBeFocused();
  await expect(page.locator('[data-palace-index="4"]')).toHaveAttribute("aria-pressed", "true");
});

test("mobile selection reveals details, dense stars fit and expanded settings stay synchronized", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await generate(page);
  await page.getByRole("button", { name: "完整星曜 · 关", exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator('[data-palace-index="5"]').click();
  const box = await page.locator("#palace-detail").boundingBox();
  expect(box!.y).toBeLessThan(812);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: test.info().outputPath("chart-empty-mobile.png"), fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "放大查看命盘" }).click();
  const dialog = page.getByRole("dialog", { name: "放大命盘", exact: true });
  await expect(dialog.getByRole("button", { name: "完整星曜 · 开", exact: true })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "完整星曜 · 开", exact: true }).click();
  await dialog.locator('[data-palace-index="0"]').focus();
  await dialog.locator('[data-palace-index="0"]').press("ArrowRight");
  await expect(dialog.locator('[data-palace-index="11"]')).toBeFocused();
  await page.screenshot({ path: test.info().outputPath("chart-dialog-mobile.png"), animations: "disabled" });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "完整星曜 · 关", exact: true })).toHaveAttribute("aria-pressed", "false");
});
