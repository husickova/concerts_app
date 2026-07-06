/** Normalizace názvu kapely / města pro deduplikaci (bez diakritiky, lowercase). */
export function normalizeName(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Normalizace URL pro deduplikaci (bez query stringu, trailing slashe a www). */
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
 * Deduplikační klíč koncertu. Když známe datum a město, deduplikujeme napříč
 * zdroji (artist + den + město); jinak podle normalizované URL.
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
