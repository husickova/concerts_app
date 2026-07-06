import { prisma } from "./prisma";
import { enabledProviders } from "./providers";
import { ConcertHit } from "./providers/types";
import { concertDedupeKey, normalizeName } from "./normalize";
import { countryNameCs } from "./countries";
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
 * Denní scan: pro každého uživatele projde jeho kapely × země přes všechny
 * aktivní zdroje, deduplikuje nálezy (ticketing má přednost) a pošle e-mail
 * s koncerty, o kterých uživatel ještě nedostal zprávu.
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

    // Obnovíme top kapely ze Spotify (pokud je připojené).
    if (user.spotify) {
      try {
        await syncSpotifyArtists(user.id);
      } catch (e: any) {
        result.errors.push(`spotify sync (${user.email}): ${e?.message ?? e}`);
      }
    }

    const artists = await prisma.trackedArtist.findMany({ where: { userId: user.id } });
    if (artists.length === 0 || user.countries.length === 0) continue;

    // 1) posbírat nálezy ze všech zdrojů
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

    // 2) deduplikace – když má víc zdrojů stejný koncert, vyhrává ticketing
    const byKey = new Map<string, ConcertHit>();
    for (const hit of hits) {
      const key = concertDedupeKey(hit);
      const existing = byKey.get(key);
      if (!existing || (hit.isTicketing && !existing.isTicketing)) byKey.set(key, hit);
    }

    // 3) uložit koncerty (a případně povýšit uložený záznam na ticketingový zdroj)
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

    // 4) poslat e-mail jen o koncertech, které uživatel ještě nedostal
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
      const when = c.date ? c.date.toISOString().slice(0, 10) : "termín viz odkaz";
      const where = [c.venue, c.city, c.country ? countryNameCs(c.country) : null]
        .filter(Boolean)
        .join(", ");
      return { c, when, where };
    });

    const text = [
      `Našli jsme ${concerts.length} ${concerts.length === 1 ? "nový koncert" : "nové koncerty"} podle tvých sledovaných kapel:`,
      "",
      ...lines.map(({ c, when, where }) => `• ${c.artistName} – ${when}${where ? ` – ${where}` : ""}\n  ${c.url}`),
    ].join("\n");

    const html = `
      <h2>Nové koncerty tvých kapel 🎸</h2>
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
      <p style="color:#888;font-size:12px">Každý koncert posíláme jen jednou. Nastavení sledovaných kapel a zemí změníš v aplikaci.</p>
    `;

    try {
      await sendMail({
        to: user.email!,
        subject: `🎫 ${concerts.length} ${concerts.length === 1 ? "nový koncert" : "nové koncerty"} tvých kapel`,
        html,
        text,
      });
      // Zapíšeme notifikace až po úspěšném odeslání – každý koncert jen 1×.
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
