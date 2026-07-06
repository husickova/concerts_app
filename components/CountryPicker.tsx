"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Country = { code: string; name: string };

export function CountryPicker({
  allCountries,
  selected,
}: {
  allCountries: Country[];
  selected: string[];
}) {
  const [codes, setCodes] = useState<Set<string>>(new Set(selected));
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function toggle(code: string) {
    const next = new Set(codes);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setCodes(next);
    setSaving(true);
    await fetch("/api/countries", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codes: [...next] }),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <div>
      <div className="country-grid">
        {allCountries.map((c) => {
          const checked = codes.has(c.code);
          return (
            <label key={c.code} className={`country-item${checked ? " checked" : ""}`}>
              <input type="checkbox" checked={checked} onChange={() => toggle(c.code)} />
              {c.name}
            </label>
          );
        })}
      </div>
      <p className="muted small" style={{ marginTop: 10, minHeight: 20 }}>
        {saving
          ? "Saving…"
          : codes.size === 0
            ? "Tick at least one country, otherwise we have nowhere to look."
            : ""}
      </p>
    </div>
  );
}
