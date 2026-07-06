export type ConcertHit = {
  artistName: string;
  /** Event/festival name when the source provides one (e.g. "Rock am Ring 2026"). */
  title?: string | null;
  date?: Date | null;
  /** Last day for multi-day events (festivals); null/undefined for single-day shows. */
  endDate?: Date | null;
  city?: string | null;
  country?: string | null; // ISO code
  venue?: string | null;
  url: string;
  source: string;
  /** Source sells tickets - takes priority during deduplication. */
  isTicketing: boolean;
};

export type ConcertProvider = {
  name: string;
  /** Provider is active only when its API keys are configured. */
  enabled: () => boolean;
  search: (artistName: string, countryCode: string) => Promise<ConcertHit[]>;
};
