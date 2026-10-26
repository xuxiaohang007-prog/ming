"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { Maximize2, X } from "lucide-react";
import type { ChartResponse, ChartStar } from "@/lib/types";
import { palaceLabel } from "@/lib/contract-version";
import { readingPhaseLabel } from "@/lib/reading-status";
import type { InterpretMode, InterpretProgress } from "@/lib/interpret-stream";
import { PeriodExplorer } from "@/components/period-explorer";

const positions = [[1, 4], [1, 3], [1, 2], [1, 1], [2, 1], [3, 1], [4, 1], [4, 2], [4, 3], [4, 4], [3, 4], [2, 4]];
const transformationLabels: Record<string, string> = { "禄": "化禄", "权": "化权", "科": "化科", "忌": "化忌" };
function Mutagen({ value }: { value: string }) {
  return <span className={`mutagen-badge mutagen-${value}`} aria-label={transformationLabels[value] ?? value}>{value}</span>;
}
function StarContent({ star }: { star: ChartStar }) {
  return <>{star.name}{star.brightness && <small className="star-brightness" aria-label={`亮度：${star.brightness}`}>{star.brightness}</small>}{star.mutagen && <Mutagen value={star.mutagen} />}</>;
}

function StarList({ title, stars, focusedEvidenceId, focusedLabel = "报告引用" }: { title: string; stars: ChartStar[]; focusedEvidenceId?: string | null; focusedLabel?: string }) {
  return <div className="star-group"><h4>{title}</h4><div className="star-chips">
    {stars.length ? stars.map((star) => <span key={star.id} data-evidence-id={star.id} className={`star-chip ${focusedEvidenceId === star.id ? "evidence-highlight" : ""}`}><StarContent star={star} />{focusedEvidenceId === star.id && <small>{focusedLabel}</small>}</span>) : <p className="small-note">无</p>}
  </div></div>;
}

