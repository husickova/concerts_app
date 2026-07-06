import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // deleteMany s userId zaručí, že uživatel maže jen své záznamy
  await prisma.trackedArtist.deleteMany({
    where: { id: params.id, userId: session.user.id },
  });

  return NextResponse.json({ ok: true });
}
