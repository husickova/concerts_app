# Where's the Party?

A web app that watches for concerts by your favourite bands and emails you when a new show appears.

## What it does

- **Passwordless email sign-in (magic link)** — no passwords; the first login automatically creates an account.
- **Tracked bands and countries** — each user picks the bands to follow and the countries to search in.
- **Daily scan (once every 24 h)** — sweeps all enabled concert sources for every band x country combination.
- **Email notifications** — when a new concert is found, the user gets an email with a link. **Each concert is announced exactly once.**
- **Ticketing-first deduplication** — when several sources report the same concert (same band + day + city), it is stored once and the ticket-shop link wins (Ticketmaster / known ticketing domains).
- **Spotify** — after connecting an account, up to 100 of the user's most-played artists are imported automatically (top 50 x three time ranges, official `user-top-read` scope). The list refreshes with every daily scan.

## Concert sources

Scraping Google or Facebook directly is blocked (captcha/anti-bot) and against both
services' terms. The app therefore uses a pluggable *provider* system built on official
APIs — each provider activates itself when its keys are configured:

| Provider | Env vars | Type | Notes |
|---|---|---|---|
| **Ticketmaster Discovery** | `TICKETMASTER_API_KEY` | ticketing (priority) | [developer.ticketmaster.com](https://developer.ticketmaster.com) – free |
| **Bandsintown** | `BANDSINTOWN_APP_ID` | concert database | bands sync their Facebook events here too |
| **Google Programmable Search** | `GOOGLE_CSE_KEY`, `GOOGLE_CSE_ID` | web search (incl. `facebook.com/events`) | official API for Google results |

To add another source, implement the `ConcertProvider` interface in `lib/providers/` and register it in `lib/providers/index.ts`.

## Running locally

```bash
cp .env.example .env      # fill in NEXTAUTH_SECRET and the API keys you want to use
npm install
npm run db:push           # creates the SQLite database
npm run dev               # http://localhost:3000
```

Without `EMAIL_SERVER` (SMTP) configured, sign-in links and notification emails are
printed to the server console — handy for development.

## Daily scan

Two options, both run the same logic (`lib/scan.ts`):

1. **HTTP endpoint** `GET /api/cron/scan`, protected by a token:
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" https://your-domain/api/cron/scan
   ```
   On Vercel, `vercel.json` schedules it daily at 8:00 (Vercel Cron adds the header automatically).

2. **CLI**: `npm run scan` — for system cron:
   ```cron
   0 8 * * * cd /path/to/app && npm run scan >> scan.log 2>&1
   ```

## Deploying to production

- Set `NEXTAUTH_URL` to the public URL and strong values for `NEXTAUTH_SECRET` + `CRON_SECRET`.
- Configure SMTP (`EMAIL_SERVER`, `EMAIL_FROM`) — sign-in links won't be delivered without it.
- Add the redirect URI `{NEXTAUTH_URL}/api/spotify/callback` in the Spotify dashboard.
- SQLite is fine for small deployments; for Postgres change `provider = "postgresql"`
  in `prisma/schema.prisma`, set `DATABASE_URL` and run `npx prisma db push`.

## Architecture

```
app/                    Next.js App Router (pages + API)
  api/auth/[...nextauth]  NextAuth (magic link)
  api/artists, countries  tracked bands and countries management
  api/spotify/*           OAuth connect/callback, sync, disconnect
  api/cron/scan           daily scan (Bearer CRON_SECRET)
components/             client components for the dashboard
lib/
  scan.ts               core: collect -> dedupe -> store -> email
  providers/            concert sources (ticketmaster, bandsintown, google)
  spotify.ts            OAuth tokens + top artists import
  normalize.ts          name normalization and dedupe keys
prisma/schema.prisma    User, TrackedArtist, TrackedCountry, Concert, Notification…
scripts/scan.ts         CLI scan runner
```
