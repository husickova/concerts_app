import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidCountry } from "@/lib/countries";

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const codes: string[] = Array.isArray(body?.codes) ? body.codes : [];
  const valid = [...new Set(codes.filter((c) => typeof c === "string" && isValidCountry(c)))];

  await prisma.$transaction([
    prisma.trackedCountry.deleteMany({ where: { userId: session.user.id } }),
    prisma.trackedCountry.createMany({
      data: valid.map((code) => ({ userId: session.user.id, code })),
    }),
  ]);

  return NextResponse.json({ codes: valid });
}
