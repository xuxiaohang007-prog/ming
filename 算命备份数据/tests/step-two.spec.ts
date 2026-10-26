import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function generate(page: Page) {
  await page.getByLabel("姓名或称呼").fill("林清月");
  await page.getByLabel("排盘性别").selectOption("女");
  await page.getByLabel("公历出生日期").fill("2000-08-16");
  await page.getByLabel("出生时间", { exact: true }).fill("03:00");
  await page.getByRole("button", { name: "生成命盘", exact: true }).click();
  await expect(page.getByRole("heading", { name: "林清月的紫微命盘" })).toBeVisible();
}

async function assertNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

for (const width of [375, 768, 1440]) {
  test(`${width}px input, chart and report keep their visual layout and readable content`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    await assertNoOverflow(page);
    const form = await page.locator(".birth-panel").boundingBox();
    const preview = await page.getByRole("complementary", { name: "等待生成的命盘预览" }).boundingBox();
    expect(form).not.toBeNull(); expect(preview).not.toBeNull();
    if (width >= 768) expect(preview!.x).toBeGreaterThan(form!.x + form!.width);
    else expect(preview!.y).toBeGreaterThan(form!.y + form!.height);
    await page.screenshot({ path: test.info().outputPath(`input-${width}.png`), fullPage: true });
    await generate(page);
    await page.evaluate(() => document.fonts.ready);
    await assertNoOverflow(page);
    await expect(page.locator(".ziwei-palace")).toHaveCount(12);
    const selected = page.getByRole("region", { name: "宫位详情", exact: true });
    if (width === 1440) {
      const board = await page.locator(".chart-board").boundingBox();
      const detail = await selected.boundingBox();
      expect(detail!.x).toBeGreaterThan(board!.x + board!.width);
    }
    await page.screenshot({ path: test.info().outputPath(`chart-${width}.png`), fullPage: true });
    await page.getByRole("button", { name: "开始 AI 解读（示例）", exact: true }).click();
    await expect(page.getByRole("heading", { name: "林清月的命盘阅读示例" })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await assertNoOverflow(page);
    await expect(page.locator(".report-section")).toHaveCount(6);
    expect(await page.locator(".report-body").first().evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(14);
    await page.screenshot({ path: test.info().outputPath(`report-${width}.png`), fullPage: true });
  });
}

test("Chinese fonts load locally and text colors meet 4.5:1 contrast", async ({ page }) => {
  const fonts: string[] = [];
  page.on("request", (request) => { if (request.resourceType() === "font") fonts.push(request.url()); });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  expect(fonts.length).toBeGreaterThan(0);
  expect(fonts.every((url) => url.startsWith("http://127.0.0.1:3100/"))).toBe(true);
  expect(await page.evaluate(() => document.fonts.check('600 24px "Noto Serif SC Variable"', "紫微命盘") && document.fonts.check('400 14px "Noto Sans SC Variable"', "出生信息"))).toBe(true);
  const result = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    function luminance(hex: string) {
      const values = hex.trim().replace("#", "").match(/../g)!.map((part) => parseInt(part, 16) / 255);
      const linear = values.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
      return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    }
    const paper = luminance(style.getPropertyValue("--paper"));
    return ["--ink", "--text-soft", "--gold-text", "--cinnabar"].map((token) => {
      const text = luminance(style.getPropertyValue(token));
      return { token, ratio: (Math.max(paper, text) + 0.05) / (Math.min(paper, text) + 0.05) };
    });
  });
  for (const color of result) expect(color.ratio, color.token).toBeGreaterThanOrEqual(4.5);
  await expect(page.locator("h2").first()).toHaveCSS("font-family", /Noto Serif SC Variable/);
  await expect(page.locator("body")).toHaveCSS("font-family", /Noto Sans SC Variable/);
});

test("mobile chart enlargement supports keyboard zoom, selection and Escape focus return", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/"); await generate(page);
  const trigger = page.getByRole("button", { name: "放大查看命盘" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "放大命盘", exact: true });
  await expect(dialog).toBeVisible();
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
  const slider = dialog.getByRole("slider", { name: "盘面缩放" });
  await slider.focus(); await slider.press("ArrowRight");
  await expect(slider).toHaveValue("110");
  const palace = dialog.locator(".ziwei-palace").first();
  await palace.click(); await expect(palace).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("region", { name: "放大宫位详情" })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("mobile-expanded.png"), fullPage: true });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
  await assertNoOverflow(page);
  await trigger.click(); await dialog.getByRole("button", { name: "关闭放大命盘" }).click();
  await expect(dialog).not.toBeVisible();
});

test("print keeps report content visible and removes navigation and actions", async ({ page }) => {
  await page.goto("/"); await generate(page);
  await page.getByRole("button", { name: "开始 AI 解读（示例）", exact: true }).click();
  await expect(page.getByRole("heading", { name: "林清月的命盘阅读示例" })).toBeVisible();
  await page.emulateMedia({ media: "print", reducedMotion: "reduce" });
  await expect(page.locator(".site-header")).not.toBeVisible();
  await expect(page.locator(".report-actions")).not.toBeVisible();
  await expect(page.locator(".report-toc")).not.toBeVisible();
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(page.locator("#report-actions")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: test.info().outputPath("print-report.png"), fullPage: true });
});

test("reduced-motion hydration and chart interactions have no browser errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await generate(page);
  await page.getByRole("button", { name: "放大查看命盘" }).click();
  await page.getByRole("button", { name: "关闭放大命盘" }).click();
  expect(errors).toEqual([]);
});
