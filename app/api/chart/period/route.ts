import { NextResponse } from "next/server";
import { generatePeriod } from "@/lib/ziwei/period-adapter";
import { apiError } from "@/lib/api-error";
import { readPeriodRequestBody } from "@/lib/period-request-body";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    return NextResponse.json(generatePeriod(await readPeriodRequestBody(request)), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
