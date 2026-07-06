import { ConcertHit, ConcertProvider } from "./types";
import { countryName } from "@/lib/countries";

/** Ticketing vendor domains - such results take priority during deduplication. */
const TICKETING_DOMAINS = [
  "ticketmaster.",
  "ticketportal.",
  "goout.",
  "eventim.",
  "ticketstream.",
  "livenation.",
  "ticketon.",
  "smsticket.",
  "eventbrite.",
  "seetickets.",
  "dice.fm",
];

/**
 * Google Programmable Search API - the official way to query Google results.
 * Searches the web for concerts including facebook.com/events (scraping
 * Google or Facebook directly is blocked and against their terms).
 */
export const googleSearch: ConcertProvider = {
  name: "google",
  enabled: () => Boolean(process.env.GOOGLE_CSE_KEY && process.env.GOOGLE_CSE_ID),

  async search(artistName, countryCode): Promise<ConcertHit[]> {
    const year = new Date().getFullYear();
    const q = `"${artistName}" (concert OR koncert OR tour OR tickets) ${countryName(countryCode)} ${year}`;
    const params = new URLSearchParams({
      key: process.env.GOOGLE_CSE_KEY!,
      cx: process.env.GOOGLE_CSE_ID!,
      q,
      num: "10",
      gl: countryCode.toLowerCase(),
    });
    const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`);
    if (!res.ok) throw new Error(`google: HTTP ${res.status}`);
    const data = await res.json();
    const items: any[] = data?.items ?? [];

    return items
      .filter((it) => Boolean(it?.link))
      .map((it): ConcertHit => {
        const link: string = it.link;
        const isTicketing = TICKETING_DOMAINS.some((d) => link.includes(d));
        return {
          artistName,
          date: null,
          city: null,
          country: countryCode,
          venue: it?.title ?? null,
          url: link,
          source: "google",
          isTicketing,
        };
      });
  },
};
