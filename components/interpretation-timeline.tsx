"use client";

import { useEffect, useState } from "react";
import { Check, Clock3 } from "lucide-react";
import { formatReadingElapsed, readingPhaseLabel, readingStagesFor } from "@/lib/reading-status";
import type { InterpretMode, InterpretProgress } from "@/lib/interpret-stream";

export function InterpretationTimeline({ mode = "demo", progress = { phase: "requesting", characters: 0 }, startedAt, active = true, reportReady = false }: { mode?: InterpretMode; progress?: InterpretProgress; startedAt?: number | null; active?: boolean; reportReady?: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!active) return;
    const start = startedAt ?? performance.now();
    const update = () => setElapsed(Math.max(0, Math.floor((performance.now() - start) / 1000)));
    update(); const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startedAt, active]);
  const stages = readingStagesFor(mode);
  const currentIndex = stages.findIndex((stage) => stage.phase === progress.phase);
  const label = reportReady ? "报告已生成" : active ? readingPhaseLabel(mode, progress.phase) : "等待已停止";
  return (
    <div className="interpretation-status" data-phase={progress.phase} data-active={active ? "true" : "false"}>
      <p className="eyebrow">03 / Reading</p>
      <div className="reading-orbit" aria-hidden="true">
        <span className="reading-halo" />
        <svg viewBox="0 0 160 160" fill="none"><circle cx="80" cy="80" r="68" /><circle cx="80" cy="80" r="54" strokeDasharray="1 7" /><path d="M32 32l96 96M32 128l96-96M12 80h136M80 12v136" />{Array.from({ length: 12 }, (_, index) => {
          const angle = index * Math.PI / 6;
          return <circle key={index} className="orbit-point" cx={80 + 68 * Math.cos(angle)} cy={80 + 68 * Math.sin(angle)} r="2" style={{ animationDelay: `${index * 90}ms` }} />;
        })}</svg>
        <span className="reading-seal">{reportReady ? <Check size={26} /> : mode === "rules" ? "规则" : mode === "ai" ? "解读" : "示例"}</span>
      </div>
      <h3>{reportReady ? "报告已生成" : !active ? "等待已停止" : mode === "rules" ? "本地规则解读" : mode === "ai" ? "命盘阅读" : "示例报告整理"}</h3>
      <p role="status" aria-live="polite" aria-atomic="true" className="reading-current-status">{label}</p>
      <p>命盘与出生信息保留在页面。如果继续查看宫位，完成后会提示你打开报告，不打断阅读。</p>
      <div className="reading-runtime"><span role="timer" aria-live="off" className="reading-clock"><Clock3 size={13} />已等待 {formatReadingElapsed(elapsed)}</span>{mode === "ai" && <span aria-live="off" className="small-note">已接收 {progress.characters} 个字符</span>}</div>
      <div className="loading-track" aria-hidden="true"><span className="loading-line" /></div>
      <ol className="interpret-steps" aria-label="解读处理阶段">{stages.map((stage, index) => {
        const state = reportReady || index < currentIndex ? "done" : index === currentIndex ? "current" : "pending";
        const name = stage.label.replace(/^正在/, "").replace(/已核对$/, "核对");
        return <li key={stage.phase} data-step-state={state} aria-current={state === "current" ? "step" : undefined} className={state === "done" ? "step-complete" : ""}><span>{state === "done" ? <Check size={13} /> : String(index + 1).padStart(2, "0")}</span>{state === "current" ? stage.label : state === "done" ? `${name} · 已完成` : name}</li>;
      })}</ol>
      {active && elapsed >= 10 && <div className="reading-slow-note" role="status" aria-live="polite"><p>等待时间稍长</p><p>{mode === "ai" ? "仍在等待服务响应，不代表新的处理进度。" : "本地整理通常较快，当前响应较慢。"}可以继续看盘，也可以取消后重试。</p></div>}
      <p className="small-note">{mode === "ai" ? "只展示完整校验的报告，不显示模型内部思考或未校验文本。" : mode === "rules" ? "按预置规则处理，未调用大模型，也不需要模型安装。" : "本次是固定流程示例，不调用模型。"}</p>
    </div>
  );
}
