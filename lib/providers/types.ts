export type ConcertHit = {
  artistName: string;
  date?: Date | null;
  city?: string | null;
  country?: string | null; // ISO kód
  venue?: string | null;
  url: string;
  source: string;
  /** Zdroj je prodej vstupenek – při deduplikaci má přednost. */
  isTicketing: boolean;
};

export type ConcertProvider = {
  name: string;
  /** Provider je aktivní, jen když má nastavené potřebné API klíče. */
  enabled: () => boolean;
  search: (artistName: string, countryCode: string) => Promise<ConcertHit[]>;
};
