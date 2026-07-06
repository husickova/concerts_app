"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SpotifyCard({ connected, configured }: { connected: boolean; configured: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  async function sync() {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/spotify/sync", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setMessage(res.ok ? `Imported ${data.added} new artists.` : data?.error ?? "Sync failed.");
    router.refresh();
  }

  async function disconnect() {
    setBusy(true);
    await fetch("/api/spotify/disconnect", { method: "POST" });
    setBusy(false);
    setMessage(null);
    router.refresh();
  }

  return (
    <div className="card">
      <span className="kicker">03 / Autopilot</span>
      <h2>Plug in Spotify</h2>
      <p className="hint">
        Connect your Spotify account and we&apos;ll import up to 100 of your most-played artists
        automatically. The list refreshes with every daily sweep.
      </p>
      {!configured ? (
        <p className="muted small">
          Spotify integration is not configured (missing SPOTIFY_CLIENT_ID / SECRET).
        </p>
      ) : connected ? (
        <div className="row">
          <button className="accent" onClick={sync} disabled={busy}>
            {busy ? "Working…" : "Refresh from Spotify"}
          </button>
          <button className="secondary" onClick={disconnect} disabled={busy}>
            Disconnect
          </button>
        </div>
      ) : (
        <a href="/api/spotify/connect">
          <button className="accent">Connect Spotify</button>
        </a>
      )}
      {message && <p className="small" style={{ marginTop: 12 }}>{message}</p>}
    </div>
  );
}
