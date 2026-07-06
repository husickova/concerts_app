import { ConcertHit, ConcertProvider } from "./types";
import { countryName } from "@/lib/countries";

/**
 * Bandsintown public API – koncertní databáze (kapely sem často syncují
 * i eventy publikované na Facebooku).
 */
export const bandsintown: ConcertProvider = {
  name: "bandsintown",
  enabled: () => Boolean(process.env.BANDSINTOWN_APP_ID),

  async search(artistName, countryCode): Promise<ConcertHit[]> {
    const appId = process.env.BANDSINTOWN_APP_ID!;
    const res = await fetch(
      `https://rest.bandsintown.com/artists/${encodeURIComponent(artistName)}/events?app_id=${encodeURIComponent(appId)}&date=upcoming`
    );
    if (res.status === 404) return []; // neznámý interpret
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
        const offer = Array.isArray(ev?.offers)
          ? ev.offers.find((o: any) => o?.type === "Tickets" && o?.url)
          : null;
        return {
          artistName,
          date: ev?.datetime ? new Date(ev.datetime) : null,
          city: ev?.venue?.city ?? null,
          country: countryCode,
          venue: ev?.venue?.name ?? null,
          url: offer?.url ?? ev?.url,
          source: "bandsintown",
          isTicketing: false,
        };
      })
      .filter((h) => Boolean(h.url));
  },
};
