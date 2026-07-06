import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gig Alert – never miss a show",
  description:
    "Track your favourite bands and get an email whenever a new concert pops up in your country.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
