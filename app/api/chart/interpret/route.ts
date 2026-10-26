import { NextResponse } from "next/server";
import { assertExpectedRuleHash } from "@/lib/ziwei/engine-rules";
import { assertExpectedChartId } from "@/lib/ziwei/chart-identity";
import { generateChart } from "@/lib/ziwei/iztro-adapter";
import { buildDemoInterpretation } from "@/lib/demo-report";
import { apiError } from "@/lib/api-error";
import { parseReadingOptions } from "@/lib/reading-contract";
import { z } from "zod";
import { AIServiceError } from "@/lib/ai/errors";
import { readAIConfig } from "@/lib/ai/config";
import { acquireAIRequest } from "@/lib/ai/limits";
import { createInterpretStream } from "@/lib/ai/interpret-service";
import { ZiweiRequestError } from "@/lib/ziwei/errors";
import { buildRulesInterpretation } from "@/lib/rules-report";

export const runtime = "nodejs";
export const maxDuration = 120;

async function readBody(request: Request): Promise<unknown> {
  if (!request.body) throw new AIServiceError("INVALID_INTERPRET_REQUEST", 400, false);
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0, content = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 32768) throw new AIServiceError("REQUEST_TOO_LARGE", 413, false);
      content += decoder.decode(value, { stream: true });
    }
    return JSON.parse(content + decoder.decode());
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export async function POST(request: Request) {
  try {
    const body = await readBody(request);
    const envelope = z.object({ mode: z.enum(["demo", "ai", "rules"]).default("demo"), requestId: z.string().uuid().optional() }).passthrough().safeParse(body);
    if (!envelope.success) throw new AIServiceError("INVALID_INTERPRET_REQUEST", 400, false);
    const reading = parseReadingOptions(body && typeof body === "object" && "reading" in body ? body.reading : undefined);
    const chart = generateChart(body && typeof body === "object" && "form" in body ? body.form : undefined);
    if (envelope.data.ruleVersion !== undefined && envelope.data.ruleVersion !== chart.ruleVersion) throw new ZiweiRequestError("RULES_CHANGED", "排盘规则已更新，请重新生成命盘。", 409);
    assertExpectedRuleHash(body && typeof body === "object" && "ruleHash" in body ? body.ruleHash : undefined, chart.ruleHash);
    assertExpectedChartId(body && typeof body === "object" && "chartId" in body ? body.chartId : undefined, chart.chartId);
    const streaming = request.headers.get("accept")?.includes("application/x-ndjson");
    const { mode, requestId } = envelope.data;
    if (streaming || mode === "ai") {
      if (!streaming || !requestId || (mode === "ai" && (!envelope.data.chartId || !envelope.data.ruleHash))) throw new AIServiceError("INVALID_INTERPRET_REQUEST", 400, false);
      const config = mode === "ai" ? readAIConfig() : undefined;
      request.signal.throwIfAborted();
      const release = mode === "ai" ? acquireAIRequest(chart.chartId) : () => {};
      try {
        return new Response(createInterpretStream(chart, reading, mode, requestId, request.signal, release, config), {
          headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no", "X-Content-Type-Options": "nosniff" }
        });
      } catch (error) { release(); throw error; }
    }
    return NextResponse.json(mode === "rules" ? buildRulesInterpretation(chart, reading) : buildDemoInterpretation(chart, reading), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
