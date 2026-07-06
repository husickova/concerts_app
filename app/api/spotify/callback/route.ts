import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { exchangeCode, syncSpotifyArtists } from "@/lib/spotify";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const base = process.env.NEXTAUTH_URL!;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.redirect(new URL("/", base));

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const savedState = cookies().get("spotify_oauth_state")?.value;
  cookies().delete("spotify_oauth_state");

  if (!code || !state || state !== savedState) {
    return NextResponse.redirect(new URL("/dashboard?spotify=error", base));
  }

  try {
    const tokens = await exchangeCode(code);
    await prisma.spotifyAccount.upsert({
      where: { userId: session.user.id },
      update: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
      create: {
        userId: session.user.id,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
    });

    // Import top artists right away.
    const added = await syncSpotifyArtists(session.user.id);
    return NextResponse.redirect(new URL(`/dashboard?spotify=connected&added=${added}`, base));
  } catch (e) {
    console.error("spotify callback failed", e);
    return NextResponse.redirect(new URL("/dashboard?spotify=error", base));
  }
}
