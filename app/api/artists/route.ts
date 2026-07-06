import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeName } from "@/lib/normalize";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim();
  if (!name || name.length > 100) {
    return NextResponse.json({ error: "Zadej název kapely (max 100 znaků)." }, { status: 400 });
  }

  const normalized = normalizeName(name);
  if (!normalized) return NextResponse.json({ error: "Neplatný název." }, { status: 400 });

  const artist = await prisma.trackedArtist.upsert({
    where: { userId_normalized: { userId: session.user.id, normalized } },
    update: {},
    create: { userId: session.user.id, name, normalized, source: "manual" },
  });

  return NextResponse.json({ artist });
}
