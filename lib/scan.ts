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

const DAY = 24 * 60 * 60 * 1000;

/** A hit (or several merged festival-day hits) ready to be stored. */
type EventGroup = ConcertHit & { endDate: Date | null };

/**
 * Merge hits of the same artist in the same city on consecutive days into one
 * multi-day event (festival). Returns groups with date = first day and
 * endDate = last day (or null for single-day shows).
 */
export function groupFestivalDays(hits: ConcertHit[]): EventGroup[] {
  const dated = hits.filter((h) => h.date && h.city);
  const undated = hits.filter((h) => !h.date || !h.city);

  const byPlace = new Map<string, ConcertHit[]>();
  for (const hit of dated) {
    const key = `${normalizeName(hit.artistName)}|${normalizeName(hit.city!)}`;
    const arr = byPlace.get(key);
    if (arr) arr.push(hit);
    else byPlace.set(key, [hit]);
  }

  const groups: EventGroup[] = undated.map((h) => ({ ...h, endDate: h.endDate ?? null }));

  for (const place of byPlace.values()) {
    place.sort((a, b) => a.date!.getTime() - b.date!.getTime());
    let chain: ConcertHit[] = [];
    const flush = () => {
      if (chain.length === 0) return;
      // Prefer a ticketing hit as the representative (its URL points to ticket sales).
      const rep = chain.find((h) => h.isTicketing) ?? chain[0];
      const start = chain[0].date!;
      const end = chain.reduce((max, h) => {
        const e = h.endDate ?? h.date!;
        return e > max ? e : max;
      }, start);
      groups.push({
        ...rep,
        title: chain.find((h) => h.title)?.title ?? null,
        date: start,
        endDate: end.getTime() > start.getTime() ? end : null,
      });
      chain = [];
    };
    for (const hit of place) {
      const prev = chain[chain.length - 1];
      const prevEnd = prev ? (prev.endDate ?? prev.date!) : null;
      // Same or next day -> same multi-day event; bigger gap -> separate show.
      if (prevEnd && hit.date!.getTime() - prevEnd.getTime() > 1.5 * DAY) flush();
      chain.push(hit);
    }
    flush();
  }

  return groups;
}

/**
 * Store a group in the DB, reusing an existing concert when the date ranges of
 * the same artist + city overlap (so day 2 of a festival found later does not
 * create a duplicate). Returns the concert id.
 */
async function upsertConcert(group: EventGroup): Promise<string> {
  const artistNormalized = normalizeName(group.artistName);

  if (group.date && group.city) {
    const start = group.date;
    const end = group.endDate ?? group.date;
    const cityNorm = normalizeName(group.city);
    const candidates = await prisma.concert.findMany({
      where: {
        artistNormalized,
        date: { gte: new Date(start.getTime() - 2 * DAY), lte: new Date(end.getTime() + 2 * DAY) },
      },
    });
    const existing = candidates.find((c) => {
      if (!c.date || !c.city || normalizeName(c.city) !== cityNorm) return false;
      const cEnd = c.endDate ?? c.date;
      // ranges touch or overlap (with a one-day tolerance)
      return c.date.getTime() <= end.getTime() + 1.5 * DAY && cEnd.getTime() >= start.getTime() - 1.5 * DAY;
    });

    if (existing) {
      const newStart = start < existing.date! ? start : existing.date!;
      const existingEnd = existing.endDate ?? existing.date!;
      const newEnd = end > existingEnd ? end : existingEnd;
      const upgrade = group.isTicketing && !existing.isTicketing;
      const updated = await prisma.concert.update({
        where: { id: existing.id },
        data: {
          date: newStart,
          endDate: newEnd.getTime() > newStart.getTime() ? newEnd : null,
          title: existing.title ?? group.title ?? null,
          ...(upgrade ? { url: group.url, source: group.source, isTicketing: true } : {}),
        },
      });
      return updated.id;
    }
  }

  const key = concertDedupeKey(group);
  const existingByKey = await prisma.concert.findUnique({ where: { dedupeKey: key } });
  if (existingByKey) {
    if (group.isTicketing && !existingByKey.isTicketing) {
      await prisma.concert.update({
        where: { id: existingByKey.id },
        data: { url: group.url, source: group.source, isTicketing: true },
      });
    }
    return existingByKey.id;
  }

  const created = await prisma.concert.create({
    data: {
      dedupeKey: key,
      artistName: group.artistName,
      artistNormalized,
      title: group.title ?? null,
      date: group.date ?? null,
      endDate: group.endDate ?? null,
      city: group.city ?? null,
      country: group.country ?? null,
      venue: group.venue ?? null,
      url: group.url,
      source: group.source,
      isTicketing: group.isTicketing,
    },
  });
  return created.id;
}

/**
 * Daily scan: for every user, run their bands x countries through all
 * enabled sources, dedupe the hits (ticketing wins), merge festival days
 * into one event and email the concerts the user has not been notified
 * about yet.
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

    // 2) dedupe exact duplicates - when several sources report the same concert, ticketing wins
    const byKey = new Map<string, ConcertHit>();
    for (const hit of hits) {
      const key = concertDedupeKey(hit);
      const existing = byKey.get(key);
      if (!existing || (hit.isTicketing && !existing.isTicketing)) byKey.set(key, hit);
    }

    // 3) merge consecutive festival days into one multi-day event
    const groups = groupFestivalDays([...byKey.values()]);

    // 4) store events (reusing overlapping ones, upgrading to ticketing sources)
    const concertIds: string[] = [];
    for (const group of groups) {
      concertIds.push(await upsertConcert(group));
    }
    result.concertsFound += concertIds.length;

    // 5) email only the concerts the user has not received yet
    const alreadySent = await prisma.notification.findMany({
      where: { userId: user.id, concertId: { in: concertIds } },
      select: { concertId: true },
    });
    const sentIds = new Set(alreadySent.map((n) => n.concertId));
    const newIds = [...new Set(concertIds)].filter((id) => !sentIds.has(id));
    if (newIds.length === 0) continue;

    const concerts = await prisma.concert.findMany({
      where: { id: { in: newIds } },
      orderBy: { date: "asc" },
    });

    const lines = concerts.map((c) => {
      const day = (d: Date) => d.toISOString().slice(0, 10);
      const when = c.date
        ? c.endDate
          ? `${day(c.date)} to ${day(c.endDate)}`
          : day(c.date)
        : "date via link";
      const what = [c.artistName, c.title && c.title !== c.artistName ? c.title : null]
        .filter(Boolean)
        .join(" / ");
      const where = [c.venue, c.city, c.country ? countryName(c.country) : null]
        .filter(Boolean)
        .join(", ");
      return { c, what, when, where };
    });

    const text = [
      `We found ${concerts.length} new ${concerts.length === 1 ? "show" : "shows"} by bands you follow:`,
      "",
      ...lines.map(
        ({ c, what, when, where }) => `- ${what} – ${when}${where ? ` – ${where}` : ""}\n  Tickets & info: ${c.url}`
      ),
    ].join("\n");

    const html = `
      <h2 style="font-family:Georgia,serif;font-style:italic">New shows by your bands</h2>
      <ul>
        ${lines
          .map(
            ({ c, what, when, where }) =>
              `<li style="margin-bottom:10px"><strong>${escapeHtml(what)}</strong> – ${when}${
                where ? ` – ${escapeHtml(where)}` : ""
              }<br/><a href="${c.url}">Tickets &amp; info</a></li>`
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
