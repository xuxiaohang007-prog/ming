import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { POST } from "../../app/api/chart/interpret/route";
import { generateChart } from "../../lib/ziwei/iztro-adapter";
import { buildReadingMaterial } from "../../lib/reading-material";
import { buildDemoInterpretation } from "../../lib/demo-report";
import { readAIConfig } from "../../lib/ai/config";
import { requestOpenAI } from "../../lib/ai/openai-provider";
import { assembleAIReport } from "../../lib/ai/model-report";
import { createAIRequestLimiter } from "../../lib/ai/limits";
import { readInterpretStream } from "../../lib/interpret-stream";
import { reportBindingIssue } from "../../lib/report-contract";
import { DEFAULT_READING } from "../../lib/reading-contract";
import fixture from "./fixtures/ziwei-standard.json";

const chart = generateChart(fixture.input);
const material = buildReadingMaterial(chart);
const sample = buildDemoInterpretation(chart);
const narrative = { sections: sample.sections.map(({ id, summary, body, bullet, evidenceIds }) => ({ id, summary, body, bullet, evidenceIds })) };
const config = readAIConfig({ OPENAI_API_KEY: "fake-unit-test-key-not-a-credential", FORTUNE_AI_MAX_RETRIES: "0" });
const requestId = "00000000-0000-4000-8000-000000000008";
const base = { version: "ziwei-stream/1.0.0", requestId, chartId: chart.chartId, mode: "ai" };
const aiReport = assembleAIReport(narrative, chart, DEFAULT_READING, config.model);
const status = { ...base, type: "status", sequence: 1, phase: "prepared", characters: 0 };
const complete = { ...base, type: "complete", sequence: 2, report: aiReport };

function byteStream(text: string, size = 13) {
  const bytes = new TextEncoder().encode(text); let offset = 0;
  return new ReadableStream<Uint8Array>({ pull(controller) {
    if (offset >= bytes.length) { controller.close(); return; }
    controller.enqueue(bytes.slice(offset, offset + size)); offset += size;
  } });
}
function providerResponse(value: unknown = narrative, extra = "", terminal = true) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const events = [JSON.stringify({ type: "response.created" }), JSON.stringify({ type: "response.output_text.delta", delta: text })];
  if (extra) events.push(extra);
  if (terminal) events.push(JSON.stringify({ type: "response.completed", response: { status: "completed", model: config.model } }));
  return new Response(byteStream(events.map((event) => `data: ${event}\r\n\r\n`).join("")), { headers: { "Content-Type": "text/event-stream" } });
}
function streamResponse(events: unknown[], suffix = "") {
  return new Response(byteStream(events.map((event) => JSON.stringify(event) + "\n").join("") + suffix), { headers: { "Content-Type": "application/x-ndjson" } });
}
const expected = { requestId, chart, reading: DEFAULT_READING, mode: "ai" as const };
function routeRequest(overrides: object = {}, signal?: AbortSignal) {
  return new Request("http://localhost/api/chart/interpret", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
    body: JSON.stringify({ form: fixture.input, chartId: chart.chartId, ruleVersion: chart.ruleVersion, ruleHash: chart.ruleHash, mode: "ai", requestId, ...overrides }), signal });
}
async function withProvider<T>(fake: typeof fetch, run: () => Promise<T>, env: Record<string, string> = {}) {
  const original = globalThis.fetch;
  const values = { OPENAI_API_KEY: config.apiKey, OPENAI_MODEL: config.model, FORTUNE_AI_MAX_RETRIES: "0", ...env };
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values); globalThis.fetch = fake;
  try { return await run(); } finally {
    globalThis.fetch = original;
    for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
}
async function generate(page: Page) {
  await page.goto("/"); await page.getByLabel("姓名或称呼").fill("标准样例"); await page.getByLabel("排盘性别").selectOption("女");
  await page.getByLabel("公历出生日期").fill("2000-08-16"); await page.getByLabel("出生时间", { exact: true }).fill("03:00");
  await page.getByRole("button", { name: "生成命盘", exact: true }).click(); await page.getByText("兼容的云端模式（需要密钥）", { exact: true }).click(); await page.getByRole("radio", { name: "真实 AI 解读", exact: true }).check();
}

