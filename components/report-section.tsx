import { motion, useReducedMotion } from "framer-motion";
import { ChartEvidence, ReportSectionData } from "@/lib/types";
import { MAJOR_STAR_RULES } from "@/lib/interpretation-rulebook";

type ReportSectionProps = {
  section: ReportSectionData;
  source?: "demo" | "ai" | "rules";
  evidence?: ChartEvidence[];
  onEvidenceSelect?: (id: string) => void;
};

export function ReportSection({ section, source = "demo", evidence = [], onEvidenceSelect }: ReportSectionProps) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.section
      id={`report-${section.id}`}
      tabIndex={-1}
      className="paper-panel print-surface report-section"
      initial={false}
      whileInView={reduceMotion ? undefined : { y: [6, 0] }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.65, ease: "easeOut" }}
    >
      <p className="eyebrow">{section.eyebrow}</p>
      <h3>{section.title}</h3>
      <p className="report-section-summary">{section.summary}</p>
      <div className="report-facts" aria-label={`${section.title}盘面事实`}><p className="note-label">可核对的盘面事实 · iztro 实际输出</p><ul>{section.facts.map((fact) => <li key={fact.id} data-fact-id={fact.id}>{fact.text}</li>)}</ul></div>
      <p className="report-body-label">{source === "ai" ? "AI 解释 · 不同于计算事实，可能存在偏差" : source === "rules" ? "本地规则参考 · 产品预置提示，未调用大模型" : "说明与解读 · 当前为固定流程示例"}</p>
      <p className="report-body">{section.body}</p>
      {source === "rules" && <p className="print-only report-rule-proof">本节规则依据：{section.appliedRules?.length ? section.appliedRules.map((match) => `${evidence.find((item) => item.id === match.starId)?.label}（${match.ruleId}）`).join("；") : "没有本宫十四主星匹配，不补造提示。"}</p>}
      {source === "rules" && <details className="rule-audit"><summary>查看规则匹配依据 · {section.appliedRules?.length ?? 0} 条</summary><ul>{section.appliedRules?.map((match) => {
        const rule = MAJOR_STAR_RULES.find((item) => item.id === match.ruleId)!;
        const target = evidence.find((item) => item.id === match.starId);
        return <li key={match.starId}><p>{target?.label} · {rule.theme}</p><code>{rule.id}</code><button type="button" className="button-secondary evidence-button no-print" onClick={() => onEvidenceSelect?.(match.starId)}>查看规则依据：{target?.label}</button></li>;
      })}</ul>{!section.appliedRules?.length && <p>没有匹配到本宫主星规则，不补造提示；对宫参考仅保留在事实框。</p>}</details>}
      <div className="report-note">
        <p className="note-label">
          本节提示
        </p>
        <p>{section.bullet}</p>
      </div>
      {evidence.length > 0 && <div className="evidence-links no-print"><p className="note-label">相关盘面 · 查看实际宫位与星曜</p><div>{evidence.map((item) => <button key={item.id} type="button" className="button-secondary evidence-button" onClick={() => onEvidenceSelect?.(item.id)} aria-label={`查看相关盘面：${item.label}`}>{item.label}</button>)}</div></div>}
    </motion.section>
  );
}
