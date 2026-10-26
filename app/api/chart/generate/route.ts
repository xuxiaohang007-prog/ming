import { NextResponse } from "next/server";
import { generateChart } from "@/lib/ziwei/iztro-adapter";
import { apiError } from "@/lib/api-error";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    return NextResponse.json(generateChart(await request.json()), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
