# Where's the Music?

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

The schema targets Postgres (that's what production runs on). Easiest local setup is a
free [Neon](https://neon.tech) database — create a project, copy the connection string:

```bash
cp .env.example .env      # fill in DATABASE_URL, NEXTAUTH_SECRET and any API keys
npm install
npm run db:push           # creates the tables
npm run dev               # http://localhost:3000
```

Alternatively run Postgres in Docker (`docker run -e POSTGRES_PASSWORD=dev -p 5432:5432 postgres`)
and use `DATABASE_URL="postgres://postgres:dev@localhost:5432/postgres"`. If you prefer a
zero-dependency SQLite setup for hacking, change `provider` to `"sqlite"` in
`prisma/schema.prisma` and set `DATABASE_URL="file:./dev.db"` — just don't commit that change.

Without `EMAIL_SERVER` (SMTP) configured, sign-in links and notification emails are
printed to the server console — handy for development.

## Deploying to Vercel

The repo is Vercel-ready: `vercel.json` schedules the daily scan, and the build script
runs `prisma generate` automatically.

1. **Database — Neon.** Create a free project at [neon.tech](https://neon.tech) and copy
   the connection string. Create the tables by running locally:
   ```bash
   DATABASE_URL="postgres://...neon.tech/..." npx prisma db push
   ```
2. **Email — Resend.** Sign up at [resend.com](https://resend.com) (free tier: 100
   emails/day), verify your domain (or use their test domain to start), create an API key.
   SMTP values: `EMAIL_SERVER="smtp://resend:YOUR_API_KEY@smtp.resend.com:587"`. Any other
   SMTP provider works too.
3. **Import the repo** at [vercel.com/new](https://vercel.com/new) — pick this GitHub repo,
   framework auto-detects as Next.js.
4. **Environment variables** (Project → Settings → Environment Variables): everything from
   `.env.example` — `DATABASE_URL`, `NEXTAUTH_URL` (your production URL, e.g.
   `https://your-app.vercel.app`), `NEXTAUTH_SECRET` (`openssl rand -base64 32`),
   `EMAIL_SERVER`, `EMAIL_FROM`, `CRON_SECRET` (random string; Vercel Cron sends it
   automatically as the Authorization header), plus the concert-source and Spotify keys
   you use.
5. **Deploy.** Vercel builds on every push to the production branch.
6. **Spotify** (optional): in the [Spotify dashboard](https://developer.spotify.com/dashboard)
   add the redirect URI `https://your-app.vercel.app/api/spotify/callback`.
7. **Check the cron**: Project → Settings → Cron Jobs should list `/api/cron/scan`
   (daily at 8:00 UTC). Trigger it manually anytime with:
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" https://your-app.vercel.app/api/cron/scan
   ```

Note: on the Hobby plan cron jobs run once a day at an approximate time, which is exactly
what this app needs.

## Self-hosting instead

Any Node host works (Railway, Render, a VPS): `npm run build && npm start`, and schedule
`npm run scan` with system cron. On a persistent server you can also keep SQLite.

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
