import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SignInForm } from "@/components/SignInForm";

export default async function HomePage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <main className="container">
      <div className="hero">
        <span className="kicker">A concert watchdog for people who hate missing out</span>
        <h1>
          Where&apos;s the <em>Music?</em>
        </h1>
        <p>
          Pick your bands and your countries. Once a day we sweep ticketing sites, concert
          databases and Google — and email you the moment a new show turns up. Every show,
          announced once.
        </p>
      </div>
      <div className="card" style={{ maxWidth: 460 }}>
        <span className="kicker">Sign in / sign up</span>
        <h2>No passwords here</h2>
        <p className="hint">
          Drop your email and we&apos;ll send you a magic link. First login creates your account.
        </p>
        <SignInForm />
      </div>
    </main>
  );
}
