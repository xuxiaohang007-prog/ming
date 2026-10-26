import { z } from "zod";
import { CHART_ID_PATTERN } from "./contract-version";
import { reportBindingIssue, reportResponseSchema } from "./report-contract";
import type { ChartResponse, InterpretationResponse } from "./types";
import type { ReadingOptions } from "./reading-contract";
import { AI_MESSAGES, AIServiceError } from "./ai/errors";
import type { AIErrorCode } from "./ai/errors";
import { utf8Lines } from "./stream-lines";

export type InterpretMode = "demo" | "ai" | "rules";
export function reportSourceForMode(mode: InterpretMode) { return mode === "ai" ? "ai" : mode === "rules" ? "rules" : "demo"; }
export const INTERPRET_PHASES = ["prepared", "connecting", "generating", "validating"] as const;
export type InterpretPhase = typeof INTERPRET_PHASES[number];
export function interpretPhasesForMode(mode: InterpretMode): readonly InterpretPhase[] {
  return mode === "ai" ? INTERPRET_PHASES : mode === "rules" ? ["prepared", "generating", "validating"] : ["prepared", "validating"];
}
export const PHASE_LABELS = { prepared: "命盘与阅读主题已核对", connecting: "正在连接模型服务", generating: "正在接收模型输出", validating: "正在校验六章与证据引用" } as const;
const base = { version: z.literal("ziwei-stream/1.0.0"), requestId: z.string().uuid(), chartId: z.string().regex(CHART_ID_PATTERN), mode: z.enum(["demo", "ai", "rules"]), sequence: z.number().int().positive() };
export const interpretEventSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("status"), phase: z.enum(INTERPRET_PHASES), characters: z.number().int().min(0).max(120000) }).strict(),
  z.object({ ...base, type: z.literal("complete"), report: reportResponseSchema }).strict(),
  z.object({ ...base, type: z.literal("error"), code: z.string().min(1).max(80), retryable: z.boolean() }).strict()
]);
export type InterpretEvent = z.infer<typeof interpretEventSchema>;
export type InterpretProgress = { phase: InterpretPhase | "requesting"; characters: number };

export async function readInterpretStream(response: Response, expected: { requestId: string; chart: ChartResponse; reading: ReadingOptions; mode: InterpretMode }, onStatus: (status: InterpretProgress) => void): Promise<InterpretationResponse> {
  if (!response.body) throw new AIServiceError("STREAM_INVALID");
  let sequence = 0, terminal = false, phaseIndex = -1, characters = 0;
  let report: InterpretationResponse | undefined;
  try {
    for await (const line of utf8Lines(response.body, 1024 * 1024, 256000)) {
      if (!line.trim()) continue;
      const parsed = interpretEventSchema.safeParse(JSON.parse(line));
      if (!parsed.success) throw new AIServiceError("STREAM_INVALID");
      const event = parsed.data;
      if (terminal || event.requestId !== expected.requestId || event.chartId !== expected.chart.chartId || event.mode !== expected.mode || event.sequence !== ++sequence) throw new AIServiceError("STREAM_INVALID");
      if (event.type === "status") {
        const nextPhase = interpretPhasesForMode(expected.mode).indexOf(event.phase);
        if (nextPhase < 0 || nextPhase < phaseIndex || event.characters < characters) throw new AIServiceError("STREAM_INVALID");
        phaseIndex = nextPhase; characters = event.characters;
        onStatus({ phase: event.phase, characters: event.characters });
      } else if (event.type === "error") {
        const code = Object.hasOwn(AI_MESSAGES, event.code) ? event.code as AIErrorCode : "STREAM_INVALID";
        throw new AIServiceError(code, 502, event.retryable);
      } else {
        if (event.report.source !== reportSourceForMode(expected.mode) || reportBindingIssue(event.report, expected.chart, expected.reading)) throw new AIServiceError(expected.mode === "rules" ? "RULES_OUTPUT_INVALID" : "AI_OUTPUT_INVALID");
        terminal = true; report = event.report;
      }
    }
    if (!report || !terminal) throw new AIServiceError("STREAM_INVALID");
    return report;
  } catch (error) {
    if (error instanceof AIServiceError || (error instanceof Error && error.name === "AbortError")) throw error;
    throw new AIServiceError("STREAM_INVALID");
  }
}
