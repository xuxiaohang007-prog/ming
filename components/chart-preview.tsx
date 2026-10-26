const branches = ["巳", "午", "未", "申", "辰", "酉", "卯", "戌", "寅", "丑", "子", "亥"];
const cells = [[1, 1], [2, 1], [3, 1], [4, 1], [1, 2], [4, 2], [1, 3], [4, 3], [1, 4], [2, 4], [3, 4], [4, 4]];

export function ChartPreview({ status = "idle" }: { status?: "idle" | "loading" | "ready" }) {
  return (
    <aside className="preview-panel" aria-label="等待生成的命盘预览" data-preview-status={status} aria-busy={status === "loading"}>
      <div className="preview-top"><p className="eyebrow">The Twelve Palaces</p><span className="status-tag" role="status" aria-live="polite">{status === "loading" ? "正在整理出生信息" : status === "ready" ? "命盘已生成" : "等待出生信息"}</span></div>
      <div className="ziwei-grid preview-grid" aria-hidden="true">
        <div className="ziwei-center preview-center"><span className="mini-seal">本命</span><h3>十二宫<br />一张命盘</h3><p>以出生时刻为起点</p></div>
        {cells.map(([column, row], index) => <div key={branches[index]} className="preview-palace" style={{ gridColumn: column, gridRow: row, animationDelay: `${index * 80}ms` }}><span>{branches[index]}</span><span className="preview-line" /></div>)}
      </div>
      <div className="preview-caption"><span className="mini-seal" aria-hidden="true">观照</span><div><strong>先认识盘面，再阅读自己。</strong><p>这里是十二宫布局预览。填写信息后，将呈现真实宫位与星曜；命宫、身宫与四化各有清晰标记。</p></div></div>
    </aside>
  );
}
