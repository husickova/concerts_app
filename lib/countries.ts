/** Země nabízené v UI. Kód = ISO 3166-1 alpha-2. */
export const COUNTRIES: { code: string; name: string; nameCs: string }[] = [
  { code: "CZ", name: "Czech Republic", nameCs: "Česko" },
  { code: "SK", name: "Slovakia", nameCs: "Slovensko" },
  { code: "DE", name: "Germany", nameCs: "Německo" },
  { code: "AT", name: "Austria", nameCs: "Rakousko" },
  { code: "PL", name: "Poland", nameCs: "Polsko" },
  { code: "HU", name: "Hungary", nameCs: "Maďarsko" },
  { code: "GB", name: "United Kingdom", nameCs: "Velká Británie" },
  { code: "FR", name: "France", nameCs: "Francie" },
  { code: "IT", name: "Italy", nameCs: "Itálie" },
  { code: "ES", name: "Spain", nameCs: "Španělsko" },
  { code: "NL", name: "Netherlands", nameCs: "Nizozemsko" },
  { code: "BE", name: "Belgium", nameCs: "Belgie" },
  { code: "CH", name: "Switzerland", nameCs: "Švýcarsko" },
  { code: "DK", name: "Denmark", nameCs: "Dánsko" },
  { code: "SE", name: "Sweden", nameCs: "Švédsko" },
  { code: "NO", name: "Norway", nameCs: "Norsko" },
  { code: "FI", name: "Finland", nameCs: "Finsko" },
  { code: "PT", name: "Portugal", nameCs: "Portugalsko" },
  { code: "IE", name: "Ireland", nameCs: "Irsko" },
  { code: "US", name: "United States", nameCs: "USA" },
];

export function countryName(code: string): string {
  return COUNTRIES.find((c) => c.code === code)?.name ?? code;
}

export function countryNameCs(code: string): string {
  return COUNTRIES.find((c) => c.code === code)?.nameCs ?? code;
}

export function isValidCountry(code: string): boolean {
  return COUNTRIES.some((c) => c.code === code);
}
