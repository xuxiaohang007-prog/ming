"use client";

import { useEffect, useState } from "react";
import type { ReportSectionData } from "@/lib/types";

export function ReportContents({ sections }: { sections: ReportSectionData[] }) {
  const [activeId, setActiveId] = useState(sections[0].id);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      let active = sections[0].id;
      for (const section of sections) {
        const element = document.getElementById(`report-${section.id}`);
        if (element && element.getBoundingClientRect().top <= 140) active = section.id;
      }
      setActiveId(active);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update(); window.addEventListener("scroll", schedule, { passive: true }); window.addEventListener("resize", schedule);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", schedule); window.removeEventListener("resize", schedule); };
  }, [sections]);
  return <nav aria-label="报告章节" className="report-toc no-print"><p className="eyebrow">阅读目录</p><ol>{sections.map((section, index) => <li key={section.id}><a href={`#report-${section.id}`} aria-current={activeId === section.id ? "location" : undefined} onClick={() => setActiveId(section.id)}><span aria-hidden="true">0{index + 1}</span>{section.title}</a></li>)}</ol></nav>;
}
