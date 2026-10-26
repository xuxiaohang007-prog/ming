import { buildReadingMaterial } from "../reading-material";
import { buildDemoInterpretation } from "../demo-report";
import type { ChartResponse } from "../types";
import type { ReadingOptions } from "../reading-contract";
import type { InterpretEvent, InterpretMode, InterpretPhase } from "../interpret-stream";
import { readAIConfig } from "./config";
import type { AIConfig } from "./config";
import { AIServiceError, safeAIError } from "./errors";
import { requestOpenAI } from "./openai-provider";
import { assembleAIReport } from "./model-report";
import { buildRulesInterpretation } from "../rules-report";
import { reportBindingIssue, reportResponseSchema } from "../report-contract";

export function createInterpretStream(chart: ChartResponse, reading: ReadingOptions, mode: InterpretMode, requestId: string, requestSignal: AbortSignal, release: () => void, config?: AIConfig) {
  const upstream = new AbortController();
  let disposed = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const abort = () => upstream.abort(new AIServiceError("AI_CANCELLED", 499, false));
  requestSignal.addEventListener("abort", abort, { once: true });
  if (requestSignal.aborted) abort();
  const timeout = setTimeout(() => upstream.abort(new AIServiceError("AI_TIMEOUT", 504)), config?.timeoutMs ?? 90000);
  const dispose = () => {
    if (disposed) return;
    disposed = true; clearTimeout(timeout); clearInterval(heartbeat); requestSignal.removeEventListener("abort", abort); release();
  };
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      let sequence = 0, phase: InterpretPhase = "prepared", characters = 0, lastProgress = 0, closed = false;
      const send = (event: object) => { if (!closed && !disposed && !requestSignal.aborted) controller.enqueue(encoder.encode(JSON.stringify({ version: "ziwei-stream/1.0.0", requestId, chartId: chart.chartId, mode, sequence: ++sequence, ...event }) + "\n")); };
      const status = (next: InterpretPhase) => { phase = next; send({ type: "status", phase, characters }); };
      heartbeat = setInterval(() => send({ type: "status", phase, characters }), 10000);
      void (async () => {
        try {
          upstream.signal.throwIfAborted();
          status("prepared");
          let report;
          if (mode === "rules") {
            status("generating"); report = buildRulesInterpretation(chart, reading); status("validating");
          } else if (mode === "demo") {
            status("validating"); report = buildDemoInterpretation(chart, reading);
          } else {
            const settings = config ?? readAIConfig();
            status("connecting");
            const result = await requestOpenAI(buildReadingMaterial(chart, reading), settings, upstream.signal, (count) => {
              characters = count;
              if (phase !== "generating" || Date.now() - lastProgress >= 250) { lastProgress = Date.now(); status("generating"); }
            });
            upstream.signal.throwIfAborted(); status("validating"); report = assembleAIReport(result.value, chart, reading, result.model);
          }
          const checked = reportResponseSchema.safeParse(report);
          if (!checked.success || reportBindingIssue(checked.data, chart, reading)) throw new AIServiceError(mode === "rules" ? "RULES_OUTPUT_INVALID" : "AI_OUTPUT_INVALID");
          upstream.signal.throwIfAborted();
          send({ type: "complete", report: checked.data } satisfies Pick<Extract<InterpretEvent, { type: "complete" }>, "type" | "report">);
        } catch (error) {
          const safe = safeAIError(upstream.signal.aborted ? upstream.signal.reason : error);
          send({ type: "error", code: safe.code, retryable: safe.retryable });
        } finally {
          clearInterval(heartbeat);
          if (!closed) { closed = true; try { controller.close(); } catch {} }
          dispose();
        }
      })();
    },
    cancel() { upstream.abort(new AIServiceError("AI_CANCELLED", 499, false)); dispose(); }
  });
}
