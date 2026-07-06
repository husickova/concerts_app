export type ConcertHit = {
  artistName: string;
  date?: Date | null;
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
