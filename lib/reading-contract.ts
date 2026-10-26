import { z } from "zod";

export const READING_FOCUS = ["balanced", "career", "resources", "relationships"] as const;
export const READING_LABELS = { balanced: "综合阅读", career: "事业与学习", resources: "财富与资源", relationships: "关系与相处" } as const;
export const DEFAULT_READING = { focus: "balanced", question: "" } as const;
export const readingOptionsSchema = z.object({
  focus: z.enum(READING_FOCUS),
  question: z.string().refine((value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), "问题不能包含控制字符。")
    .pipe(z.string().trim().max(500, "自填问题最多 500 字。"))
}).strict();

export type ReadingOptions = z.infer<typeof readingOptionsSchema>;
export const REPORT_SECTIONS = [
  { id: "overview", title: "命盘总览", eyebrow: "01 / Overview" },
  { id: "personality", title: "性格与优势", eyebrow: "02 / Character" },
  { id: "career", title: "事业与学习", eyebrow: "03 / Career" },
  { id: "resources", title: "财富与资源", eyebrow: "04 / Resources" },
  { id: "relationships", title: "关系与相处", eyebrow: "05 / Relationships" },
  { id: "actions", title: "行动建议", eyebrow: "06 / Next" }
] as const;
export type ReportSectionId = typeof REPORT_SECTIONS[number]["id"];

export class ReadingInputError extends Error {
  constructor(message: string) { super(message); this.name = "ReadingInputError"; }
}

export function parseReadingOptions(value: unknown): ReadingOptions {
  const result = readingOptionsSchema.safeParse(value === undefined ? DEFAULT_READING : value);
  if (!result.success) throw new ReadingInputError(result.error.issues[0]?.message ?? "请检查阅读主题。");
  return result.data;
}
