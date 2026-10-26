import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { generateChart } from "../../lib/ziwei/iztro-adapter";
import { buildRulesInterpretation } from "../../lib/rules-report";
import { readingStagesFor, readingPalaceIds, formatReadingElapsed } from "../../lib/reading-status";
import { readInterpretStream } from "../../lib/interpret-stream";
import { DEFAULT_READING } from "../../lib/reading-contract";
import fixture from "./fixtures/ziwei-standard.json";

test.use({ storageState: { cookies: [], origins: [] } });
const chart = generateChart(fixture.input);
const report = buildRulesInterpretation(chart);
type FixtureWindow = Window & { __readingEmit?: (event: Record<string, unknown>) => boolean; __readingAborted?: boolean };

async function controlledStream(page: Page) {
  await page.addInitScript(() => {
    const host = window as FixtureWindow;
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      if (!String(input).includes("/api/chart/interpret")) return original(input, init);
      const request = JSON.parse(String(init?.body));
      let sequence = 0, controller: ReadableStreamDefaultController<Uint8Array>;
      const body = new ReadableStream<Uint8Array>({ start(value) { controller = value; } });
      host.__readingAborted = false;
      host.__readingEmit = (event) => {
        try {
          controller.enqueue(new TextEncoder().encode(JSON.stringify({ version: "ziwei-stream/1.0.0", requestId: request.requestId, chartId: request.chartId, mode: request.mode, sequence: ++sequence, ...event }) + "\n"));
          if (event.type === "complete" || event.type === "error") controller.close();
          return true;
        } catch { return false; }
      };
      init?.signal?.addEventListener("abort", () => {
        host.__readingAborted = true;
        try { controller.error(new DOMException("Cancelled fixture", "AbortError")); } catch {}
      }, { once: true });
      return new Response(body, { headers: { "Content-Type": "application/x-ndjson" } });
    };
  });
}
async function generate(page: Page) {
  await page.goto("/"); await page.getByLabel("姓名或称呼").fill("标准样例");
  await page.getByLabel("排盘性别").selectOption("女"); await page.getByLabel("公历出生日期").fill("2000-08-16");
  await page.getByLabel("出生时间", { exact: true }).fill("03:00"); await page.getByRole("button", { name: "生成命盘", exact: true }).click();
  await expect(page.getByRole("button", { name: "生成本地解读", exact: true })).toBeVisible();
}
async function start(page: Page) {
  await page.getByRole("button", { name: "生成本地解读", exact: true }).click();
  await page.waitForFunction(() => typeof (window as FixtureWindow).__readingEmit === "function");
}
async function send(page: Page, event: Record<string, unknown>) {
  return page.evaluate((value) => (window as FixtureWindow).__readingEmit!(value), event);
}
const complete = { type: "complete", report };

test("mode-specific stages never claim a model connection for local rules or demo", () => {
  expect(readingStagesFor("rules").map((stage) => stage.phase)).toEqual(["requesting", "prepared", "generating", "validating"]);
  expect(readingStagesFor("demo").map((stage) => stage.phase)).toEqual(["requesting", "prepared", "validating"]);
  expect(readingStagesFor("ai").map((stage) => stage.phase)).toContain("connecting");
  expect(formatReadingElapsed(0)).toBe("00:00"); expect(formatReadingElapsed(65)).toBe("01:05"); expect(formatReadingElapsed(-1)).toBe("00:00");
  const career = chart.palaces.find((palace) => palace.name.replace(/宫$/, "") === "官禄")!;
  expect(readingPalaceIds(chart, { focus: "career", question: "" })).toEqual(Object.values(career.surroundedPalaces));
});

test("local stream rejects a model-connection phase rather than presenting false progress", async () => {
  const event = { version: "ziwei-stream/1.0.0", requestId: "00000000-0000-4000-8000-000000000009", chartId: chart.chartId, mode: "rules", sequence: 1, type: "status", phase: "connecting", characters: 0 };
  const response = new Response(new TextEncoder().encode(JSON.stringify(event) + "\n"));
  await expect(readInterpretStream(response, { requestId: event.requestId, chart, mode: "rules", reading: DEFAULT_READING }, () => {})).rejects.toMatchObject({ code: "STREAM_INVALID" });
});

