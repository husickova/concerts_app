"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button className="secondary" onClick={() => signOut({ callbackUrl: "/" })}>
      Sign out
    </button>
  );
}
