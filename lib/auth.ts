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
      from: process.env.EMAIL_FROM ?? "gigalert@localhost",
      maxAge: 60 * 60, // link valid for one hour
      async sendVerificationRequest({ identifier, url }) {
        await sendMail({
          to: identifier,
          subject: "Your Gig Alert sign-in link",
          text: `Click the link to sign in:\n${url}\n\nThe link is valid for 1 hour.`,
          html: `<p>Click the button to sign in:</p>
                 <p><a href="${url}" style="display:inline-block;padding:10px 18px;background:#211d17;color:#f6f1e5;text-decoration:none;font-family:Courier,monospace;letter-spacing:1px;text-transform:uppercase">Sign in</a></p>
                 <p style="color:#6b6355;font-size:12px">The link is valid for 1 hour. If you didn't request it, just ignore this email.</p>`,
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