test("birth request animates only the layout preview and cancellation stops it", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  let release: () => void = () => {}; const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/chart/generate", async (route) => { await gate; await route.abort().catch(() => {}); });
  await page.goto("/"); await page.getByLabel("排盘性别").selectOption("女"); await page.getByLabel("公历出生日期").fill("2000-08-16"); await page.getByLabel("出生时间", { exact: true }).fill("03:00");
  try {
    await page.getByRole("button", { name: "生成命盘", exact: true }).click(); await expect(page.locator(".preview-panel")).toHaveAttribute("data-preview-status", "loading");
    await expect(page.locator(".status-tag")).toHaveText("正在整理出生信息"); await expect(page.locator(".preview-palace").first()).toHaveCSS("animation-name", "preview-breathe");
    await page.getByRole("button", { name: "取消生成", exact: true }).click(); await expect(page.locator(".preview-panel")).toHaveAttribute("data-preview-status", "idle");
    await expect(page.locator(".preview-palace").first()).toHaveCSS("animation-name", "none"); await expect(page.locator(".ziwei-palace")).toHaveCount(0);
  } finally { release(); }
});

test("request, material emphasis and generating visuals follow received packets only", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.emulateMedia({ reducedMotion: "no-preference" });
  await controlledStream(page); await generate(page); await page.getByLabel("阅读侧重点").selectOption("career"); await start(page);
  await expect(page.locator(".reading-current-status")).toHaveText("正在提交阅读请求");
  await expect(page.locator(".interpret-steps li[data-step-state='pending']").first()).not.toContainText("已核对");
  await expect(page.locator(".interpret-steps")).not.toContainText("正在连接模型服务"); await expect(page.locator(".ziwei-reading-highlight")).toHaveCount(0);
  await send(page, { type: "status", phase: "prepared", characters: 0 });
  await expect(page.locator(".reading-current-status")).toContainText("已核对"); await expect(page.locator(".ziwei-reading-highlight")).toHaveCount(4);
  for (const id of readingPalaceIds(chart, { focus: "career", question: "" })) await expect(page.locator(`.ziwei-reading-highlight[data-evidence-id="${id}"]`)).toHaveCount(1);
  await send(page, { type: "status", phase: "generating", characters: 0 });
  await expect(page.locator(".reading-current-status")).toContainText("正在匹配本地解读规则");
  await expect(page.locator(".orbit-point").first()).toHaveCSS("animation-name", "reading-point"); await expect(page.locator(".ziwei-reading-highlight")).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready); await page.locator(".reading-panel").screenshot({ path: test.info().outputPath("rules-waiting-desktop.png"), animations: "disabled" });
  await page.getByRole("button", { name: "取消，返回命盘", exact: true }).click();
});

test("slow mobile request shows real elapsed time without advancing its stage or percentage", async ({ page }) => {
  await page.clock.install(); await page.setViewportSize({ width: 375, height: 1000 }); await page.emulateMedia({ reducedMotion: "reduce" });
  await controlledStream(page); await generate(page); await start(page); await page.clock.fastForward(11000);
  await expect(page.locator(".reading-clock")).toContainText("00:11"); await expect(page.locator(".reading-current-status")).toHaveText("正在提交阅读请求");
  await expect(page.locator(".reading-slow-note")).toContainText("等待时间稍长");
  expect(await page.locator(".interpretation-status").innerText()).not.toMatch(/\d+%/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => document.fonts.ready); await page.locator(".reading-panel").screenshot({ path: test.info().outputPath("slow-reading-mobile.png"), animations: "disabled" });
  await send(page, { type: "status", phase: "prepared", characters: 0 }); await expect(page.locator(".reading-clock")).toContainText("00:11");
  await page.getByRole("button", { name: "取消，返回命盘", exact: true }).click();
});

test("mocked cloud connection breathes in the center and counts actual received characters", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" }); await controlledStream(page); await generate(page);
  await page.getByText("兼容的云端模式（需要密钥）", { exact: true }).click(); await page.getByRole("radio", { name: "真实 AI 解读", exact: true }).check();
  await page.getByRole("button", { name: "开始真实 AI 解读", exact: true }).click(); await page.waitForFunction(() => Boolean((window as FixtureWindow).__readingEmit));
  await send(page, { type: "status", phase: "prepared", characters: 0 }); await send(page, { type: "status", phase: "connecting", characters: 0 });
  await expect(page.locator(".reading-current-status")).toContainText("正在连接模型服务");
  expect(await page.locator(".ziwei-center").evaluate((element) => getComputedStyle(element, "::before").animationName)).toBe("reading-breathe");
  await send(page, { type: "status", phase: "generating", characters: 240 }); await expect(page.locator(".reading-runtime")).toContainText("240 个字符");
  await page.getByRole("button", { name: "取消，返回命盘", exact: true }).click();
});

