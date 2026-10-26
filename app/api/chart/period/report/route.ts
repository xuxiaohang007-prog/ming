import { NextResponse } from "next/server";
import { generatePeriodReport } from "@/lib/period-report";
import { readPeriodRequestBody } from "@/lib/period-request-body";
import { apiError } from "@/lib/api-error";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    return NextResponse.json(generatePeriodReport(await readPeriodRequestBody(request)), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
