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
    setMessage(res.ok ? `Naimportováno ${data.added} nových kapel.` : data?.error ?? "Sync selhal.");
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
      <h2>Spotify</h2>
      <p className="hint">
        Připoj Spotify a automaticky naimportujeme tvých až 100 nejposlouchanějších interpretů.
        Seznam se obnovuje při každém denním scanu.
      </p>
      {!configured ? (
        <p className="muted small">
          Spotify integrace není nakonfigurovaná (chybí SPOTIFY_CLIENT_ID / SECRET).
        </p>
      ) : connected ? (
        <div className="row">
          <button className="spotify" onClick={sync} disabled={busy}>
            {busy ? "Pracuji…" : "Obnovit kapely ze Spotify"}
          </button>
          <button className="secondary" onClick={disconnect} disabled={busy}>
            Odpojit
          </button>
        </div>
      ) : (
        <a href="/api/spotify/connect">
          <button className="spotify">Připojit Spotify</button>
        </a>
      )}
      {message && <p className="small" style={{ marginTop: 10 }}>{message}</p>}
    </div>
  );
}
