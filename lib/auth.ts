import { NextAuthOptions, getServerSession } from "next-auth";
import EmailProvider from "next-auth/providers/email";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "./prisma";
import { sendMail } from "./email";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  pages: { signIn: "/", verifyRequest: "/check-email" },
  providers: [
    EmailProvider({
      from: process.env.EMAIL_FROM ?? "koncerty@localhost",
      maxAge: 60 * 60, // odkaz platí hodinu
      async sendVerificationRequest({ identifier, url }) {
        await sendMail({
          to: identifier,
          subject: "Přihlášení do Koncertů",
          text: `Přihlas se kliknutím na odkaz:\n${url}\n\nOdkaz platí 1 hodinu.`,
          html: `<p>Přihlas se kliknutím na tlačítko:</p>
                 <p><a href="${url}" style="display:inline-block;padding:10px 18px;background:#7c3aed;color:#fff;border-radius:8px;text-decoration:none">Přihlásit se</a></p>
                 <p style="color:#888;font-size:12px">Odkaz platí 1 hodinu. Pokud jsi o přihlášení nežádal(a), e-mail ignoruj.</p>`,
        });
      },
    }),
  ],
  callbacks: {
    session({ session, user }) {
      if (session.user) (session.user as any).id = user.id;
      return session;
    },
  },
};

export function auth() {
  return getServerSession(authOptions);
}
