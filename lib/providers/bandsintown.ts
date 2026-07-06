import { ConcertHit, ConcertProvider } from "./types";
import { countryName } from "@/lib/countries";

/**
 * Bandsintown public API - concert database (bands often sync their
 * Facebook events here too).
 */
export const bandsintown: ConcertProvider = {
  name: "bandsintown",
  enabled: () => Boolean(process.env.BANDSINTOWN_APP_ID),

  async search(artistName, countryCode): Promise<ConcertHit[]> {
    const appId = process.env.BANDSINTOWN_APP_ID!;
    const res = await fetch(
      `https://rest.bandsintown.com/artists/${encodeURIComponent(artistName)}/events?app_id=${encodeURIComponent(appId)}&date=upcoming`
    );
    if (res.status === 404) return []; // unknown artist
    if (!res.ok) throw new Error(`bandsintown: HTTP ${res.status}`);
    const events = await res.json();
    if (!Array.isArray(events)) return [];

    const wantedCountry = countryName(countryCode).toLowerCase();

    return events
      .filter((ev: any) => {
        const c = String(ev?.venue?.country ?? "").toLowerCase();
        return c === wantedCountry || c === countryCode.toLowerCase();
      })
      .map((ev: any): ConcertHit => {
        // Prefer the ticket-shop link when the event has one; fall back to the event page.
        const offer = Array.isArray(ev?.offers)
          ? ev.offers.find((o: any) => o?.type === "Tickets" && o?.url)
          : null;
        return {
          artistName,
          title: ev?.title ?? null,
          date: ev?.datetime ? new Date(ev.datetime) : null,
          endDate: null,
          city: ev?.venue?.city ?? null,
          country: countryCode,
          venue: ev?.venue?.name ?? null,
          url: offer?.url ?? ev?.url,
          source: "bandsintown",
          isTicketing: Boolean(offer),
        };
      })
      .filter((h) => Boolean(h.url));
  },
};
