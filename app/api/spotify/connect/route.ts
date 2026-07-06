import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { auth } from "@/lib/auth";
import { spotifyAuthorizeUrl, spotifyConfigured } from "@/lib/spotify";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.redirect(new URL("/", process.env.NEXTAUTH_URL));
  if (!spotifyConfigured()) {
    return NextResponse.json({ error: "Spotify není nakonfigurováno (SPOTIFY_CLIENT_ID/SECRET)." }, { status: 500 });
  }

  const state = crypto.randomBytes(16).toString("hex");
  cookies().set("spotify_oauth_state", state, {
    httpOnly: true,
    maxAge: 600,
    path: "/",
    sameSite: "lax",
  });

  return NextResponse.redirect(spotifyAuthorizeUrl(state));
}
