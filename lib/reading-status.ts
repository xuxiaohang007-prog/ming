import { interpretPhasesForMode, PHASE_LABELS } from "./interpret-stream";
import type { InterpretMode, InterpretProgress } from "./interpret-stream";
import type { ChartResponse } from "./types";
import type { ReadingOptions } from "./reading-contract";

export function readingStagesFor(mode: InterpretMode) {
  return [{ phase: "requesting" as const, label: "正在提交阅读请求" }, ...interpretPhasesForMode(mode).map((phase) => ({ phase,
    label: phase === "generating" && mode === "rules" ? "正在匹配本地解读规则" : PHASE_LABELS[phase] }))];
}
export function readingPhaseLabel(mode: InterpretMode, phase: InterpretProgress["phase"]) {
  return readingStagesFor(mode).find((stage) => stage.phase === phase)?.label ?? "等待处理状态";
}
export function formatReadingElapsed(seconds: number) {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
export function readingPalaceIds(chart: ChartResponse, reading: ReadingOptions) {
  const name = reading.focus === "career" ? "官禄" : reading.focus === "resources" ? "财帛" : reading.focus === "relationships" ? "夫妻" : "命";
  const target = reading.focus === "balanced" ? chart.palaces.find((palace) => palace.id === chart.summary.soulPalaceId) : chart.palaces.find((palace) => palace.name.replace(/宫$/, "") === name);
  return target ? Object.values(target.surroundedPalaces) : [];
}