test("reduced motion disables moving layers while keeping status accessible", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" }); await controlledStream(page); await generate(page); await start(page);
  await send(page, { type: "status", phase: "prepared", characters: 0 }); await send(page, { type: "status", phase: "generating", characters: 0 });
  await expect(page.locator(".reading-current-status")).toContainText("正在匹配");
  for (const selector of [".reading-halo", ".loading-line", ".orbit-point"]) await expect(page.locator(selector).first()).toHaveCSS("animation-name", "none");
  await expect(page.getByRole("timer")).toHaveAttribute("aria-live", "off"); await expect(page.locator(".reading-current-status")).toHaveAttribute("aria-live", "polite");
  await page.getByRole("button", { name: "取消，返回命盘", exact: true }).click(); await expect(page.locator(".reading-panel")).toHaveCount(0); expect(errors).toEqual([]);
});

test("fast real local result has no minimum wait and opens the validated report cover", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); await generate(page);
  const start = Date.now(); await page.getByRole("button", { name: "生成本地解读", exact: true }).click();
  await expect(page.getByRole("heading", { name: "标准样例的本地规则解读", exact: true })).toBeVisible();
  expect(Date.now() - start).toBeLessThan(5000); await expect(page.locator(".report-ready-label")).toHaveText("6 章已校验"); await expect(page.locator(".reading-panel")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "标准样例的本地规则解读", exact: true })).toBeFocused();
  const box = await page.locator(".report-cover").boundingBox(); expect(box!.y).toBeGreaterThanOrEqual(0); expect(box!.y).toBeLessThan(100);
});

test("continued palace reading retains selection and focus instead of forcing the report", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.emulateMedia({ reducedMotion: "reduce" }); await controlledStream(page); await generate(page); await start(page);
  const palace = page.locator('[data-palace-index="0"]'); await palace.click(); await send(page, complete);
  await expect(page.getByRole("button", { name: "查看已有报告", exact: true })).toBeVisible(); await expect(page.locator(".notice")).toContainText("不会自动跳走");
  await expect(page.locator(".report-section")).toHaveCount(0); await expect(palace).toHaveAttribute("aria-pressed", "true"); await expect(palace).toBeFocused();
  await page.locator(".chart-layout").screenshot({ path: test.info().outputPath("chart-reading-ready-desktop.png"), animations: "disabled" });
  await page.getByRole("button", { name: "查看已有报告", exact: true }).click(); await expect(page.getByRole("heading", { name: "标准样例的本地规则解读", exact: true })).toBeVisible();
});

test("an enlarged chart remains open when its report becomes ready", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); await controlledStream(page); await generate(page); await start(page);
  await page.getByRole("button", { name: "放大查看命盘", exact: true }).click(); await send(page, complete);
  await expect(page.getByRole("dialog", { name: "放大命盘", exact: true })).toBeVisible(); await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
  await page.keyboard.press("Escape"); await expect(page.getByRole("button", { name: "查看已有报告", exact: true })).toBeVisible(); await expect(page.locator(".report-section")).toHaveCount(0);
});

test("keyboard palace navigation keeps focus after waiting completes", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); await controlledStream(page); await generate(page); await start(page);
  const palace = page.locator('[data-palace-index="0"]'); await palace.focus(); await palace.press("ArrowUp"); await send(page, complete);
  await expect(page.getByRole("button", { name: "查看已有报告", exact: true })).toBeVisible(); await expect(page.locator('[data-palace-index="1"]')).toBeFocused();
});

test("cancel stops timers and animations and ignores late packets", async ({ page }) => {
  await page.clock.install(); await page.emulateMedia({ reducedMotion: "reduce" }); await controlledStream(page); await generate(page); await start(page);
  await page.getByRole("button", { name: "取消，返回命盘", exact: true }).click(); await expect(page.locator(".reading-panel")).toHaveCount(0);
  expect(await page.evaluate(() => (window as FixtureWindow).__readingAborted)).toBe(true); expect(await send(page, complete)).toBe(false);
  await page.clock.fastForward(15000); await expect(page.locator(".reading-clock, .reading-slow-note, .reading-orbit")).toHaveCount(0); await expect(page.locator(".report-section")).toHaveCount(0);
});

test("failure leaves actionable retry and no waiting layers, then a fresh stream can succeed", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); await controlledStream(page); await generate(page); await start(page);
  await send(page, { type: "error", code: "RULES_OUTPUT_INVALID", retryable: true }); await expect(page.locator(".error-notice")).toContainText("本地报告"); await expect(page.locator(".reading-panel")).toHaveCount(0);
  await page.getByRole("button", { name: "重试本地解读", exact: true }).click(); await expect(page.locator(".reading-panel")).toHaveCount(1); await send(page, complete);
  await expect(page.getByRole("heading", { name: "标准样例的本地规则解读", exact: true })).toBeVisible();
});
