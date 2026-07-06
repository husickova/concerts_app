import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Koncerty – hlídač koncertů tvých kapel",
  description:
    "Sleduj své oblíbené kapely a dostávej e-mail, když se objeví nový koncert ve tvé zemi.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs">
      <body>{children}</body>
    </html>
  );
}
