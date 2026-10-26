"use client";

import { READING_FOCUS, READING_LABELS } from "@/lib/reading-contract";
import type { ReadingOptions } from "@/lib/reading-contract";

export function ReadingOptionsFields({ reading, onChange, ai = false, rules = false }: { reading: ReadingOptions; onChange: (value: ReadingOptions) => void; ai?: boolean; rules?: boolean }) {
  return <fieldset className="reading-options"><legend>这次想关注什么？</legend>
    <label htmlFor="reading-focus">阅读侧重点</label>
    <select id="reading-focus" className="input-core" value={reading.focus} onChange={(event) => onChange({ ...reading, focus: event.target.value as ReadingOptions["focus"] })}>
      {READING_FOCUS.map((focus) => <option value={focus} key={focus}>{READING_LABELS[focus]}</option>)}
    </select>
    <label htmlFor="reading-question">自填问题（选填）</label>
    <textarea id="reading-question" className="input-core" rows={3} maxLength={500} value={reading.question} onChange={(event) => onChange({ ...reading, question: event.target.value })} aria-describedby="reading-question-hint" placeholder="例如：希望从哪些方面整理学习与工作目标？" />
    <p id="reading-question-hint" className="small-note">{reading.question.length}/500 · 请勿填写证件号等敏感信息。{ai ? "问题将与必要命盘材料发送给 OpenAI，不自动附带姓名或出生地点。" : rules ? "问题只作阅读记录；规则版不理解自由提问，不会发送给外部模型。" : "主题仅保留在本次请求与报告中，示例报告不会回答此问题。"}</p>
    <details className="reading-scope"><summary>解读材料与隐私边界</summary><p>材料只包含本命摘要、相关宫位、星曜、亮度、四化、关系与阅读主题。不自动带入姓名、出生地或完整出生档案；自填问题会作为数据保留。</p><p>没有运限与流年资料，不生成事件年份或精确分数。</p></details>
  </fieldset>;
}
