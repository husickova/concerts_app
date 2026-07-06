import { prisma } from "./prisma";
import { enabledProviders } from "./providers";
import { ConcertHit } from "./providers/types";
import { concertDedupeKey, normalizeName } from "./normalize";
import { countryName } from "./countries";
import { sendMail } from "./email";
import { syncSpotifyArtists } from "./spotify";

export type ScanResult = {
  users: number;
  providers: string[];
  concertsFound: number;
  emailsSent: number;
  errors: string[];
};

/**
 * Daily scan: for every user, run their bands x countries through all
 * enabled sources, dedupe the hits (ticketing wins) and email the concerts
 * the user has not been notified about yet.
 */
export async function runScan(): Promise<ScanResult> {
  const providers = enabledProviders();
  const result: ScanResult = {
    users: 0,
    providers: providers.map((p) => p.name),
    concertsFound: 0,
    emailsSent: 0,
    errors: [],
  };

  const users = await prisma.user.findMany({
    where: { email: { not: null } },
    include: { artists: true, countries: true, spotify: true },
  });

  for (const user of users) {
    result.users++;

    // Refresh top artists from Spotify (when connected).
    if (user.spotify) {
      try {
        await syncSpotifyArtists(user.id);
      } catch (e: any) {
        result.errors.push(`spotify sync (${user.email}): ${e?.message ?? e}`);
      }
    }

    const artists = await prisma.trackedArtist.findMany({ where: { userId: user.id } });
    if (artists.length === 0 || user.countries.length === 0) continue;

    // 1) collect hits from all sources
    const hits: ConcertHit[] = [];
    for (const artist of artists) {
      for (const country of user.countries) {
        for (const provider of providers) {
          try {
            hits.push(...(await provider.search(artist.name, country.code)));
          } catch (e: any) {
            result.errors.push(`${provider.name} (${artist.name}, ${country.code}): ${e?.message ?? e}`);
          }
        }
      }
    }

    // 2) dedupe - when several sources report the same concert, ticketing wins
    const byKey = new Map<string, ConcertHit>();
    for (const hit of hits) {
      const key = concertDedupeKey(hit);
      const existing = byKey.get(key);
      if (!existing || (hit.isTicketing && !existing.isTicketing)) byKey.set(key, hit);
    }

    // 3) store concerts (and upgrade a stored record to a ticketing source when possible)
    const concertIds: string[] = [];
    for (const [key, hit] of byKey) {
      const existing = await prisma.concert.findUnique({ where: { dedupeKey: key } });
      let concert;
      if (!existing) {
        concert = await prisma.concert.create({
          data: {
            dedupeKey: key,
            artistName: hit.artistName,
            artistNormalized: normalizeName(hit.artistName),
            date: hit.date ?? null,
            city: hit.city ?? null,
            country: hit.country ?? null,
            venue: hit.venue ?? null,
            url: hit.url,
            source: hit.source,
            isTicketing: hit.isTicketing,
          },
        });
      } else if (hit.isTicketing && !existing.isTicketing) {
        concert = await prisma.concert.update({
          where: { id: existing.id },
          data: { url: hit.url, source: hit.source, isTicketing: true },
        });
      } else {
        concert = existing;
      }
      concertIds.push(concert.id);
    }
    result.concertsFound += concertIds.length;

    // 4) email only the concerts the user has not received yet
    const alreadySent = await prisma.notification.findMany({
      where: { userId: user.id, concertId: { in: concertIds } },
      select: { concertId: true },
    });
    const sentIds = new Set(alreadySent.map((n) => n.concertId));
    const newIds = concertIds.filter((id) => !sentIds.has(id));
    if (newIds.length === 0) continue;

    const concerts = await prisma.concert.findMany({
      where: { id: { in: newIds } },
      orderBy: { date: "asc" },
    });

    const lines = concerts.map((c) => {
      const when = c.date ? c.date.toISOString().slice(0, 10) : "date via link";
      const where = [c.venue, c.city, c.country ? countryName(c.country) : null]
        .filter(Boolean)
        .join(", ");
      return { c, when, where };
    });

    const text = [
      `We found ${concerts.length} new ${concerts.length === 1 ? "show" : "shows"} by bands you follow:`,
      "",
      ...lines.map(({ c, when, where }) => `- ${c.artistName} – ${when}${where ? ` – ${where}` : ""}\n  ${c.url}`),
    ].join("\n");

    const html = `
      <h2 style="font-family:Georgia,serif;font-style:italic">New shows by your bands</h2>
      <ul>
        ${lines
          .map(
            ({ c, when, where }) =>
              `<li style="margin-bottom:10px"><strong>${escapeHtml(c.artistName)}</strong> – ${when}${
                where ? ` – ${escapeHtml(where)}` : ""
              }<br/><a href="${c.url}">${c.url}</a></li>`
          )
          .join("")}
      </ul>
      <p style="color:#6b6355;font-size:12px">Each concert is announced exactly once. Manage your bands and countries in the app.</p>
    `;

    try {
      await sendMail({
        to: user.email!,
        subject: `${concerts.length} new ${concerts.length === 1 ? "show" : "shows"} by bands you follow`,
        html,
        text,
      });
      // Record notifications only after a successful send - each concert exactly once.
      await prisma.notification.createMany({
        data: newIds.map((concertId) => ({ userId: user.id, concertId })),
      });
      result.emailsSent++;
    } catch (e: any) {
      result.errors.push(`email (${user.email}): ${e?.message ?? e}`);
    }
  }

  return result;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
