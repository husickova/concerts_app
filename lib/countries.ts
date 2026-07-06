/** Countries offered in the UI. Code = ISO 3166-1 alpha-2. */
export const COUNTRIES: { code: string; name: string }[] = [
  { code: "CZ", name: "Czech Republic" },
  { code: "SK", name: "Slovakia" },
  { code: "DE", name: "Germany" },
  { code: "AT", name: "Austria" },
  { code: "PL", name: "Poland" },
  { code: "HU", name: "Hungary" },
  { code: "GB", name: "United Kingdom" },
  { code: "FR", name: "France" },
  { code: "IT", name: "Italy" },
  { code: "ES", name: "Spain" },
  { code: "NL", name: "Netherlands" },
  { code: "BE", name: "Belgium" },
  { code: "CH", name: "Switzerland" },
  { code: "DK", name: "Denmark" },
  { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" },
  { code: "FI", name: "Finland" },
  { code: "PT", name: "Portugal" },
  { code: "IE", name: "Ireland" },
  { code: "US", name: "United States" },
];

export function countryName(code: string): string {
  return COUNTRIES.find((c) => c.code === code)?.name ?? code;
}

export function isValidCountry(code: string): boolean {
  return COUNTRIES.some((c) => c.code === code);
}
