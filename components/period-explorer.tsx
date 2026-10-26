"use client";

import { useEffect, useRef, useState } from "react";
import type { ChartResponse } from "@/lib/types";
import { canonicalDate, periodBindingIssue, periodDateSchema, periodResponseSchema } from "@/lib/period-contract";
import type { PeriodResponse } from "@/lib/period-contract";
import { palaceLabel } from "@/lib/contract-version";
import { periodReportBindingIssue, periodReportSchema } from "@/lib/period-report-contract";
import type { PeriodReport, PeriodReportReference } from "@/lib/period-report-contract";
import { PeriodReportDialog } from "@/components/period-report-dialog";

export function PeriodExplorer({ chart, onEvidenceSelect, onClearEvidence }: { chart: ChartResponse; onEvidenceSelect: (id: string) => void; onClearEvidence?: () => void }) {
  const [date, setDate] = useState("");
  const [result, setResult] = useState<PeriodResponse | null>(null);
  const [scope, setScope] = useState<"decadal" | "yearly">("yearly");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const active = useRef<AbortController | null>(null);
  const reportRequest = useRef<AbortController | null>(null);
  const [report, setReport] = useState<PeriodReport | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportPending, setReportPending] = useState(false);
  const [reportError, setReportError] = useState("");
  const [highlight, setHighlight] = useState<string | null>(null);
  const minimum = canonicalDate(chart.solarDate), supported = minimum <= "2100-12-31";
  useEffect(() => {
    const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const value = ["year", "month", "day"].map((type) => parts.find((part) => part.type === type)!.value).join("-");
    setDate(value < minimum ? minimum : value > "2100-12-31" ? "2100-12-31" : value);
    return () => { active.current?.abort(); active.current = null; reportRequest.current?.abort(); reportRequest.current = null; };
  }, [minimum]);

  function cancel() {
    active.current?.abort(); active.current = null; setPending(false);
  }
  function changeDate(value: string) {
    cancel(); clearReport(); setDate(value); setResult(null); setError(""); setNotice("日期已修改，旧运限资料与报告已清除，请重新获取。");
  }
  function cancelReport() { reportRequest.current?.abort(); reportRequest.current = null; setReportPending(false); }
  function clearReport() {
    cancelReport(); setReport(null); setReportOpen(false); setReportError(""); setHighlight(null); onClearEvidence?.();
  }
  function chooseScope(value: "yearly" | "decadal") {
    if (value === scope) return;
    clearReport(); setScope(value); setNotice("已切换运限层级，旧报告失效，可生成当前层级报告。");
  }
  async function loadReport() {
    if (!result || reportRequest.current) return;
    const controller = new AbortController(); reportRequest.current = controller;
    setReport(null); setReportOpen(false); setReportPending(true); setReportError("");
    const timeout = setTimeout(() => controller.abort(new Error("timeout")), 15000);
    try {
      const response = await fetch("/api/chart/period/report", { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ form: chart.form, chartId: chart.chartId, ruleHash: chart.ruleHash, analysisDate: result.analysis.solarDate, periodId: result.periodId, scope }) });
      const payload = await response.json().catch(() => { throw new Error("报告响应格式无效，请重试；当前资料已保留。"); });
      if (!response.ok) throw new Error(["RULES_CHANGED", "CHART_MISMATCH"].includes(payload?.code) ? "命盘或规则已变化，请重新排盘后获取运限资料。" : payload?.code === "PERIOD_MISMATCH" ? "运限日期已变化，请重新获取资料后生成报告。" : "运限报告生成失败，请重试；当前资料已保留。");
      const validated = periodReportSchema.safeParse(payload);
      if (!validated.success || periodReportBindingIssue(validated.data, chart, result, scope)) throw new Error("运限报告的日期、层级、事实、引用或规则不一致，请重试。");
      if (reportRequest.current !== controller || controller.signal.aborted) return;
      setReport(validated.data); setReportOpen(true);
    } catch (failure) {
      if (reportRequest.current === controller) setReportError(controller.signal.aborted ? "运限报告请求超时，请重试。" : failure instanceof Error ? failure.message : "运限报告生成失败，请重试。");
    } finally {
      clearTimeout(timeout);
      if (reportRequest.current === controller) { reportRequest.current = null; setReportPending(false); }
      controller.abort();
    }
  }
  function viewReportReference(reference: PeriodReportReference) {
    setReportOpen(false);
    if (reference.kind.startsWith("natal") && reference.natalEvidenceId) { onEvidenceSelect(reference.natalEvidenceId); return; }
    if (reference.palaceIndex !== null && result) {
      const id = `${result.periodId}:${scope}:p:${reference.palaceIndex}`;
      setHighlight(reference.kind === "flow-star" ? reference.id : id);
      requestAnimationFrame(() => { const target = document.getElementById(id); target?.scrollIntoView({ block: "center", behavior: "auto" }); target?.focus({ preventScroll: true }); });
    } else requestAnimationFrame(() => document.querySelector(".period-summary")?.scrollIntoView({ block: "center", behavior: "auto" }));
  }
  async function load() {
    if (active.current) return;
    clearReport();
    setError(""); setNotice("");
    const parsedDate = periodDateSchema.safeParse(date);
    if (!parsedDate.success || date < minimum) {
      setError(!parsedDate.success ? parsedDate.error.issues[0].message : "分析日期不能早于公历出生日期。"); return;
    }
    const controller = new AbortController(); active.current = controller;
    setResult(null); setPending(true);
    const timeout = setTimeout(() => controller.abort(new Error("获取运限资料超时，请重试。")), 15000);
    try {
      const response = await fetch("/api/chart/period", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ form: chart.form, chartId: chart.chartId, ruleHash: chart.ruleHash, analysisDate: date }), signal: controller.signal });
      const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error.slice(0, 200) : "获取运限资料失败，请重试。");
      const validated = periodResponseSchema.safeParse(payload);
      if (!validated.success || periodBindingIssue(validated.data, chart, date)) throw new Error("运限资料与当前命盘、日期或规则不一致，请重试。");
      if (active.current !== controller || controller.signal.aborted) return;
      setResult(validated.data); setNotice("运限资料已校验。本命命盘和六章解读报告未改变。");
    } catch (failure) {
      if (active.current === controller) setError(controller.signal.aborted ? "获取运限资料超时，请重试。" : failure instanceof Error ? failure.message : "获取运限资料失败，请重试。");
    } finally {
      clearTimeout(timeout);
      if (active.current === controller) { active.current = null; setPending(false); }
      controller.abort();
    }
  }
  const layer = result?.[scope];
  return <details className="period-explorer no-print">
    <summary><span>时间切片 / 运限资料</span><small>按日期查看大限与流年</small></summary>
    <section aria-label="运限资料" className="period-content">
      <div className="period-intro"><p className="eyebrow">Time Atlas</p><h3>换一个日期，核对运限位置。</h3><p>仍由 iztro 本地计算。上方始终是本命盘；流曜在此独立列出，不改写本命星曜或已有报告。</p></div>
      <div className="period-input"><label htmlFor="period-date">公历分析日期<input id="period-date" className="input-core" type="date" min={minimum} max="2100-12-31" value={date} onChange={(event) => changeDate(event.target.value)} disabled={!supported} aria-describedby="period-date-hint" /></label>
        <button type="button" className="button-primary" onClick={load} disabled={!supported || pending}>{pending ? "正在计算运限…" : "获取运限资料"}</button>
        {pending && <button type="button" className="button-secondary" onClick={() => { cancel(); setNotice("已取消获取运限资料。"); }}>取消获取运限</button>}
      </div>
      <p id="period-date-hint" className="small-note">UTC+8 · 流年与虚岁以农历正月初一为界；不按公历元旦或生日切换。{!supported && "该命盘公历生日超出本步分析范围，暂不支持运限。"}</p>
      {pending && <p role="status" className="period-status">正在计算当前日期的运限资料，可以取消或更换日期。</p>}
      {notice && <p role="status" className="period-status">{notice}</p>}
      {error && <p role="alert" className="period-error">{error}</p>}
      {result && layer && <div className="period-result" data-period-id={result.periodId}>
        <dl className="period-summary"><div><dt>已确认分析日期</dt><dd>{result.analysis.solarDate}</dd><small>{result.analysis.lunarDate}</small></div><div><dt>当前虚岁（非周岁）</dt><dd>{result.nominalAge} 岁</dd></div><div><dt>流年干支</dt><dd>{result.yearly.heavenlyStem}{result.yearly.earthlyBranch}</dd><small>来源：iztro {result.engineVersion}</small></div></dl>
        <nav className="period-tabs" aria-label="运限层级"><button type="button" aria-pressed={scope === "yearly"} onClick={() => chooseScope("yearly")}>流年资料</button><button type="button" aria-pressed={scope === "decadal"} onClick={() => chooseScope("decadal")}>大限／童限资料</button></nav>
        <div className="period-layer-heading"><h4>{layer.name} · {layer.heavenlyStem}{layer.earthlyBranch}</h4><p>{layer.ageRange ? `虚岁 ${layer.ageRange[0]} 至 ${layer.ageRange[1]} 岁` : layer.name === "童限" ? "尚未起大限，按库返回的童限单独标识。" : "当前农历年份的宫位与流曜资料。"}</p></div>
        <p className="note-label">{layer.name}四化 · 定位到本命星曜，不改写本命四化</p>
        <div className="period-mutagens">{layer.mutagens.map((item) => <div key={item.label}><span className={`mutagen-badge mutagen-${item.label}`}>化{item.label}</span><strong>{item.star}</strong>{item.natalStarIds.map((id) => <button type="button" key={id} onClick={() => onEvidenceSelect(id)}>{chart.evidence.find((entry) => entry.id === id)!.label}</button>)}</div>)}</div>
        <div className="period-palaces">{layer.palaces.map((palace) => <article key={palace.natalPalaceId} id={`${result.periodId}:${scope}:p:${palace.index}`} tabIndex={-1} className={`period-palace ${highlight === `${result.periodId}:${scope}:p:${palace.index}` ? "period-reference-highlight" : ""}`} data-period-palace-index={palace.index}><header><h5>{layer.name}{palaceLabel(palace.name)}</h5><span>{chart.palaces[palace.index].earthlyBranch}</span></header><button type="button" onClick={() => onEvidenceSelect(palace.natalPalaceId)}>本命位置：{palaceLabel(chart.palaces[palace.index].name)}</button><p>{palace.stars.length ? palace.stars.map((star, index) => <span key={star.id} data-period-flow-id={star.id} className={highlight === star.id ? "period-reference-highlight" : ""}>{index > 0 && " · "}{star.name}</span>) : "本层无流曜"}</p></article>)}</div>
        <details className="period-timeline"><summary>十二个大限区间 · 按虚岁排序</summary><p className="small-note">下列年份为虚岁对应的名义农历年份范围，不是精确公历起止日。</p><ol>{result.timeline.map((item) => <li key={item.index} className={result.decadal.name === "大限" && result.decadal.index === item.index ? "is-current" : ""}><strong>{item.ageRange[0]} 至 {item.ageRange[1]} 岁</strong><span>{item.yearRange[0]} 至 {item.yearRange[1]} 年</span><button type="button" onClick={() => onEvidenceSelect(item.natalPalaceId)}>{palaceLabel(chart.palaces[item.index].name)} · {chart.palaces[item.index].earthlyBranch}</button></li>)}</ol></details>
        <ul className="period-limitations">{result.limitations.map((text) => <li key={text}>{text}</li>)}</ul>
        <div className="period-report-controls"><button type="button" className="button-primary" disabled={reportPending} onClick={loadReport}>{reportPending ? "正在整理运限报告…" : "生成运限规则报告"}</button>{reportPending && <button type="button" className="button-secondary" onClick={() => { cancelReport(); setReportError(""); setNotice("已取消运限报告请求，计算资料已保留。"); }}>取消运限报告</button>}{report && <button type="button" className="button-secondary" onClick={() => setReportOpen(true)}>查看已有运限报告</button>}</div>
        {reportPending && <p className="period-report-loading" role="status">正在核对运限资料并整理本地规则报告，未调用大模型。</p>}
        {reportError && <p className="period-error" role="alert">{reportError}</p>}
        <p className="small-note">运限协议 {result.schemaVersion} · 排盘规则 {result.ruleVersion} · 报告独立于本命六章</p>
      </div>}
      {reportOpen && report && <PeriodReportDialog report={report} chart={chart} onClose={() => setReportOpen(false)} onReference={viewReportReference} />}
    </section>
  </details>;
}
