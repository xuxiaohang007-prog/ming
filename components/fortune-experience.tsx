"use client";

import { startTransition, useDeferredValue, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, Check, Download, RefreshCcw, Sparkles, Stars, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { AstroChart } from "@/components/astro-chart";
import { ChartPreview } from "@/components/chart-preview";
import { GlassPanel } from "@/components/glass-panel";
import { InputField } from "@/components/input-field";
import { InterpretationTimeline } from "@/components/interpretation-timeline";
import { PageBackground } from "@/components/page-background";
import { ReportSection } from "@/components/report-section";
import { RuleSummary } from "@/components/rule-summary";
import { birthSchema } from "@/lib/birth-schema";
import { getLunarMonthInfo, parseBirthDate } from "@/lib/birth-calendar";
import { BirthTimeField } from "@/components/birth-time-field";
import type { BirthTimeMode, ChartResponse, FortuneFormData, InterpretationResponse } from "@/lib/types";
import type { ZodType, ZodTypeDef } from "zod";
import { chartResponseSchema } from "@/lib/chart-contract";
import { reportBindingIssue, reportResponseSchema } from "@/lib/report-contract";
import { displayGeneratedAt } from "@/lib/display-time";
import { ReadingOptionsFields } from "@/components/reading-options";
import { DEFAULT_READING, readingOptionsSchema, READING_LABELS } from "@/lib/reading-contract";
import type { ReadingOptions } from "@/lib/reading-contract";
import { readInterpretStream, reportSourceForMode } from "@/lib/interpret-stream";
import type { InterpretMode, InterpretProgress } from "@/lib/interpret-stream";
import { AIServiceError } from "@/lib/ai/errors";
import { RULE_MODE_PREFERENCE_KEY } from "@/lib/interpretation-rulebook";
import { readingPalaceIds } from "@/lib/reading-status";
import { ReportOverview } from "@/components/report-overview";
import { ReportContents } from "@/components/report-contents";
import { reportSourceLabel } from "@/lib/report-presentation";

type Screen = "input" | "chart" | "interpreting" | "report";
type Pending = "chart" | "report" | null;
const stages: { key: Screen; title: string; description: string }[] = [
  { key: "input", title: "出生信息", description: "录入排盘条件" },
  { key: "chart", title: "紫微命盘", description: "查看并确认盘面" },
  { key: "interpreting", title: "命理解读", description: "主动发起解读" },
  { key: "report", title: "阅读报告", description: "保存与回看" }
];
const defaultValues: Partial<FortuneFormData> = {
  name: "", birthPlace: "", birthDate: "", birthTime: "", calendar: "solar", isLeapMonth: false,
  birthTimeMode: "exact", birthTimePeriod: ""
};

class BirthRequestError extends Error {
  constructor(message: string, public fieldErrors: Record<string, string>, public code?: string) { super(message); }
}

async function readResponse<T>(response: Response, fallback: string, schema: ZodType<T, ZodTypeDef, unknown>): Promise<T> {
  let data;
  try { data = await response.json(); } catch { throw new BirthRequestError("服务返回的数据不是有效 JSON，请重试。", {}, "RESPONSE_INVALID"); }
  if (!response.ok) {
    const fieldErrors: Record<string, string> = {};
    if (data?.fieldErrors && typeof data.fieldErrors === "object") {
      for (const [key, message] of Object.entries(data.fieldErrors)) if (typeof message === "string") fieldErrors[key] = message;
    }
    throw new BirthRequestError(typeof data?.error === "string" ? data.error : fallback, fieldErrors, typeof data?.code === "string" ? data.code : undefined);
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new BirthRequestError("服务返回的数据格式不完整，请重试或刷新页面。", {}, "RESPONSE_INVALID");
  return parsed.data;
}

function BirthSummary({ chart }: { chart: ChartResponse }) {
  const entries = [
    ["称呼", chart.form.name || "命主"], ["排盘性别", chart.form.gender],
    ["输入日期", `${chart.form.calendar === "solar" ? "公历" : "农历"}${chart.form.isLeapMonth ? "（闰月）" : ""} ${chart.form.birthDate}`],
    ["出生时间", chart.birthInput.timeMode === "exact" ? `${chart.birthInput.originalTime} · ${chart.birthInput.timeLabel}` : `${chart.birthInput.timeLabel} · ${chart.birthInput.timeRange}`],
    ["公历", chart.solarDate], ["农历", chart.lunarDate],
    ["时间来源", chart.birthInput.timeMode === "exact" ? "准确时间" : "时辰范围，未推定分钟"],
    ["时间基准", "UTC+8 标准时间，未校正真太阳时"]
  ];
  if (chart.form.birthPlace) entries.push(["出生地点（档案）", chart.form.birthPlace]);
  return <dl className="birth-summary" aria-label="已确认的出生信息">{entries.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

export function FortuneExperience() {
  const [screen, setScreen] = useState<Screen>("input");
  const [chart, setChart] = useState<ChartResponse | null>(null);
  const [report, setReport] = useState<InterpretationResponse | null>(null);
  const [reading, setReading] = useState<ReadingOptions>({ ...DEFAULT_READING });
  const [interpretMode, setInterpretMode] = useState<InterpretMode>("rules");
  const [interpretProgress, setInterpretProgress] = useState<InterpretProgress>({ phase: "requesting", characters: 0 });
  const [interpretStartedAt, setInterpretStartedAt] = useState<number | null>(null);
  const [requiresNewChart, setRequiresNewChart] = useState(false);
  const [activeEvidenceId, setActiveEvidenceId] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [pendingFieldFocus, setPendingFieldFocus] = useState<keyof FortuneFormData | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const reportEntry = useRef(false);
  const preserveChartFocus = useRef(false);
  const deferredScreen = useDeferredValue(screen);
  const reduceMotion = useReducedMotion();
  const { register, handleSubmit, watch, reset, setValue, setError, setFocus, clearErrors, formState: { errors } } = useForm<FortuneFormData>({
    resolver: zodResolver(birthSchema), defaultValues, mode: "onBlur", reValidateMode: "onChange"
  });
  const calendar = watch("calendar");
  const timeMode = watch("birthTimeMode") ?? "exact";
  const birthTime = watch("birthTime");
  const birthTimePeriod = watch("birthTimePeriod") ?? "";
  const dateParts = parseBirthDate(watch("birthDate"));
  const leapMonth = watch("isLeapMonth");
  const lunarMonthInfo = calendar === "lunar" && dateParts ? getLunarMonthInfo(dateParts.year, dateParts.month, leapMonth) : null;
  const stageIndex = stages.findIndex((stage) => stage.key === screen);
  const sceneKey = screen === "interpreting" ? "chart" : screen;

  useEffect(() => () => { activeRequest.current?.abort(); activeRequest.current = null; }, []);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(RULE_MODE_PREFERENCE_KEY);
      if (saved === "demo" || saved === "rules") setInterpretMode(saved);
    } catch {}
  }, []);
  useEffect(() => {
    if (screen === "chart" && preserveChartFocus.current) { preserveChartFocus.current = false; return; }
    heading.current?.focus({ preventScroll: true });
  }, [screen]);
  useEffect(() => {
    if (screen === "input" && pending === null && pendingFieldFocus) {
      setFocus(pendingFieldFocus);
      setPendingFieldFocus(null);
    }
  }, [screen, pending, pendingFieldFocus, setFocus]);

  function navigate(next: Screen) { startTransition(() => setScreen(next)); }
  function attachReportHeading(element: HTMLHeadingElement | null) {
    heading.current = element;
    if (!element || !reportEntry.current) return;
    reportEntry.current = false;
    preserveChartFocus.current = false;
    requestAnimationFrame(() => {
      if (heading.current !== element || !element.isConnected) return;
      element.focus({ preventScroll: true });
      element.closest(".report-cover")?.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
    });
  }
  function chooseInterpretMode(mode: InterpretMode) {
    setInterpretMode(mode); setRequestError(null);
    try { if (mode !== "ai") localStorage.setItem(RULE_MODE_PREFERENCE_KEY, mode); } catch {}
  }
  function isCurrent(controller: AbortController) { return activeRequest.current === controller; }
  function beginRequest(kind: Exclude<Pending, null>) {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setPending(kind); setRequestError(null); setNotice(""); setPendingFieldFocus(null);
    return controller;
  }
  function finishRequest(controller: AbortController) {
    if (!isCurrent(controller)) return;
    activeRequest.current = null; setPending(null);
  }
  function cancelRequest() {
    activeRequest.current?.abort(); activeRequest.current = null;
    reportEntry.current = false;
    preserveChartFocus.current = false;
    setPending(null); setRequestError(null); setPendingFieldFocus(null); setNotice("已取消，可以继续修改信息或重新开始。");
    if (screen === "interpreting") navigate("chart");
  }
  function editBirth() {
    cancelRequest(); setChart(null); setReport(null); setRequiresNewChart(false); setActiveEvidenceId(null);
    if (location.hash.startsWith("#report-")) history.replaceState(history.state, "", location.pathname + location.search);
    setNotice("已保留输入内容，原命盘与报告已失效，请修改后重新生成命盘。"); navigate("input");
  }
  function startAgain() {
    setReading({ ...DEFAULT_READING });
    if (location.hash.startsWith("#report-")) history.replaceState(history.state, "", location.pathname + location.search);
    cancelRequest(); reset(defaultValues); setChart(null); setReport(null); setRequiresNewChart(false); setActiveEvidenceId(null); setNotice(""); navigate("input");
  }
  function changeCalendar(next: "solar" | "lunar") {
    if (calendar === next) return;
    setValue("calendar", next); setValue("birthDate", ""); setValue("isLeapMonth", false);
    clearErrors(["birthDate", "isLeapMonth"]);
    setNotice("已切换历法，请重新填写对应日期；日期不会自动转换。");
  }
  function changeTimeMode(next: BirthTimeMode) {
    if (timeMode === next) return;
    setValue("birthTimeMode", next); setValue("birthTime", ""); setValue("birthTimePeriod", "");
    clearErrors(["birthTime", "birthTimePeriod", "birthTimeMode"]);
  }
  function showServerFieldErrors(error: BirthRequestError) {
    const fields: (keyof FortuneFormData)[] = ["name", "gender", "birthPlace", "birthDate", "birthTime", "birthTimePeriod", "isLeapMonth"];
    let first: keyof FortuneFormData | undefined;
    for (const field of fields) {
      if (error.fieldErrors[field]) {
        setError(field, { type: "server", message: error.fieldErrors[field] });
        first ??= field;
      }
    }
    // Wait for the loading fieldset to be enabled before focusing its input.
    if (first) setPendingFieldFocus(first);
  }
  const handleGenerate = handleSubmit(async (values) => {
    if (activeRequest.current) return;
    const controller = beginRequest("chart");
    setChart(null); setReport(null); setRequiresNewChart(false); setActiveEvidenceId(null);
    try {
      const response = await fetch("/api/chart/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values), signal: controller.signal
      });
      const data = await readResponse(response, "命盘生成失败，请重试。", chartResponseSchema);
      if (!isCurrent(controller)) return;
      const fields: (keyof FortuneFormData)[] = ["name", "gender", "birthPlace", "calendar", "birthDate", "birthTime", "isLeapMonth"];
      if (fields.some((field) => data.form[field] !== values[field]) || (data.form.birthTimeMode ?? "exact") !== (values.birthTimeMode ?? "exact") || (data.form.birthTimePeriod ?? "") !== (values.birthTimePeriod ?? "")) {
        throw new BirthRequestError("返回命盘与填写信息不一致，请重试。", {}, "CHART_MISMATCH");
      }
      setChart(data); navigate("chart");
    } catch (error) {
      if (isCurrent(controller) && !controller.signal.aborted) {
        setRequestError(error instanceof Error ? error.message : "连接失败，请重试。");
        if (error instanceof BirthRequestError) showServerFieldErrors(error);
      }
    } finally { finishRequest(controller); }
  });
  async function handleInterpret() {
    if (!chart || activeRequest.current) return;
    const selectedReading = readingOptionsSchema.safeParse(reading);
    if (!selectedReading.success) { setRequestError(selectedReading.error.issues[0]?.message ?? "请检查阅读主题。"); return; }
    const controller = beginRequest("report");
    const requestId = crypto.randomUUID();
    setInterpretProgress({ phase: "requesting", characters: 0 });
    setInterpretStartedAt(performance.now());
    let continuedReading = false;
    const markReading = () => { continuedReading = true; };
    const markPointerReading = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest(".chart-board, .palace-detail, .chart-dialog, .summary-panel, .rules-panel")) markReading();
    };
    const markKeyReading = (event: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End", " "].includes(event.key) && !(event.target instanceof Element && event.target.closest("input, textarea, select"))) markReading();
    };
    window.addEventListener("wheel", markReading, { passive: true });
    window.addEventListener("touchmove", markReading, { passive: true });
    window.addEventListener("pointerdown", markPointerReading);
    window.addEventListener("keydown", markKeyReading);
    const timer = setTimeout(() => controller.abort(new AIServiceError("AI_TIMEOUT", 504)), 130000);
    setReport(null); navigate("interpreting");
    try {
      const response = await fetch("/api/chart/interpret", {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
        body: JSON.stringify({ form: chart.form, ruleVersion: chart.ruleVersion, ruleHash: chart.ruleHash, chartId: chart.chartId, reading: selectedReading.data, requestId, mode: interpretMode }), signal: controller.signal
      });
      const data = response.ok && response.headers.get("content-type")?.includes("application/x-ndjson")
        ? await readInterpretStream(response, { requestId, chart, reading: selectedReading.data, mode: interpretMode }, (status) => { if (isCurrent(controller) && !controller.signal.aborted) setInterpretProgress(status); })
        : await readResponse(response, "报告生成失败，请重试。", reportResponseSchema);
      if (!isCurrent(controller)) return;
      if (data.source !== reportSourceForMode(interpretMode)) throw new AIServiceError(interpretMode === "rules" ? "RULES_OUTPUT_INVALID" : "AI_OUTPUT_INVALID");
      const bindingIssue = reportBindingIssue(data, chart, selectedReading.data);
      if (bindingIssue) {
        throw new BirthRequestError(["FACT_MISMATCH", "IRRELEVANT_EVIDENCE", "READING_MISMATCH", "RULE_MISMATCH"].includes(bindingIssue) ? "报告事实、规则匹配、章节引用或阅读主题不一致，请重试。" : "报告或其引用与已确认命盘不一致，请重新生成命盘。", {}, bindingIssue);
      }
      setReport(data);
      if (continuedReading) {
        preserveChartFocus.current = true;
        setNotice("解读已完成。你正在查看命盘，点击“查看已有报告”打开，不会自动跳走。"); navigate("chart");
      } else { reportEntry.current = true; navigate("report"); }
    } catch (error) {
      if (isCurrent(controller) && (!controller.signal.aborted || controller.signal.reason instanceof AIServiceError)) {
        if (error instanceof BirthRequestError && ["RULES_CHANGED", "CHART_MISMATCH", "UNKNOWN_EVIDENCE"].includes(error.code ?? "")) setRequiresNewChart(true);
        setRequestError(controller.signal.aborted && controller.signal.reason instanceof AIServiceError ? controller.signal.reason.message : error instanceof Error ? error.message : "连接失败，请重试。"); navigate("chart");
      }
    } finally {
      window.removeEventListener("wheel", markReading); window.removeEventListener("touchmove", markReading);
      window.removeEventListener("pointerdown", markPointerReading); window.removeEventListener("keydown", markKeyReading);
      clearTimeout(timer); controller.abort(); finishRequest(controller);
    }
  }

  function viewEvidence(id: string) {
    if (!chart) return;
    const evidence = chart.evidence.find((item) => item.id === id);
    if (!evidence) return;
    setActiveEvidenceId(id); setNotice(`已定位到 ${evidence.label}。`); navigate("chart");
  }

  return (
    <main className="app-shell" data-reading-active={screen === "interpreting" && pending === "report" ? "true" : "false"}>
      <PageBackground stage={deferredScreen} />
      <div className="content-shell">
        <header className="site-header no-print">
          <div className="masthead">
            <div className="brand"><span className="brand-mark" aria-hidden="true">紫<br />微</span><div><h1>紫微命盘</h1><p>ZI WEI · PERSONAL ATLAS</p></div></div>
            <div className="masthead-note"><strong>一张命盘，一次自我观照。</strong><p>本命排盘 / 十二宫 / 阅读档案</p></div>
          </div>
          <nav className="flow-nav" aria-label="排盘与解读流程">
            <ol>{stages.map((stage, index) => <li key={stage.key} aria-current={screen === stage.key ? "step" : undefined} className={`flow-step ${screen === stage.key ? "is-current" : ""}`}>
              <span className="step-number">{index < stageIndex ? <Check size={18} aria-label="已完成" /> : `0${index + 1}`}</span>
              <div><div className="step-title">{stage.title}</div><p className="step-description">{stage.description}</p></div>
            </li>)}</ol>
          </nav>
        </header>

        {notice && <p role="status" className="notice no-print">{notice}</p>}
        {requestError && <p role="alert" className="notice error-notice no-print">{requestError}</p>}

        <AnimatePresence mode="wait" onExitComplete={() => heading.current?.focus({ preventScroll: true })}>
          <motion.section key={sceneKey} initial={false} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.3 }}>
            {screen === "input" && <>
              <div className="screen-heading"><p className="eyebrow">01 / Birth Archive</p><h2 ref={heading} tabIndex={-1} className="entry-title"><span>从出生时刻，</span><span>展开你的命盘。</span></h2><p>先记录你的来处，再慢慢读懂盘面。选择历法与出生时间，一份清晰的十二宫档案由此开始。</p></div>
              <div className="entry-layout">
                <GlassPanel className="birth-panel" accent="gold">
                  <div className="panel-heading"><div><p className="eyebrow">出生档案</p><h3>录入排盘条件</h3></div><span className="panel-number" aria-hidden="true">壹</span></div>
                  <form className="birth-form" onSubmit={handleGenerate} noValidate>
                    <fieldset disabled={pending === "chart"} className="birth-fields">
                      <legend className="sr-only">出生信息</legend>
                      <div className="field-row">
                        <InputField label="姓名或称呼" hint="选填" placeholder="报告中如何称呼你" error={errors.name?.message} {...register("name")} />
                        <InputField label="排盘性别" error={errors.gender?.message} options={[{ label: "请选择", value: "" }, { label: "女", value: "女" }, { label: "男", value: "男" }]} {...register("gender")} />
                      </div>
                      <fieldset className="calendar-field"><legend>出生日期历法</legend><div className="calendar-options">
                        {([['solar', '公历'], ['lunar', '农历']] as const).map(([value, label]) => <label key={value} className={`calendar-option ${calendar === value ? "is-selected" : ""}`}><input type="radio" name="calendar" value={value} checked={calendar === value} onChange={() => changeCalendar(value)} />{label}</label>)}
                      </div></fieldset>
                      <InputField key={calendar} label={calendar === "solar" ? "公历出生日期" : "农历出生日期"} type={calendar === "solar" ? "date" : "text"} min={calendar === "solar" ? "1900-01-01" : undefined} max={calendar === "solar" ? "2100-12-31" : undefined} placeholder="例如 2000-7-17" hint={calendar === "lunar" ? "年-月-日" : "1900 至 2100 年"} error={errors.birthDate?.message} {...register("birthDate")} />
                      {calendar === "lunar" && <div className="lunar-options"><label className="checkbox-field"><input type="checkbox" aria-invalid={Boolean(errors.isLeapMonth)} aria-describedby={errors.isLeapMonth ? "leap-month-error" : undefined} {...register("isLeapMonth")} />出生于农历闰月</label>
                        {lunarMonthInfo && <p className="small-note">{lunarMonthInfo.leapMonth ? `${dateParts!.year} 年有闰${lunarMonthInfo.leapMonth}月` : `${dateParts!.year} 年没有闰月`}{lunarMonthInfo.dayCount ? `，所选月份共 ${lunarMonthInfo.dayCount} 天。` : "，当前闰月选项与月份不匹配。"}</p>}
                        {errors.isLeapMonth && <p id="leap-month-error" className="field-error-message" role="alert">{errors.isLeapMonth.message}</p>}
                        <p className="small-note">闰月表示出生月份；排盘使用固定的闰月调整规则，两者含义不同。</p>
                      </div>}
                      <BirthTimeField mode={timeMode} time={birthTime} period={birthTimePeriod} errors={errors} register={register} onModeChange={changeTimeMode} />
                      <InputField label="出生地点" hint="选填，不做真太阳时校正" placeholder="例如：杭州" error={errors.birthPlace?.message} {...register("birthPlace")} />
                      <p className="form-footnote">按 UTC+8 标准时间填写。时间不确定时先补充；切换历法后请重新录入对应日期。</p>
                      <button type="submit" className="button-primary full-width" disabled={pending === "chart" || timeMode === "unknown"}><Stars size={17} />{pending === "chart" ? "命盘生成中…" : timeMode === "unknown" ? "补充出生时间后生成" : requestError ? "重新生成命盘" : "生成命盘"}<ArrowRight size={17} /></button>
                    </fieldset>
                    {pending === "chart" && <button type="button" onClick={cancelRequest} className="button-secondary full-width">取消生成</button>}
                  </form>
                </GlassPanel>
                <ChartPreview status={pending === "chart" ? "loading" : chart ? "ready" : "idle"} />
              </div>
            </>}

            {(screen === "chart" || screen === "interpreting") && chart && <div className="no-print">
              <div className="screen-heading heading-row"><div><p className="eyebrow">02 / The Twelve Palaces</p><h2 ref={heading} tabIndex={-1}>{chart.form.name || "命主"}的紫微命盘</h2><p>十二宫各有所指。选中一宫，细看星曜，也核对这份档案的起点。</p></div><p className="small-note">本命盘 · iztro {chart.engineVersion} · 晚子归次日</p></div>
              <AstroChart chart={chart} readingState={screen === "interpreting" && pending === "report" ? { mode: interpretMode, phase: interpretProgress.phase, palaceIds: readingPalaceIds(chart, reading) } : undefined} initialPalaceIndex={chart.evidence.find((item) => item.id === activeEvidenceId)?.palaceIndex} focusedEvidenceId={activeEvidenceId} sidebar={<>
                <GlassPanel className="summary-panel" accent="aurora"><p className="eyebrow">出生信息 / Archive</p><BirthSummary chart={chart} /></GlassPanel>
                <GlassPanel className="rules-panel"><RuleSummary chart={chart} /></GlassPanel>
                {screen === "interpreting" ? <GlassPanel className="action-panel reading-panel"><InterpretationTimeline mode={interpretMode} progress={interpretProgress} startedAt={interpretStartedAt} active={pending === "report"} reportReady={report !== null} /><button type="button" onClick={cancelRequest} className="button-secondary full-width"><X size={17} />取消，返回命盘</button></GlassPanel> : <GlassPanel className="action-panel" accent="gold">
                  <h3>信息确认后，开始解读</h3><p>{interpretMode === "rules" ? "根据当前命盘匹配本地预置规则，直接生成六章参考报告。无需 API 密钥、无需安装模型；未调用大模型，不回答自由提问。" : interpretMode === "demo" ? "当前为固定流程示例，不会调用模型，也不匹配个性化解读规则。" : "兼容的云端模式需要服务端密钥，可能产生 API 费用；不用密钥请切换本地规则解读。"}</p>
                  <fieldset className="interpret-mode"><legend>解读方式</legend><label><input type="radio" name="interpret-mode" value="rules" checked={interpretMode === "rules"} onChange={() => chooseInterpretMode("rules")} />本地规则解读（免密钥）</label><label><input type="radio" name="interpret-mode" value="demo" checked={interpretMode === "demo"} onChange={() => chooseInterpretMode("demo")} />示例模式</label></fieldset>
                  <details className="reading-scope"><summary>兼容的云端模式（需要密钥）</summary><label className="legacy-ai-choice"><input type="radio" name="interpret-mode" value="ai" checked={interpretMode === "ai"} onChange={() => chooseInterpretMode("ai")} />真实 AI 解读</label><p>仅为保留上一步接口，不会默认启用或自动回退。当前推荐使用免密钥规则模式。</p></details>
                  <ReadingOptionsFields reading={reading} ai={interpretMode === "ai"} rules={interpretMode === "rules"} onChange={(value) => { setReading(value); setRequestError(null); }} />
                  <button type="button" disabled={pending !== null} onClick={requiresNewChart ? editBirth : handleInterpret} className="button-primary full-width"><Sparkles size={17} />{requiresNewChart ? "返回录入，重新排盘" : requestError ? interpretMode === "rules" ? "重试本地解读" : interpretMode === "ai" ? "重试 AI 解读" : "重试解读（示例）" : interpretMode === "rules" ? "生成本地解读" : interpretMode === "ai" ? "开始真实 AI 解读" : "开始 AI 解读（示例）"}</button>
                  {report && <button type="button" onClick={() => { setNotice(""); reportEntry.current = true; navigate("report"); }} className="button-secondary full-width">查看已有报告</button>}
                  <button type="button" onClick={editBirth} className="button-secondary full-width"><ArrowLeft size={16} />修改出生信息</button>
                </GlassPanel>}
              </>} />
            </div>}

            {screen === "report" && report && chart && <>
              <GlassPanel className="print-surface report-cover" accent="gold">
                <p className="eyebrow">04 / Personal Reading</p><div className="report-cover-meta"><span>{reportSourceLabel(report.source)} · {READING_LABELS[report.reading.focus]}</span><time dateTime={report.generatedAt}>{displayGeneratedAt(report.generatedAt)}（UTC+8）</time></div><span className="report-ready-label">{report.sections.length} 章已校验</span><h2 ref={attachReportHeading} tabIndex={-1}>{report.headline}</h2><p className="report-abstract">{report.abstract}</p>
                <dl className="report-highlights">{report.highlights.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>
                <details className="report-reading no-print"><summary>本次阅读主题 · {READING_LABELS[report.reading.focus]}</summary><p>{report.reading.question || "未填写自定义问题，按所选侧重点阅读六章。"}</p><p className="small-note">{report.source === "ai" ? "本次已交给 AI 结合盘面阅读；解释可能存在偏差。" : report.source === "rules" ? "已按侧重点整理预置规则；自填问题仅保留，未作语义回答。" : "仅保留主题数据，未由大模型回答。"}新主题不会改写已有报告。</p></details>
                <aside className="report-limitations" aria-label="报告范围与缺失资料"><p className="note-label">阅读边界 · 未提供的资料不会补造</p><ul>{report.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul></aside>
                <div className="report-actions no-print">
                  <button type="button" onClick={() => navigate("chart")} className="button-secondary"><ArrowLeft size={16} />返回命盘</button>
                  <button type="button" onClick={() => window.print()} className="button-primary"><Download size={16} />打印／另存 PDF</button>
                  <button type="button" onClick={editBirth} className="button-secondary">修改信息</button>
                  <button type="button" onClick={startAgain} className="button-secondary"><RefreshCcw size={16} />新建命盘</button>
                </div>
                <p className="report-print-warning no-print">打印会包含本次出生档案与报告内容，请谨慎保存与分享。</p>
              </GlassPanel>
              <ReportOverview report={report} />
              <div className="report-layout">
                <ReportContents sections={report.sections} />
                <div className="report-chapters">{report.sections.map((section) => <ReportSection key={section.id} section={section} source={report.source} evidence={chart.evidence.filter((item) => section.evidenceIds.includes(item.id))} onEvidenceSelect={viewEvidence} />)}</div>
              </div>
              <GlassPanel className="print-surface report-archive" accent="aurora"><p className="eyebrow">档案信息</p><BirthSummary chart={chart} /><div className="no-print"><p className="small-note mt-5">{report.source === "ai" ? `OpenAI 解读 · ${report.model}` : report.source === "rules" ? `本地规则解读 · ${report.interpretationVersion} · 未调用大模型` : "流程示例报告"} · iztro {report.engineVersion} · 本命盘 · 未进行流年分析</p><p className="small-note">排盘规则版本：{report.ruleVersion} · 规则指纹（缩写）：{report.ruleHash.slice(0, 16)}…</p><p className="small-note">命盘标识（缩写）：{report.chartId.slice(0, 19)}… · 报告生成：{displayGeneratedAt(report.generatedAt)}（UTC+8）</p><RuleSummary chart={chart} /></div><dl className="print-only report-print-provenance"><dt>报告来源与范围</dt><dd>{reportSourceLabel(report.source)} · 本命盘，未进行流年分析</dd><dt>报告生成时间</dt><dd>{displayGeneratedAt(report.generatedAt)}（UTC+8）</dd><dt>引擎与历法</dt><dd>iztro {chart.engineVersion} · lunar-typescript {chart.rules.calendarVersion}</dd><dt>排盘规则版本</dt><dd>{report.ruleVersion}</dd>{report.interpretationVersion && <><dt>解读规则版本</dt><dd>{report.interpretationVersion} · 未调用大模型</dd></>}{report.model && <><dt>模型标识</dt><dd>{report.model}</dd></>}<dt>完整规则指纹</dt><dd className="provenance-code">{report.ruleHash}</dd><dt>完整命盘标识</dt><dd className="provenance-code">{report.chartId}</dd></dl></GlassPanel>
            </>}
          </motion.section>
        </AnimatePresence>
        <footer className="site-footer no-print"><span>紫微命盘 · 一份关于自己的阅读档案</span><span>排盘由 iztro 提供 · <a href="/licenses/iztro-MIT.txt">开源许可</a> · <a href="/licenses/noto-fonts-OFL.txt">字体许可</a></span></footer>
      </div>
    </main>
  );
}
