import { NextResponse } from "next/server";
import { runScan } from "@/lib/scan";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Daily concert scan, triggered once every 24 h by cron:
 *  - Vercel Cron (see vercel.json) sends Authorization: Bearer ${CRON_SECRET}
 *  - or system cron: curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/scan
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
