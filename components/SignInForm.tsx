"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export function SignInForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    await signIn("email", { email, callbackUrl: "/dashboard" });
  }

  return (
    <form onSubmit={submit}>
      <div className="row">
        <input
          type="email"
          required
          placeholder="tvuj@email.cz"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" disabled={loading}>
          {loading ? "Posílám…" : "Poslat odkaz"}
        </button>
      </div>
    </form>
  );
}
