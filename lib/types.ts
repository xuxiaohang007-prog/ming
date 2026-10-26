import type { ReadingOptions, ReportSectionId } from "./reading-contract";
import type { AppliedInterpretationRule } from "./interpretation-rulebook";

export type BirthTimeMode = "exact" | "period" | "unknown";

export type FortuneFormData = {
  name: string;
  gender: "男" | "女";
  birthPlace: string;
  calendar: "solar" | "lunar";
  birthDate: string;
  birthTime: string;
  birthTimeMode?: BirthTimeMode;
  birthTimePeriod?: string;
  isLeapMonth: boolean;
};

export type NormalizedBirthInput = {
  originalDate: string;
  originalTime: string | null;
  originalTimePeriod: string | null;
  calendar: "solar" | "lunar";
  isLeapMonth: boolean;
  solarDate: string;
  timeMode: "exact" | "period";
  timeIndex: number;
  timeLabel: string;
  timeRange: string;
  timezone: "UTC+08:00";
  dayDivide: "forward";
  fixLeap: true;
};

export type StarGroup = "major" | "minor" | "adjective";
export type StarType = "major" | "soft" | "tough" | "adjective" | "flower" | "helper" | "lucun" | "tianma";
export type ChartStar = { id: string; name: string; type: StarType; brightness: string; mutagen: string };

export type ChartPalace = {
  id: string;
  index: number;
  name: string;
  heavenlyStem: string;
  earthlyBranch: string;
  isBodyPalace: boolean;
  surroundedPalaces: { target: string; opposite: string; wealth: string; career: string };
  majorStars: ChartStar[];
  minorStars: ChartStar[];
  adjectiveStars: ChartStar[];
};

export type ChartEvidence = {
  id: string;
  kind: "palace" | "star";
  palaceId: string;
  palaceIndex: number;
  starId: string | null;
  starGroup: StarGroup | null;
  label: string;
};

export type ZiweiRulesSnapshot = {
  ruleVersion: string;
  engineVersion: string;
  calendarVersion: string;
  language: "zh-CN";
  timezone: "UTC+08:00";
  fixLeap: true;
  tablePolicy: "iztro-packaged-defaults";
  plugins: "none";
  config: {
    algorithm: "default";
    dayDivide: "forward";
    yearDivide: "normal";
    horoscopeDivide: "normal";
    ageDivide: "normal";
    mutagens: Record<string, string[]>;
    brightness: Record<string, string[]>;
  };
};

export type ChartResponse = {
  schemaVersion: "ziwei-chart/1.1.0";
  chartId: string;
  generatedAt: string;
  source: "iztro";
  engineVersion: string;
  form: FortuneFormData;
  ruleVersion: string;
  ruleHash: string;
  rules: ZiweiRulesSnapshot;
  birthInput: NormalizedBirthInput;
  solarDate: string;
  lunarDate: string;
  chineseDate: string;
  time: string;
  timeRange: string;
  soul: string;
  body: string;
  fiveElementsClass: string;
  earthlyBranchOfSoulPalace: string;
  earthlyBranchOfBodyPalace: string;
  palaces: ChartPalace[];
  summary: {
    scope: "natal";
    soul: string;
    body: string;
    fiveElementsClass: string;
    soulPalaceId: string;
    bodyPalaceId: string;
  };
  evidence: ChartEvidence[];
};

export type ReportFact = { id: string; text: string; evidenceIds: string[] };
export type ReportSectionData = {
  id: ReportSectionId;
  title: string;
  eyebrow: string;
  summary: string;
  facts: ReportFact[];
  appliedRules?: AppliedInterpretationRule[];
  body: string;
  bullet: string;
  evidenceIds: string[];
};

export type InterpretationResponse = {
  schemaVersion: "ziwei-report/1.3.0";
  chartId: string;
  generatedAt: string;
  source: "demo" | "ai" | "rules";
  interpretationVersion?: "ziwei-reading-rules/1.0.0";
  provider?: "openai";
  model?: string;
  engineVersion: string;
  ruleVersion: string;
  ruleHash: string;
  reading: ReadingOptions;
  limitations: string[];
  headline: string;
  abstract: string;
  highlights: Array<{
    label: string;
    value: string;
  }>;
  sections: ReportSectionData[];
};
