import { ConcertProvider } from "./types";
import { ticketmaster } from "./ticketmaster";
import { bandsintown } from "./bandsintown";
import { googleSearch } from "./googlesearch";

export const providers: ConcertProvider[] = [ticketmaster, bandsintown, googleSearch];

export function enabledProviders(): ConcertProvider[] {
  return providers.filter((p) => p.enabled());
}
