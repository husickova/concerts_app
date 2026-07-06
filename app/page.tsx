import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SignInForm } from "@/components/SignInForm";

export default async function HomePage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <main className="container">
      <div className="hero">
        <h1>🎸 Koncerty</h1>
        <p>
          Zadej kapely a země, které tě zajímají. Jednou denně prohledáme ticketingové weby,
          koncertní databáze i Google a pošleme ti e-mail, když se objeví nový koncert.
        </p>
      </div>
      <div className="card" style={{ maxWidth: 420, margin: "0 auto" }}>
        <h2>Přihlášení / registrace</h2>
        <p className="hint">
          Zadej e-mail a pošleme ti přihlašovací odkaz. Účet se vytvoří automaticky.
        </p>
        <SignInForm />
      </div>
    </main>
  );
}
