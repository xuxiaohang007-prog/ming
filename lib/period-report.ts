import { generatePeriodContext } from "./ziwei/period-adapter";
import { assertNoRuleOverrides } from "./ziwei/engine-rules";
import { ZiweiEngineError, ZiweiRequestError } from "./ziwei/errors";
import { buildPeriodReportContent, periodReportBindingIssue, periodReportRequestSchema, periodReportSchema } from "./period-report-contract";

export function generatePeriodReport(input: unknown) {
  assertNoRuleOverrides(input);
  const parsed = periodReportRequestSchema.safeParse(input);
  if (!parsed.success) throw new ZiweiRequestError("INVALID_PERIOD_REPORT_INPUT", "请先获取有效的运限资料，再选择层级生成报告。");
  const { scope, periodId, ...request } = parsed.data;
  const { period, chart } = generatePeriodContext(request);
  if (periodId !== period.periodId) throw new ZiweiRequestError("PERIOD_MISMATCH", "运限资料与分析日期不一致，请重新获取资料后生成报告。", 409);
  const report = periodReportSchema.safeParse({ ...buildPeriodReportContent(chart, period, scope), generatedAt: new Date().toISOString() });
  if (!report.success || periodReportBindingIssue(report.data, chart, period, scope)) throw new ZiweiEngineError("RESPONSE_CONTRACT_INVALID");
  return report.data;
}