test("server configuration is required and output, timeout and retry settings are bounded", () => {
  expect(() => readAIConfig({})).toThrow(/未配置/);
  for (const env of [{ FORTUNE_AI_MAX_RETRIES: "2" }, { FORTUNE_AI_MAX_OUTPUT_TOKENS: "12001" }, { FORTUNE_AI_TIMEOUT_MS: "0" }, { OPENAI_MODEL: "bad\nmodel" }]) expect(() => readAIConfig({ OPENAI_API_KEY: config.apiKey, ...env })).toThrow(/配置不正确/);
  expect(config).toMatchObject({ timeoutMs: 90000, maxOutputTokens: 6000, maxRetries: 0 });
});

test("model narratives attach trusted facts and reject missing, reordered or irrelevant references", () => {
  expect(aiReport).toMatchObject({ source: "ai", provider: "openai", model: config.model });
  expect(reportBindingIssue(aiReport, chart, DEFAULT_READING)).toBeNull();
  expect(aiReport.sections.map((section) => section.facts)).toEqual(material.sections.map((section) => section.facts));
  for (const value of [{ sections: narrative.sections.slice(1) }, { sections: [...narrative.sections].reverse() }, { ...narrative, facts: "伪造" }]) expect(() => assembleAIReport(value, chart, DEFAULT_READING, config.model)).toThrow(/校验/);
  const wrong = structuredClone(narrative); wrong.sections[2].evidenceIds.push(chart.evidence.find((item) => !material.sections[2].allowedEvidenceIds.includes(item.id))!.id);
  expect(() => assembleAIReport(wrong, chart, DEFAULT_READING, config.model)).toThrow(/校验/);
});

