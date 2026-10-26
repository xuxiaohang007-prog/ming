export const CHART_SCHEMA_VERSION = "ziwei-chart/1.1.0" as const;
export const STAR_TYPES = ["major", "soft", "tough", "adjective", "flower", "helper", "lucun", "tianma"] as const;
export const REPORT_SCHEMA_VERSION = "ziwei-report/1.3.0" as const;
export const CHART_ID_PATTERN = /^zw_[a-f0-9]{64}$/;
export const EVIDENCE_ID_PATTERN = /^zw_[a-f0-9]{64}:p:(?:[0-9]|1[01])(?::s:(?:major|minor|adjective):(?:0|[1-9]\d*))?$/;

export function palaceIdFor(chartId: string, index: number) { return `${chartId}:p:${index}`; }
export function starIdFor(palaceId: string, group: "major" | "minor" | "adjective", index: number) { return `${palaceId}:s:${group}:${index}`; }
export function palaceLabel(name: string) { return name.endsWith("宫") ? name : `${name}宫`; }
