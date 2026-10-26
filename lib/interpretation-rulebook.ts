import type { ChartResponse } from "./types";
import type { ReportSectionId } from "./reading-contract";
import { palaceLabel } from "./contract-version";

export const INTERPRETATION_RULE_VERSION = "ziwei-reading-rules/1.0.0" as const;
export const RULE_MODE_PREFERENCE_KEY = "fortune:reading-mode";
export const MAJOR_STAR_RULES = Object.freeze([
  { id: "major:ziwei", star: "紫微", theme: "目标统筹与责任分配", caution: "避免把所有事情都揽在自己身上", action: "把目标拆成清晰分工，定期检查实际进度" },
  { id: "major:tianji", star: "天机", theme: "方案探索与灵活调整", caution: "留意过度比较方案而迟迟不行动", action: "选择一个小范围试验，用结果决定是否调整" },
  { id: "major:taiyang", star: "太阳", theme: "表达、协作与对外投入", caution: "关注投入与休息的边界", action: "把期待表达清楚，同时保留恢复精力的时间" },
  { id: "major:wuqu", star: "武曲", theme: "执行节奏与资源整理", caution: "不要仅用结果衡量自己与他人", action: "记录实际投入与可控制的步骤，而不是追求命理分数" },
  { id: "major:tiantong", star: "天同", theme: "舒适感与持续节奏", caution: "留意因回避困难而停滞", action: "为困难任务设置一个容易开始的小步骤" },
  { id: "major:lianzhen", star: "廉贞", theme: "边界辨别与原则沟通", caution: "避免把自己的标准当作唯一标准", action: "先确认共同规则，再讨论分歧与调整空间" },
  { id: "major:tianfu", star: "天府", theme: "稳定安排与已有资源", caution: "区分稳妥与拒绝变化", action: "先盘点现有条件，再选择可承担的改进范围" },
  { id: "major:taiyin", star: "太阴", theme: "细节观察与安静反思", caution: "留意未表达的期待和反复内耗", action: "把观察写下来，挑选重要事项主动沟通" },
  { id: "major:tanlang", star: "贪狼", theme: "兴趣探索与关系体验", caution: "避免目标过多导致精力分散", action: "给兴趣排优先级，为当前阶段保留一个重点" },
  { id: "major:jumen", star: "巨门", theme: "问题辨析与观点表达", caution: "注意讨论问题时的措辞与倾听", action: "区分事实、猜测和感受，再提出可验证的问题" },
  { id: "major:tianxiang", star: "天相", theme: "协调分工与规则意识", caution: "避免为了协调而忽略自己的需求", action: "明确角色、任务边界和双方可接受的安排" },
  { id: "major:tianliang", star: "天梁", theme: "经验复盘与支持他人", caution: "先确认对方需要，避免替他人决定", action: "以询问和复盘代替直接替他人作结论" },
  { id: "major:qisha", star: "七杀", theme: "决断与独立尝试", caution: "在行动前核对现实约束", action: "写清目标、边界和退出条件，避免冲动承诺" },
  { id: "major:pojun", star: "破军", theme: "整理旧模式与尝试改变", caution: "避免把改变本身当作目标", action: "说明想解决的问题，小步调整并保留复盘记录" }
] as const);
for (const rule of MAJOR_STAR_RULES) Object.freeze(rule);
export type AppliedInterpretationRule = { ruleId: string; starId: string };

export function collectInterpretationRules(chart: ChartResponse, primaryPalaceIds: string[]): AppliedInterpretationRule[] {
  return primaryPalaceIds.flatMap((id) => {
    const palace = chart.palaces.find((item) => item.id === id);
    return (palace?.majorStars ?? []).filter((star) => star.type === "major").flatMap((star) => {
      const rule = MAJOR_STAR_RULES.find((item) => item.star === star.name);
      return rule ? [{ ruleId: rule.id, starId: star.id }] : [];
    });
  });
}

const sections: Record<ReportSectionId, { summary: string; scope: string; action: string }> = {
  overview: { summary: "从命宫与身宫事实，整理这张本命盘的阅读起点。", scope: "总览先看计算事实，再看下面的产品预置规则；这些文化联想不是对个人能力或命运的判定。", action: "先核对出生条件，选择一项现实目标作观察记录。" },
  personality: { summary: "将命宫的实际主星，转为可自我核对的观察主题。", scope: "本节以命宫原位主星为匹配依据，只提供观察角度，不作性格诊断，也不把对宫参考当成本宫星曜。", action: "选择一条与你实际经历相关的提示，记录符合和不符合的例子。" },
  career: { summary: "结合官禄宫实际主星，整理学习与工作行动线索。", scope: "本节的联想用于梳理工作和学习方式，不预测职业、考试结果、升职时间或流年趋势。", action: "用实际技能、任务要求和反馈，检验适合自己的行动节奏。" },
  resources: { summary: "从财帛宫事实出发，观察资源安排而非预测收益。", scope: "本节只讨论整理现有时间、精力与资源的角度，不提供投资建议、收益预测或财富评分。", action: "列出可支配的时间与精力，先检查已有安排，不根据本报告进行投资决策。" },
  relationships: { summary: "分开阅读关系宫位，把提示放回现实沟通中核对。", scope: "各关系宫位独立匹配，不能把其中任一主星用来断言他人性格、婚期或关系结果。", action: "先询问真实需求，再明确共同安排，不用命盘标签替代对话。" },
  actions: { summary: "把命宫与身宫的观察线索，变成可复盘的小行动。", scope: "本节把预置提示整理成行动，不声称理解个人经历，也不替你作重大人生决定。", action: "一次只选一项可执行、可停止的小行动，之后用实际记录复盘。" }
};

export function ruleNarrativeFor(chart: ChartResponse, sectionId: ReportSectionId, primaryPalaceIds: string[]) {
  const appliedRules = collectInterpretationRules(chart, primaryPalaceIds);
  const paragraphs = primaryPalaceIds.map((id) => {
    const palace = chart.palaces.find((item) => item.id === id)!;
    const core = palace.majorStars.filter((star) => star.type === "major");
    const matches = core.flatMap((star) => {
      const rule = MAJOR_STAR_RULES.find((item) => item.star === star.name);
      return rule ? [`预置规则把${star.name}关联到「${rule.theme}」；可留意：${rule.caution}。`] : [];
    });
    const detail = matches.length ? matches.join(" ") : core.length ? "本宫主星尚未收录在产品规则库，不补造解读提示。" : "本宫没有十四主星，不补造主星提示；已有辅星、杂曜与必要对宫参考保留在事实框，暂不作对应规则推断。";
    return `${palaceLabel(palace.name)}（${palace.heavenlyStem}${palace.earthlyBranch}）：${detail}`;
  });
  const actions = appliedRules.slice(0, 2).map((match) => MAJOR_STAR_RULES.find((rule) => rule.id === match.ruleId)!.action);
  return { summary: sections[sectionId].summary, body: `${sections[sectionId].scope}\n\n${paragraphs.join("\n\n")}`,
    bullet: `${sections[sectionId].action}${actions.length ? ` 可尝试：${actions.join("；")}。` : ""}`, appliedRules };
}
