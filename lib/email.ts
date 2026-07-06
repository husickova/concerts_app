import nodemailer from "nodemailer";

export function getTransport() {
  const server = process.env.EMAIL_SERVER;
  if (!server) return null;
  return nodemailer.createTransport(server);
}

export async function sendMail(opts: { to: string; subject: string; html: string; text: string }) {
  const transport = getTransport();
  const from = process.env.EMAIL_FROM ?? "party@localhost";
  if (!transport) {
    // Development without SMTP: just print the email to the console.
    console.log(`\n=== EMAIL (SMTP not configured) ===\nTo: ${opts.to}\nSubject: ${opts.subject}\n\n${opts.text}\n===================================\n`);
    return;
  }
  await transport.sendMail({ from, ...opts });
}
