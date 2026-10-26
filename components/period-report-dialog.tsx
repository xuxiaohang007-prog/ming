"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { ChartResponse } from "@/lib/types";
import type { PeriodReport, PeriodReportReference } from "@/lib/period-report-contract";
import { displayGeneratedAt } from "@/lib/display-time";

function ReportContent({ report, chart, print = false, onReference }: { report: PeriodReport; chart: ChartResponse; print?: boolean; onReference: (reference: PeriodReportReference) => void }) {
  return <div className="period-report-content">
    <header className="period-report-cover"><p className="eyebrow">Period Reading / 时间阅读档案</p><p className="period-report-source">本地运限规则参考 · 未调用大模型 · 5 章已校验</p><h2 tabIndex={-1}>{report.headline}</h2><p>{report.abstract}</p>
      <dl className="period-report-summary"><div><dt>公历分析日期</dt><dd>{report.analysis.solarDate}</dd></div><div><dt>阅读层级</dt><dd>{report.scope === "yearly" ? "流年" : "大限／童限"}</dd></div><div><dt>当前虚岁（非周岁）</dt><dd>{report.nominalAge} 岁</dd></div></dl>
      <p className="small-note">报告生成：<time dateTime={report.generatedAt}>{displayGeneratedAt(report.generatedAt)}（UTC+8）</time></p>
      <aside className="period-report-limits" aria-label="运限报告范围"><ul>{report.limitations.map((text) => <li key={text}>{text}</li>)}</ul></aside>
    </header>
    {!print && <nav className="period-report-toc no-print" aria-label="运限报告章节">{report.sections.map((section) => <a key={section.id} href={`#period-report-${section.id}`}>{section.title}</a>)}</nav>}
    {report.sections.map((section, index) => {
      const refs = [...new Set(section.facts.flatMap((fact) => fact.referenceIds))].map((id) => report.references.find((entry) => entry.id === id)!);
      return <section className="period-report-chapter" key={section.id} id={print ? undefined : `period-report-${section.id}`} tabIndex={print ? undefined : -1}>
        <p className="eyebrow">0{index + 1} / Period Notes</p><h3>{section.title}</h3><p className="period-report-chapter-summary">{section.summary}</p>
        <div className="period-report-facts"><p className="note-label">可核对的计算事实 · iztro 实际资料</p><ul>{section.facts.map((fact, position) => <li key={position}>{fact.text}</li>)}</ul></div>
        <p className="note-label">产品规则参考 · 不同于计算事实，不是事件预测</p><p className="period-report-body">{section.body}</p>
        <aside className="period-report-action"><p className="note-label">核对提示</p><p>{section.action}</p></aside>
        <p className="period-report-rule-proof">应用规则：{section.ruleIds.join(" · ")}</p>
        {print ? <p className="period-report-reference-proof">本节依据：{refs.map((entry) => entry.label).join("；")}</p> : <div className="period-report-links no-print" aria-label={`${section.title}依据`}>{refs.map((entry) => <button key={entry.id} type="button" onClick={() => onReference(entry)}>{entry.label}</button>)}</div>}
      </section>;
    })}
    <section className="period-report-archive"><p className="eyebrow">Provenance / 档案与来源</p><h3>核对这份阅读档案</h3>
      <dl><dt>称呼与排盘性别</dt><dd>{chart.form.name || "命主"} · {chart.form.gender}</dd><dt>公历出生条件</dt><dd>{chart.solarDate} · {chart.time} · UTC+8</dd><dt>分析日期与范围</dt><dd>{report.analysis.solarDate} · {report.analysis.lunarDate} · {report.scope === "yearly" ? "流年" : "大限／童限"}</dd>
        <dt>引擎与历法</dt><dd>iztro {report.engineVersion} · lunar-typescript {report.calendarVersion}</dd><dt>协议与规则</dt><dd>{report.schemaVersion}<br />{report.readingVersion}<br />{report.ruleVersion}</dd>
        <dt>完整规则指纹</dt><dd className="provenance-code">{report.ruleHash}</dd><dt>完整命盘标识</dt><dd className="provenance-code">{report.chartId}</dd><dt>完整运限标识</dt><dd className="provenance-code">{report.periodId}</dd><dt>完整报告标识</dt><dd className="provenance-code">{report.reportId}</dd></dl>
      <p className="small-note">以下引用短码以完整命盘标识为前缀拼接还原，不是指纹缩写。计算事实不证明预测未来准确。</p>
      <ul className="period-report-reference-index">{report.references.map((entry) => <li key={entry.id}><span>{entry.label}</span><code>{entry.id.slice(report.chartId.length)}</code></li>)}</ul>
    </section>
  </div>;
}

export function PeriodReportDialog({ report, chart, onClose, onReference }: { report: PeriodReport; chart: ChartResponse; onClose: () => void; onReference: (reference: PeriodReportReference) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const element = dialog.current!;
    returnFocus.current ??= document.activeElement as HTMLElement | null;
    const previousHash = location.hash;
    const overflow = document.body.style.overflow, printTarget = document.body.dataset.printReport;
    document.body.style.overflow = "hidden"; document.body.dataset.printReport = "period";
    element.showModal(); element.querySelector<HTMLHeadingElement>("h2")?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = overflow;
      if (printTarget === undefined) delete document.body.dataset.printReport; else document.body.dataset.printReport = printTarget;
      if (location.hash.startsWith("#period-report-")) history.replaceState(history.state, "", location.pathname + location.search + (previousHash.startsWith("#period-report-") ? "" : previousHash));
      if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(<>
    <dialog ref={dialog} className="period-report-dialog no-print" aria-label="运限规则报告" onClose={onClose} onClick={(event) => { if (event.target === dialog.current) dialog.current?.close(); }}>
      <div className="period-report-toolbar"><strong>独立阅读 · 运限规则报告</strong><button type="button" className="button-secondary" onClick={() => dialog.current?.close()} aria-label="关闭运限报告">关闭</button></div>
      <p className="period-report-print-warning">打印包含称呼、出生条件、分析日期及报告，请谨慎保存与分享。</p>
      <div className="period-report-toolbar"><button type="button" className="button-primary" onClick={() => window.print()}>打印运限报告／另存 PDF</button></div>
      <ReportContent report={report} chart={chart} onReference={onReference} />
    </dialog>
    <section className="period-report-print" aria-label="运限报告打印稿"><ReportContent report={report} chart={chart} print onReference={onReference} /></section>
  </>, document.body);
}
