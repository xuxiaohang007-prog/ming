import { ChevronDown } from "lucide-react";
import type { ChartResponse } from "@/lib/types";
import { displayGeneratedAt } from "@/lib/display-time";

export function RuleSummary({ chart }: { chart: ChartResponse }) {
  const entries = [
    ["规则版本", chart.ruleVersion],
    ["数据格式", chart.schemaVersion],
    ["生成时间（UTC+8）", displayGeneratedAt(chart.generatedAt)],
    ["排盘库", `iztro ${chart.rules.engineVersion}`],
    ["历法依赖", `lunar-typescript ${chart.rules.calendarVersion}`],
    ["流派与语言", "通行规则 · 简体中文"],
    ["晚子时", "归次日，由排盘库处理"],
    ["年干支分界", "农历正月初一"],
    ["小限虚岁分界", "自然年"],
    ["闰月调整", "前半月按前月，后半月按后月"],
    ["四化与亮度", "iztro 固定版本内置表，无自定义覆盖"]
  ];
  return <details className="rule-summary">
    <summary><span>排盘规则与版本</span><ChevronDown size={15} aria-hidden="true" /></summary>
    <div className="rule-content"><dl>{entries.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <p className="small-note">规则指纹（用于核对版本）</p><code>{chart.ruleHash}</code>
      <p className="small-note">命盘标识（用于核对计算条件）</p><code>{chart.chartId}</code>
      <p className="small-note">当前仅计算本命盘。相同出生条件与规则可复现同一盘面。</p>
    </div>
  </details>;
}
