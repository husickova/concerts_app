"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Artist = { id: string; name: string; source: string };

export function ArtistManager({ artists }: { artists: Artist[] }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/artists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Přidání se nepovedlo.");
      return;
    }
    setName("");
    router.refresh();
  }

  async function remove(id: string) {
    await fetch(`/api/artists/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div>
      <form onSubmit={add} className="row">
        <input
          type="text"
          placeholder="např. Rammstein"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" disabled={busy}>
          Přidat
        </button>
      </form>
      {error && <p className="small" style={{ color: "#f8a5a5", marginTop: 8 }}>{error}</p>}
      <div className="chips">
        {artists.length === 0 && <span className="muted small">Zatím žádné kapely.</span>}
        {artists.map((a) => (
          <span key={a.id} className={`chip${a.source === "spotify" ? " spotify-src" : ""}`}>
            {a.name}
            <button type="button" title="Odebrat" onClick={() => remove(a.id)}>
              ✕
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
