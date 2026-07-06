import { prisma } from "./prisma";
import { normalizeName } from "./normalize";

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API = "https://api.spotify.com/v1";

export function spotifyConfigured(): boolean {
  return Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
}

export function spotifyRedirectUri(): string {
  return `${process.env.NEXTAUTH_URL}/api/spotify/callback`;
}

export function spotifyAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.SPOTIFY_CLIENT_ID!,
    scope: "user-top-read",
    redirect_uri: spotifyRedirectUri(),
    state,
  });
  return `https://accounts.spotify.com/authorize?${params}`;
}

async function tokenRequest(body: URLSearchParams) {
  const basic = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) throw new Error(`spotify token: HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

export async function exchangeCode(code: string) {
  return tokenRequest(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: spotifyRedirectUri(),
    })
  );
}

/** Vrátí platný access token uživatele; když expiroval, obnoví ho přes refresh token. */
export async function getAccessToken(userId: string): Promise<string | null> {
  const account = await prisma.spotifyAccount.findUnique({ where: { userId } });
  if (!account) return null;
  if (account.expiresAt.getTime() > Date.now() + 60_000) return account.accessToken;

  const data = await tokenRequest(
    new URLSearchParams({ grant_type: "refresh_token", refresh_token: account.refreshToken })
  );
  const updated = await prisma.spotifyAccount.update({
    where: { userId },
    data: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? account.refreshToken,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    },
  });
  return updated.accessToken;
}

/** Stáhne top interprety (short/medium/long term, po 50) – dohromady až ~100 unikátních. */
export async function fetchTopArtists(accessToken: string): Promise<string[]> {
  const names = new Map<string, string>(); // normalized -> původní jméno
  for (const range of ["long_term", "medium_term", "short_term"]) {
    const res = await fetch(`${API}/me/top/artists?limit=50&time_range=${range}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`spotify top artists: HTTP ${res.status}`);
    const data = await res.json();
    for (const item of data?.items ?? []) {
      if (item?.name) {
        const key = normalizeName(item.name);
        if (!names.has(key)) names.set(key, item.name);
      }
      if (names.size >= 100) break;
    }
    if (names.size >= 100) break;
  }
  return [...names.values()];
}

/** Importuje top interprety uživatele ze Spotify jako sledované kapely. */
export async function syncSpotifyArtists(userId: string): Promise<number> {
  const token = await getAccessToken(userId);
  if (!token) return 0;
  const artists = await fetchTopArtists(token);
  let added = 0;
  for (const name of artists) {
    const normalized = normalizeName(name);
    if (!normalized) continue;
    const existing = await prisma.trackedArtist.findUnique({
      where: { userId_normalized: { userId, normalized } },
    });
    if (!existing) {
      await prisma.trackedArtist.create({
        data: { userId, name, normalized, source: "spotify" },
      });
      added++;
    }
  }
  return added;
}
