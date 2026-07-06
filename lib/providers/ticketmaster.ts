import { ConcertHit, ConcertProvider } from "./types";
import { normalizeName } from "@/lib/normalize";

/**
 * Ticketmaster Discovery API - the official ticketing source.
 * https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/
 */
export const ticketmaster: ConcertProvider = {
  name: "ticketmaster",
  enabled: () => Boolean(process.env.TICKETMASTER_API_KEY),

  async search(artistName, countryCode): Promise<ConcertHit[]> {
    const params = new URLSearchParams({
      apikey: process.env.TICKETMASTER_API_KEY!,
      keyword: artistName,
      countryCode,
      classificationName: "music",
      size: "50",
      sort: "date,asc",
    });
    const res = await fetch(`https://app.ticketmaster.com/discovery/v2/events.json?${params}`);
    if (!res.ok) throw new Error(`ticketmaster: HTTP ${res.status}`);
    const data = await res.json();
    const events: any[] = data?._embedded?.events ?? [];
    const wanted = normalizeName(artistName);

    return events
      .filter((ev) => {
        // Keyword search also returns unrelated events - verify the artist name.
        const attractions: any[] = ev?._embedded?.attractions ?? [];
        const names = [ev?.name, ...attractions.map((a) => a?.name)].filter(Boolean);
        return names.some((n: string) => normalizeName(n).includes(wanted));
      })
      .map((ev): ConcertHit => {
        const venue = ev?._embedded?.venues?.[0];
        const localDate = ev?.dates?.start?.localDate;
        return {
          artistName,
          date: localDate ? new Date(`${localDate}T12:00:00Z`) : null,
          city: venue?.city?.name ?? null,
          country: venue?.country?.countryCode ?? countryCode,
          venue: venue?.name ?? null,
          url: ev?.url,
          source: "ticketmaster",
          isTicketing: true,
        };
      })
      .filter((h) => Boolean(h.url));
  },
};
