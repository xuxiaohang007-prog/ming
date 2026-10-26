import type { InterpretationResponse } from "@/lib/types";
import { reportOverviewSections, reportSourceLabel } from "@/lib/report-presentation";

export function ReportOverview({ report }: { report: InterpretationResponse }) {
  return <section className="report-overview" aria-label="阅读摘要"><div className="report-overview-heading"><p className="eyebrow">Reading Notes</p><h3>先读三条线索，再展开六章。</h3><p>来自本报告已校验章节，不是新增预测或评分。</p></div>
    <div className="report-overview-cards">{reportOverviewSections(report).map((section, index) => <article className="paper-panel report-overview-card" key={section.id}>
      <p className="overview-card-number">0{index + 1}<span>{reportSourceLabel(report.source)}</span></p><h4>{section.title}</h4><p>{section.summary}</p><div className="overview-card-footer"><span>{section.evidenceIds.length} 项盘面依据</span><a href={`#report-${section.id}`} className="no-print">阅读本节</a></div>
    </article>)}</div>
  </section>;
}
