import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ZiweiEngineError, ZiweiRequestError } from "./ziwei/errors";
import { ReadingInputError } from "./reading-contract";
import { AIServiceError } from "./ai/errors";

export function apiError(error: unknown) {
  const headers = { "Cache-Control": "no-store" };
  if (error instanceof AIServiceError) return NextResponse.json({ error: error.message, code: error.code, retryable: error.retryable }, { status: error.status, headers });
  if (error instanceof ReadingInputError) return NextResponse.json({ error: error.message, code: "INVALID_READING_INPUT" }, { status: 400, headers });
  if (error instanceof SyntaxError) return NextResponse.json({ error: "请求内容不是有效 JSON。", code: "INVALID_JSON" }, { status: 400, headers });
  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of error.issues) {
      const field = issue.path[0];
      if (typeof field === "string" && !fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    return NextResponse.json({ error: error.issues[0]?.message || "请检查出生信息。", code: "INVALID_BIRTH_INPUT", fieldErrors }, { status: 400, headers });
  }
  if (error instanceof ZiweiRequestError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers });
  if (error instanceof ZiweiEngineError) return NextResponse.json({ error: "排盘服务暂时不可用，请重试。", code: error.code }, { status: 500, headers });
  return NextResponse.json({ error: "服务暂时不可用，请重试。", code: "INTERNAL_ERROR" }, { status: 500, headers });
}
