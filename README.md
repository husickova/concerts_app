# 🎸 Koncerty

Webová aplikace, která hlídá koncerty tvých oblíbených kapel a posílá ti o nich e-mail.

## Co umí

- **Přihlášení e-mailem (magic link)** – žádné heslo; první přihlášení automaticky vytvoří účet.
- **Sledované kapely a země** – uživatel si nakliká kapely a země, ve kterých chce koncerty hledat.
- **Denní scan (1× za 24 h)** – projde všechny aktivní zdroje koncertů pro každou kombinaci kapela × země.
- **E-mailové notifikace** – když se najde nový koncert, přijde e-mail s odkazem. **Každý koncert se posílá jen jednou.**
- **Deduplikace se zvýhodněním ticketingu** – když stejný koncert najde víc zdrojů (stejná kapela + den + město), uloží se jen jednou a přednost má odkaz z prodeje vstupenek (Ticketmaster / známé ticketingové domény).
- **Spotify** – po připojení účtu se automaticky naimportuje až 100 nejposlouchanějších interpretů (top 50 × tři časová období, oficiální scope `user-top-read`). Seznam se obnovuje při každém denním scanu.

## Zdroje koncertů

Přímý scraping Googlu a Facebooku je blokovaný (captcha/anti-bot) a v rozporu s podmínkami
obou služeb. Aplikace proto používá systém *providerů* s oficiálními API — zapne se každý,
který má nastavené klíče:

| Provider | Env proměnné | Typ | Poznámka |
|---|---|---|---|
| **Ticketmaster Discovery** | `TICKETMASTER_API_KEY` | 🎫 ticketing (priorita) | [developer.ticketmaster.com](https://developer.ticketmaster.com) – zdarma |
| **Bandsintown** | `BANDSINTOWN_APP_ID` | koncertní databáze | kapely sem syncují i FB eventy |
| **Google Programmable Search** | `GOOGLE_CSE_KEY`, `GOOGLE_CSE_ID` | vyhledávání (vč. `facebook.com/events`) | oficiální API ke Google výsledkům |

Další zdroj přidáš implementací rozhraní `ConcertProvider` v `lib/providers/` a registrací v `lib/providers/index.ts`.

## Spuštění lokálně

```bash
cp .env.example .env      # doplň NEXTAUTH_SECRET a API klíče, které chceš používat
npm install
npm run db:push           # vytvoří SQLite databázi
npm run dev               # http://localhost:3000
```

Bez nastaveného `EMAIL_SERVER` (SMTP) se přihlašovací odkazy i notifikační e-maily
vypisují do konzole serveru — hodí se pro vývoj.

## Denní scan

Dvě možnosti, obě spouštějí stejnou logiku (`lib/scan.ts`):

1. **HTTP endpoint** `GET /api/cron/scan` chráněný tokenem:
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" https://tvoje-domena/api/cron/scan
   ```
   Na Vercelu se o spouštění stará `vercel.json` (denně v 8:00, hlavičku doplní Vercel Cron automaticky).

2. **CLI**: `npm run scan` — pro systémový cron:
   ```cron
   0 8 * * * cd /path/to/app && npm run scan >> scan.log 2>&1
   ```

## Nasazení do produkce

- Nastav `NEXTAUTH_URL` na veřejnou URL a silný `NEXTAUTH_SECRET` + `CRON_SECRET`.
- Nastav SMTP (`EMAIL_SERVER`, `EMAIL_FROM`) — bez něj nechodí přihlašovací odkazy.
- Ve Spotify dashboardu přidej redirect URI `{NEXTAUTH_URL}/api/spotify/callback`.
- SQLite stačí pro menší provoz; pro Postgres změň `provider = "postgresql"`
  v `prisma/schema.prisma`, nastav `DATABASE_URL` a spusť `npx prisma db push`.

## Architektura

```
app/                    Next.js App Router (stránky + API)
  api/auth/[...nextauth]  NextAuth (magic link)
  api/artists, countries  správa sledovaných kapel a zemí
  api/spotify/*           OAuth connect/callback, sync, disconnect
  api/cron/scan           denní scan (Bearer CRON_SECRET)
components/             klientské komponenty dashboardu
lib/
  scan.ts               jádro: sběr → deduplikace → uložení → e-maily
  providers/            zdroje koncertů (ticketmaster, bandsintown, google)
  spotify.ts            OAuth tokeny + import top interpretů
  normalize.ts          normalizace názvů a dedupe klíče
prisma/schema.prisma    User, TrackedArtist, TrackedCountry, Concert, Notification…
scripts/scan.ts         CLI spouštěč scanu
```
