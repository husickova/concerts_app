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
        <strong>🎸 Koncerty</strong>
        <div className="row" style={{ alignItems: "center" }}>
          <span className="email">{session.user.email}</span>
          <SignOutButton />
        </div>
      </div>

      {searchParams.spotify === "connected" && (
        <div className="notice">
          ✅ Spotify připojeno{searchParams.added ? ` – naimportováno ${searchParams.added} nových kapel` : ""}.
        </div>
      )}
      {searchParams.spotify === "error" && (
        <div className="notice error">⚠️ Připojení Spotify se nepovedlo, zkus to znovu.</div>
      )}

      <div className="card">
        <h2>Sledované kapely</h2>
        <p className="hint">
          Přidej kapely, jejichž koncerty chceš hlídat. Kapely se zeleným okrajem jsou importované
          ze Spotify.
        </p>
        <ArtistManager
          artists={artists.map((a) => ({ id: a.id, name: a.name, source: a.source }))}
        />
      </div>

      <div className="card">
        <h2>Země</h2>
        <p className="hint">Ve kterých zemích máme koncerty hledat?</p>
        <CountryPicker
          allCountries={COUNTRIES.map((c) => ({ code: c.code, name: c.nameCs }))}
          selected={countries.map((c) => c.code)}
        />
      </div>

      <SpotifyCard connected={Boolean(spotify)} configured={spotifyConfigured()} />

      <div className="card">
        <h2>Jak to funguje</h2>
        <p className="hint" style={{ marginBottom: 0 }}>
          Jednou za 24 hodin projdeme ticketingové weby (Ticketmaster), koncertní databáze
          (Bandsintown) a Google výsledky včetně facebookových eventů. Když najdeme nový koncert
          tvé kapely ve vybrané zemi, pošleme ti e-mail s odkazem — každý koncert jen jednou.
          {notifCount > 0 && (
            <>
              {" "}
              Zatím jsme ti poslali <strong>{notifCount}</strong> koncertů.
            </>
          )}
        </p>
      </div>
    </main>
  );
}
