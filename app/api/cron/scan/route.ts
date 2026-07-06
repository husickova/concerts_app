import { NextResponse } from "next/server";
import { runScan } from "@/lib/scan";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Denní scan koncertů. Spouští se 1× za 24 h cronem:
 *  - Vercel Cron (viz vercel.json) posílá Authorization: Bearer ${CRON_SECRET}
 *  - nebo systémový cron: curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/scan
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization");
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runScan();
  return NextResponse.json(result);
}
