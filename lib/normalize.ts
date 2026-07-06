/** Normalize a band/city name for deduplication (strip diacritics, lowercase). */
export function normalizeName(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Normalize a URL for deduplication (drop query string, trailing slash and www). */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const path = u.pathname.replace(/\/+$/, "");
    return `${host}${path}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/**
 * Concert dedupe key. When we know the date and city we dedupe across
 * sources (artist + day + city); otherwise by normalized URL.
 */
export function concertDedupeKey(hit: {
  artistName: string;
  date?: Date | null;
  city?: string | null;
  url: string;
}): string {
  const artist = normalizeName(hit.artistName);
  if (hit.date && hit.city) {
    const day = hit.date.toISOString().slice(0, 10);
    return `${artist}|${day}|${normalizeName(hit.city)}`;
  }
  return `${artist}|url:${normalizeUrl(hit.url)}`;
}