export function AstroChart({ chart, sidebar, initialPalaceIndex, focusedEvidenceId, readingState }: { chart: ChartResponse; sidebar?: ReactNode; initialPalaceIndex?: number; focusedEvidenceId?: string | null; readingState?: { mode: InterpretMode; phase: InterpretProgress["phase"]; palaceIds: string[] } }) {
  const initial = initialPalaceIndex ?? chart.palaces.find((palace) => palace.earthlyBranch === chart.earthlyBranchOfSoulPalace)?.index ?? 0;
  const [selectedIndex, setSelectedIndex] = useState(initial);
  const [expanded, setExpanded] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [showRelations, setShowRelations] = useState(true);
  const [fullStars, setFullStars] = useState(false);
  const [periodEvidenceId, setPeriodEvidenceId] = useState<string | null>(null);
  const selectedEvidenceId = periodEvidenceId ?? focusedEvidenceId;
  const dialog = useRef<HTMLDialogElement>(null);
  const selected = chart.palaces.find((palace) => palace.index === selectedIndex)!;
  const opposite = chart.palaces.find((palace) => palace.id === selected.surroundedPalaces.opposite)!;
  const mainStars = selected.majorStars.filter((star) => star.type === "major");
  const supplementary = [...selected.majorStars.filter((star) => star.type !== "major"), ...selected.minorStars];
  const relatedIds = Object.values(selected.surroundedPalaces);
  useEffect(() => {
    if (initialPalaceIndex === undefined) return;
    document.getElementById("palace-detail")?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [initialPalaceIndex]);

  useEffect(() => {
    if (!expanded) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [expanded]);

  function openChart() { setZoom(100); setExpanded(true); dialog.current?.showModal(); }

  function selectPalace(index: number, inDialog = false, scroll = true) {
    setSelectedIndex(index);
    if (scroll && window.matchMedia("(max-width: 767px)").matches) {
      requestAnimationFrame(() => document.getElementById(inDialog ? "expanded-palace-detail" : "palace-detail")?.scrollIntoView({ block: "nearest", behavior: "auto" }));
    }
  }

  function navigatePalace(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    let target = -1;
    if (event.key === "Home") target = chart.palaces.findIndex((palace) => palace.id === chart.summary.soulPalaceId);
    else if (directions[event.key]) {
      const [dx, dy] = directions[event.key];
      const [x, y] = positions[index];
      // Skip the central information cells, following the physical grid direction.
      for (let distance = 1; distance < 4 && target < 0; distance++) target = positions.findIndex(([column, row]) => column === x + dx * distance && row === y + dy * distance);
    } else return;
    event.preventDefault();
    if (target < 0) return;
    selectPalace(target, false, false);
    event.currentTarget.closest(".ziwei-grid")?.querySelector<HTMLButtonElement>(`[data-palace-index="${target}"]`)?.focus();
  }

  function renderControls(inDialog = false) {
    return <div className="chart-display-controls" aria-label={inDialog ? "放大盘面显示设置" : "盘面显示设置"}>
      <button type="button" aria-pressed={showRelations} onClick={() => setShowRelations(!showRelations)}>三方四正{showRelations ? " · 开" : " · 关"}</button>
      <button type="button" aria-pressed={fullStars} onClick={() => setFullStars(!fullStars)}>完整星曜{fullStars ? " · 开" : " · 关"}</button>
      <span className="small-note">点击查看宫位 · 方向键移动 · Home 回命宫</span>
    </div>;
  }

  function renderGrid(inDialog = false) {
    return <div className="ziwei-grid" aria-label="紫微十二宫命盘" data-reading-phase={readingState?.phase} style={inDialog ? { width: `${zoom}%` } : undefined}>
      <div className="ziwei-center"><p className="eyebrow">本命 / Origin</p><h3>{chart.form.name || "命主"}</h3><div className="center-divider" /><p>命主 {chart.soul} · 身主 {chart.body}<br />{chart.fiveElementsClass}<br />{chart.solarDate} · {chart.time}<br />{chart.lunarDate}<br /><span className="small-note">UTC+08:00 · 本命盘</span></p>{readingState && <span className="center-reading-label" aria-hidden="true">{readingPhaseLabel(readingState.mode, readingState.phase)}</span>}</div>
      {chart.palaces.map((palace) => {
        const [column, row] = positions[palace.index];
        const soul = palace.earthlyBranch === chart.earthlyBranchOfSoulPalace;
        const core = palace.majorStars.filter((star) => star.type === "major");
        const auxiliary = [...palace.majorStars.filter((star) => star.type !== "major"), ...palace.minorStars];
        const related = showRelations && relatedIds.includes(palace.id);
        const relationship = palace.id === selected.surroundedPalaces.opposite ? "对宫" : "三合";
        return <button key={palace.id} type="button" data-evidence-id={palace.id} data-palace-index={palace.index} onClick={() => selectPalace(palace.index, inDialog)} onKeyDown={(event) => navigatePalace(event, palace.index)} aria-pressed={selectedIndex === palace.index} aria-controls={inDialog ? "expanded-palace-detail" : "palace-detail"}
          className={`ziwei-palace ${soul ? "ziwei-soul" : ""} ${related ? "ziwei-related" : ""} ${selectedIndex === palace.index ? "ziwei-selected" : ""} ${readingState?.palaceIds.includes(palace.id) && readingState.phase === "prepared" ? "ziwei-reading-highlight" : ""}`} style={{ gridColumn: column, gridRow: row, animationDelay: `${palace.index * 22}ms` }}>
          <span className="palace-top"><strong>{palaceLabel(palace.name)}</strong><small>{palace.heavenlyStem}{palace.earthlyBranch}</small></span>
          <span className="palace-stars">{core.length ? core.map((star) => <span className="star-name" key={star.id}><StarContent star={star} /></span>) : <span className="empty-palace">空宫<small>无十四主星</small></span>}</span>
          {!!auxiliary.length && <span className="palace-auxiliary">{auxiliary.map((star) => <span className="star-name" key={star.id}><StarContent star={star} /></span>)}</span>}
          {fullStars && !!palace.adjectiveStars.length && <span className="palace-adjective">{palace.adjectiveStars.map((star) => <span className="star-name" key={star.id}><StarContent star={star} /></span>)}</span>}
          {related && selectedIndex !== palace.index && <span className="relation-badge">{relationship}</span>}
          {palace.isBodyPalace && <span className="body-badge">身宫</span>}
        </button>;
      })}
    </div>;
  }

  function renderDetail(inDialog = false) {
    return <section id={inDialog ? "expanded-palace-detail" : "palace-detail"} aria-label={inDialog ? "放大宫位详情" : "宫位详情"} className="paper-panel palace-detail" aria-live="polite">
      <div className="detail-header"><div><p className="eyebrow">Selected Palace</p><h3>{palaceLabel(selected.name)}</h3></div><p>{selected.heavenlyStem}{selected.earthlyBranch}{selected.isBodyPalace ? " · 身宫" : ""}</p></div>
      {!mainStars.length && <div className="empty-palace-note"><strong>空宫 · 无十四主星</strong><p>本宫仍可能有辅星或杂曜；不等于没有信息。</p><div className="borrowed-stars" aria-label="对宫参考主星"><p>对宫参考：{palaceLabel(opposite.name)}（不计入本宫星曜）</p><StarList title="仅供合参，亮度与四化属于对宫原位" stars={opposite.majorStars.filter((star) => star.type === "major")} /></div></div>}
      <StarList title="十四主星" stars={mainStars} focusedEvidenceId={selectedEvidenceId} focusedLabel={periodEvidenceId ? "运限资料定位" : "报告引用"} /><StarList title="辅星与禄存、天马" stars={supplementary} focusedEvidenceId={selectedEvidenceId} focusedLabel={periodEvidenceId ? "运限资料定位" : "报告引用"} /><StarList title="杂曜" stars={selected.adjectiveStars} focusedEvidenceId={selectedEvidenceId} focusedLabel={periodEvidenceId ? "运限资料定位" : "报告引用"} />
      <nav className="palace-relations" aria-label={inDialog ? "放大宫位三方四正" : "宫位三方四正"}><h4>三方四正 · 关联阅读</h4><p>本宫、对宫与两个三合宫；名称是实际宫位。</p><div>{([ ["target", "本宫"], ["opposite", "对宫"], ["career", "三合一"], ["wealth", "三合二"] ] as const).map(([key, label]) => {
        const palace = chart.palaces.find((item) => item.id === selected.surroundedPalaces[key])!;
        return <button type="button" key={key} onClick={() => selectPalace(palace.index, inDialog)} aria-current={key === "target" ? "true" : undefined}><small>{label} · {palace.earthlyBranch}</small>{palaceLabel(palace.name)}</button>;
      })}</div></nav>
      <details className="palace-glossary"><summary>读盘术语与标记说明</summary><dl><dt>主星与空宫</dt><dd>主星按库的 major 类型识别。禄存、天马保留原始分组与类型，但不充作十四主星。</dd><dt>亮度</dt><dd>庙、旺、得、利、平、不、陷等标记直接来自库；不转成分数，不作为单一吉凶结论。</dd><dt>四化</dt><dd>禄、权、科、忌分别为化禄、化权、化科、化忌。以文字和颜色共同区分，空值不补造。</dd><dt>三方四正</dt><dd>由 iztro 的 surroundedPalaces 返回。本页仅展示本命关系，不代表流年或事件预测。</dd></dl></details>
    </section>;
  }

  return <>
    <div className="chart-layout">
      <div className="paper-panel chart-board"><div className="chart-toolbar"><p className="eyebrow">十二宫 / Astrolabe</p><button type="button" className="button-secondary" onClick={openChart} aria-haspopup="dialog"><Maximize2 size={14} />放大查看命盘</button></div>
        {renderControls()}{renderGrid()}<div className="chart-legend"><span><i className="legend-mark" />金框标记命宫</span><span>身宫另附标签</span><span>浅青标记三方四正</span><span><Mutagen value="禄" /><Mutagen value="权" /><Mutagen value="科" /><Mutagen value="忌" /> 四化</span></div>
        <PeriodExplorer key={`${chart.chartId}:${chart.generatedAt}`} chart={chart} onClearEvidence={() => setPeriodEvidenceId(null)} onEvidenceSelect={(id) => {
          const item = chart.evidence.find((entry) => entry.id === id);
          if (!item) return;
          setPeriodEvidenceId(id); selectPalace(item.palaceIndex, false, false);
          requestAnimationFrame(() => document.getElementById("palace-detail")?.scrollIntoView({ block: "nearest", behavior: "auto" }));
        }} />
      </div>
      <aside className="chart-sidebar">{renderDetail()}{sidebar}</aside>
    </div>
    <dialog ref={dialog} className="chart-dialog" aria-label="放大命盘" onClose={() => setExpanded(false)} onClick={(event) => { if (event.target === dialog.current) dialog.current.close(); }}>
      {expanded && <>
        <div className="dialog-header"><h3>十二宫 · 放大查看</h3><button type="button" className="button-secondary" onClick={() => dialog.current?.close()} aria-label="关闭放大命盘"><X size={18} /></button></div>
        <div className="zoom-controls"><label>盘面缩放<input type="range" min="100" max="160" step="10" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label><span className="small-note">{zoom}% · 小屏可横向滚动</span></div>
        {renderControls(true)}
        <div className="zoom-scroll" tabIndex={0} aria-label="放大命盘，可横向滚动">{renderGrid(true)}</div>
        <div className="mt-4">{renderDetail(true)}</div>
      </>}
    </dialog>
  </>;
}
