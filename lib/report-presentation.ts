import type { InterpretationResponse } from "./types";
import type { ReportSectionId } from "./reading-contract";

export function reportSourceLabel(source: InterpretationResponse["source"]) {
  return source === "rules" ? "本地规则参考" : source === "ai" ? "AI 解释" : "流程示例";
}
export function reportOverviewSections(report: InterpretationResponse) {
  const middle: ReportSectionId = report.reading.focus === "balanced" ? "career" : report.reading.focus;
  return (["personality", middle, "actions"] as ReportSectionId[]).map((id) => report.sections.find((section) => section.id === id)!);
}