test("Responses request streams structured output without storing or forwarding private profile fields", async () => {
  let calls = 0; const counts: number[] = [];
  const privateChart = generateChart({ ...fixture.input, name: "私人称呼测试", birthPlace: "私人地点测试" });
  const result = await requestOpenAI(buildReadingMaterial(privateChart), config, new AbortController().signal, (count) => counts.push(count), { fetch: async (url, init) => {
    calls++; expect(url).toBe("https://api.openai.com/v1/responses"); expect(init?.redirect).toBe("error");
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${config.apiKey}`);
    const body = JSON.parse(init!.body as string); expect(body).toMatchObject({ stream: true, store: false, max_output_tokens: 6000, text: { format: { type: "json_schema", strict: true } } });
    expect(JSON.stringify(body.input)).not.toContain(config.apiKey); expect(JSON.stringify(body.input)).not.toContain("私人称呼测试"); expect(JSON.stringify(body.input)).not.toContain("私人地点测试");
    return providerResponse();
  } });
  expect(result.value).toEqual(narrative); expect(result.model).toBe(config.model); expect(calls).toBe(1); expect(counts.at(-1)).toBe(JSON.stringify(narrative).length);
});

test("provider rejects refusals, truncation, malformed JSON and missing completion", async () => {
  const cases = [() => providerResponse(narrative, JSON.stringify({ type: "response.refusal.delta", delta: "private refusal" })),
    () => providerResponse(narrative, JSON.stringify({ type: "response.incomplete" }), false), () => providerResponse("half-json"), () => providerResponse(narrative, "", false)];
  for (const create of cases) await expect(requestOpenAI(material, config, new AbortController().signal, () => {}, { fetch: async () => create() })).rejects.toThrow();
});

test("retries are limited to transient HTTP failures before streaming, and auth errors are sanitized", async () => {
  let calls = 0;
  await requestOpenAI(material, { ...config, maxRetries: 1 }, new AbortController().signal, () => {}, { delay: async () => {}, fetch: async () => ++calls === 1 ? new Response("private details", { status: 429 }) : providerResponse() });
  expect(calls).toBe(2); calls = 0;
  await expect(requestOpenAI(material, { ...config, maxRetries: 1 }, new AbortController().signal, () => {}, { fetch: async () => { calls++; return new Response("private key details", { status: 401 }); } })).rejects.toMatchObject({ code: "AI_AUTH_FAILED", retryable: false });
  expect(calls).toBe(1);
  calls = 0;
  await expect(requestOpenAI(material, { ...config, maxRetries: 1 }, new AbortController().signal, () => {}, { fetch: async () => { calls++; return providerResponse(narrative, "", false); } })).rejects.toMatchObject({ code: "AI_OUTPUT_INVALID" });
  expect(calls).toBe(1);
});

test("NDJSON reader handles split UTF-8 and validates the whole report before returning", async () => {
  const phases: string[] = [];
  const report = await readInterpretStream(streamResponse([status, { ...status, sequence: 2, phase: "generating", characters: 200 }, { ...complete, sequence: 3 }]), expected, (progress) => phases.push(progress.phase));
  expect(report).toEqual(aiReport); expect(phases).toEqual(["prepared", "generating"]);
});

test("NDJSON reader rejects stale IDs, wrong modes, regressing status and incomplete or extra data", async () => {
  const cases = [ [status], [{ ...status, requestId: "00000000-0000-4000-8000-000000000009" }, complete], [{ ...status, mode: "demo" }, complete],
    [status, { ...complete, sequence: 3 }], [status, complete, complete], [{ ...status, phase: "generating", characters: 200 }, { ...status, sequence: 2, phase: "connecting", characters: 0 }, { ...complete, sequence: 3 }], [status, { ...complete, report: sample }] ];
  for (const events of cases) await expect(readInterpretStream(streamResponse(events), expected, () => {})).rejects.toThrow();
  await expect(readInterpretStream(streamResponse([status], "{\"type\":"), expected, () => {})).rejects.toThrow();
});

test("stream errors expose only local safe messages and oversized lines are rejected", async () => {
  await expect(readInterpretStream(streamResponse([{ ...base, sequence: 1, type: "error", code: "PRIVATE_SECRET", retryable: true }]), expected, () => {})).rejects.toMatchObject({ code: "STREAM_INVALID" });
  await expect(readInterpretStream(new Response(byteStream("x".repeat(256001))), expected, () => {})).rejects.toMatchObject({ code: "STREAM_INVALID" });
});

test("HTTP demo streaming preserves legacy JSON and rejects invalid bindings before provider use", async ({ request }) => {
  const response = await request.post("/api/chart/interpret", { headers: { Accept: "application/x-ndjson" }, data: { form: fixture.input, requestId, mode: "demo", chartId: chart.chartId, ruleHash: chart.ruleHash } });
  expect(response.status()).toBe(200); expect(response.headers()["content-type"]).toContain("application/x-ndjson");
  const events = (await response.text()).trim().split("\n").map((line) => JSON.parse(line)); expect(events.at(-1).type).toBe("complete"); expect(events.at(-1).report.source).toBe("demo");
  const invalid = await request.post("/api/chart/interpret", { headers: { Accept: "application/x-ndjson" }, data: { form: fixture.input, requestId: "invalid", mode: "ai" } }); expect(invalid.status()).toBe(400);
  const large = await request.post("/api/chart/interpret", { data: { form: fixture.input, padding: "x".repeat(33000) } }); expect(large.status()).toBe(413); expect((await large.json()).code).toBe("REQUEST_TOO_LARGE");
  const changed = await request.post("/api/chart/interpret", { data: { form: fixture.input, ruleVersion: "wrong-version" } }); expect(changed.status()).toBe(409); expect((await changed.json()).code).toBe("RULES_CHANGED");
});

test("actual route-to-provider pipeline completes using a mocked Responses server", async () => {
  await withProvider(async () => providerResponse(), async () => {
    const response = await POST(routeRequest()); expect(response.status).toBe(200);
    const report = await readInterpretStream(response, expected, () => {}); expect(report.source).toBe("ai"); expect(reportBindingIssue(report, chart)).toBeNull();
  });
  await withProvider(async () => new Response("private server error", { status: 401 }), async () => {
    const response = await POST(routeRequest()); const text = await response.text(); expect(text).toContain("AI_AUTH_FAILED"); expect(text).not.toContain("private server error"); expect(text).not.toContain(config.apiKey);
  });
});

test("route timeout and cancellation abort upstream and release the same-chart lock", async () => {
  let aborted = 0;
  const hanging: typeof fetch = async (_url, init) => new Response(new ReadableStream<Uint8Array>({ start(controller) {
    init!.signal!.addEventListener("abort", () => { aborted++; controller.error(init!.signal!.reason); }, { once: true });
  } }), { headers: { "Content-Type": "text/event-stream" } });
  await withProvider(hanging, async () => {
    const response = await POST(routeRequest()); const text = await response.text(); expect(text).toContain("AI_TIMEOUT"); expect(text).not.toContain('"type":"complete"');
  }, { FORTUNE_AI_TIMEOUT_MS: "1000" });
  await withProvider(hanging, async () => {
    const controller = new AbortController(); const response = await POST(routeRequest({}, controller.signal));
    const duplicate = await POST(routeRequest()); expect(duplicate.status).toBe(429); expect((await duplicate.json()).code).toBe("AI_BUSY");
    const reader = response.body!.getReader(); await reader.read(); controller.abort(); await reader.cancel(); reader.releaseLock();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(aborted).toBe(2);
  await withProvider(async () => providerResponse(), async () => { const response = await POST(routeRequest()); expect(response.status).toBe(200); expect((await response.text())).toContain('"type":"complete"'); });
});

test("in-process limiter prevents duplicate charts, excess concurrency and burst requests", () => {
  let now = 0; const acquire = createAIRequestLimiter(undefined, () => now);
  const first = acquire("one"); expect(() => acquire("one")).toThrow(/繁忙/); const second = acquire("two"); expect(() => acquire("three")).toThrow(/繁忙/);
  first(); first(); second();
  for (let i = 0; i < 8; i++) acquire(`chart-${i}`)();
  expect(() => acquire("eleventh")).toThrow(/频繁/); now = 60001; acquire("new-window")();
});

test("real mode without configuration keeps the chart and never falls back to a demo", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 1000 }); await page.emulateMedia({ reducedMotion: "reduce" });
  await generate(page); await expect(page.getByLabel("自填问题（选填）")).toHaveAttribute("aria-describedby", "reading-question-hint");
  await page.getByRole("button", { name: "开始真实 AI 解读", exact: true }).click();
  await expect(page.locator(".error-notice")).toContainText("未配置"); await expect(page.locator(".ziwei-palace")).toHaveCount(12); await expect(page.locator(".report-section")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "重试 AI 解读", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("ai-unconfigured-mobile.png"), fullPage: true, animations: "disabled" });
});

test("UI receives stream reports with AI attribution and rejects truncation before retry", async ({ page }) => {
  await generate(page);
  let calls = 0;
  await page.route("**/api/chart/interpret", async (route) => {
    const input = route.request().postDataJSON(); calls++;
    const dynamic = { ...base, requestId: input.requestId };
    const events: unknown[] = [{ ...status, ...dynamic }];
    if (calls > 1) events.push({ ...complete, ...dynamic });
    await route.fulfill({ status: 200, contentType: "application/x-ndjson", body: events.map((event) => JSON.stringify(event) + "\n").join("") });
  });
  await page.getByRole("button", { name: "开始真实 AI 解读", exact: true }).click();
  await expect(page.locator(".error-notice")).toContainText("不完整"); await expect(page.locator(".report-section")).toHaveCount(0);
  await page.getByRole("button", { name: "重试 AI 解读", exact: true }).click();
  await expect(page.getByRole("heading", { name: "标准样例的命盘阅读报告", exact: true })).toBeVisible();
  await expect(page.locator(".report-body-label").first()).toContainText("AI 解释"); await expect(page.locator(".report-archive")).toContainText(config.model);
  await page.locator("#report-personality").screenshot({ path: test.info().outputPath("ai-report-mocked.png"), animations: "disabled" });
});

test("cancelled AI requests cannot overwrite a new chart, and waiting state has no fake progress", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.emulateMedia({ reducedMotion: "reduce" }); await generate(page);
  let release: () => void = () => {}; const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/chart/interpret", async (route) => {
    const input = route.request().postDataJSON(); await gate;
    await route.fulfill({ status: 200, contentType: "application/x-ndjson", body: JSON.stringify({ ...complete, requestId: input.requestId, sequence: 1 }) + "\n" }).catch(() => {});
  });
  await page.getByRole("button", { name: "开始真实 AI 解读", exact: true }).click();
  await expect(page.getByRole("heading", { name: "命盘阅读", exact: true })).toBeVisible(); await expect(page.locator(".interpret-steps li[aria-current]")).toContainText("正在提交阅读请求");
  await page.locator(".interpretation-status").screenshot({ path: test.info().outputPath("ai-waiting-mocked.png"), animations: "disabled" });
  await page.getByRole("button", { name: "取消，返回命盘", exact: true }).click();
  await page.getByRole("button", { name: "修改出生信息", exact: true }).click();
  await page.getByLabel("姓名或称呼").fill("新的命盘"); release(); await page.getByRole("button", { name: "生成命盘", exact: true }).click();
  await expect(page.getByRole("heading", { name: "新的命盘的紫微命盘", exact: true })).toBeVisible(); await expect(page.locator(".report-section")).toHaveCount(0);
});
