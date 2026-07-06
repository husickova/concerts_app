import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { COUNTRIES } from "@/lib/countries";
import { spotifyConfigured } from "@/lib/spotify";
import { ArtistManager } from "@/components/ArtistManager";
import { CountryPicker } from "@/components/CountryPicker";
import { SpotifyCard } from "@/components/SpotifyCard";
import { SignOutButton } from "@/components/SignOutButton";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { spotify?: string; added?: string };
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const [artists, countries, spotify, notifCount] = await Promise.all([
    prisma.trackedArtist.findMany({
      where: { userId: session.user.id },
      orderBy: [{ source: "asc" }, { name: "asc" }],
    }),
    prisma.trackedCountry.findMany({ where: { userId: session.user.id } }),
    prisma.spotifyAccount.findUnique({ where: { userId: session.user.id } }),
    prisma.notification.count({ where: { userId: session.user.id } }),
  ]);

  return (
    <main className="container">
      <div className="topbar">
        <span className="brand">Where&apos;s the Party?</span>
        <div className="row" style={{ alignItems: "center" }}>
          <span className="email">{session.user.email}</span>
          <SignOutButton />
        </div>
      </div>

      {searchParams.spotify === "connected" && (
        <div className="notice">
          Spotify connected{searchParams.added ? ` — imported ${searchParams.added} new artists` : ""}.
        </div>
      )}
      {searchParams.spotify === "error" && (
        <div className="notice error">Connecting Spotify failed. Give it another try.</div>
      )}

      <div className="card">
        <span className="kicker">01 / Lineup</span>
        <h2>Bands you follow</h2>
        <p className="hint">
          Add the bands whose shows you want to catch. Dashed borders mark artists imported from
          Spotify.
        </p>
        <ArtistManager
          artists={artists.map((a) => ({ id: a.id, name: a.name, source: a.source }))}
        />
      </div>

      <div className="card">
        <span className="kicker">02 / Territory</span>
        <h2>Where should we look?</h2>
        <p className="hint">We only report shows happening in the countries you tick.</p>
        <CountryPicker
          allCountries={COUNTRIES.map((c) => ({ code: c.code, name: c.name }))}
          selected={countries.map((c) => c.code)}
        />
      </div>

      <SpotifyCard connected={Boolean(spotify)} configured={spotifyConfigured()} />

      <div className="card">
        <span className="kicker">04 / The deal</span>
        <h2>How it works</h2>
        <p className="hint" style={{ marginBottom: 0 }}>
          Once every 24 hours we sweep ticketing sites (Ticketmaster), concert databases
          (Bandsintown) and Google results including Facebook events. When a new show by one of
          your bands appears in a country you follow, you get an email with the link — each
          concert exactly once.
          {notifCount > 0 && (
            <>
              {" "}
              So far we&apos;ve sent you <strong>{notifCount}</strong> concert
              {notifCount === 1 ? "" : "s"}.
            </>
          )}
        </p>
      </div>
    </main>
  );
}
