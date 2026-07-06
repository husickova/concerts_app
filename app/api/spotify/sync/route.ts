import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { syncSpotifyArtists } from "@/lib/spotify";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const added = await syncSpotifyArtists(session.user.id);
    return NextResponse.json({ added });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Spotify sync failed." }, { status: 500 });
  }
}
