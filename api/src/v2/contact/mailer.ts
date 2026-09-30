import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../../config/env.js";

/**
 * How mail leaves this application. HD-4.
 *
 * One narrow interface with one implementation, which is the point. HD-4 chose
 * Gmail SMTP because it costs nothing and needs no DNS change, but the better
 * end state is Azure Communication Services with a verified sender subdomain —
 * mail DKIM-signed as harmadavtian.com instead of carrying Gmail's "via
 * gmail.com" tell. Keeping the send behind `Mailer` means that change is a new
 * file and a config switch, not a rewrite of the contact feature.
 *
 * ## Why the sender's address is Reply-To and never From
 *
 * The notification is sent by us, about them. Putting a visitor's address in
 * From would be a forgery of exactly the shape SPF and DKIM exist to catch: the
 * message would be signed by our sender while claiming to come from theirs,
 * which is what a phishing attempt looks like to a spam filter. Reply-To gets
 * the same result honestly — pressing Reply reaches the visitor.
 */

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** The visitor's address on a notification, so Reply goes to them. */
  replyTo?: string;
}

export interface Mailer {
  /** Whether mail can be sent at all; the admin says so when it cannot. */
  readonly configured: boolean;
  /** Resolves to null on success, or a short sentence describing the failure. */
  send: (message: MailMessage) => Promise<string | null>;
}

/**
 * Header injection, closed off at the boundary.
 *
 * Every value that reaches a header — the subject, and the display name and
 * address in Reply-To — is built from text a stranger typed. A carriage return
 * or newline in any of them ends the header early and starts another one, which
 * is how a crafted "name" becomes a Bcc. Nodemailer encodes headers properly
 * and would not pass these through, but relying on a library's good behaviour
 * for something this cheap to prevent is the wrong trade: they are stripped
 * here, unconditionally, before anything downstream sees them.
 */
export const headerSafe = (value: string): string =>
  value.replace(/[\r\n]+/g, " ").trim().slice(0, 300);

let transporter: Transporter | null = null;

const gmailTransport = (): Transporter | null => {
  if (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD },
    });
  }
  return transporter;
};

/**
 * The test environment never sends mail, whatever is configured.
 *
 * Not belt and braces -- this is load-bearing. `env.ts` loads `api/.env`, and
 * once a real app password lives there the suite inherits it: every test that
 * submits the form would send a genuine notification to the inbox and a
 * genuine confirmation to `visitor@example.com`. The suite has a dozen such
 * tests, so one `npm test` becomes a dozen emails and a pile of bounces.
 *
 * Found the moment a credential was first set locally -- before that the
 * tests passed only because nobody had one, which is not a safeguard, it is
 * a coincidence. The guard is here rather than in the vitest config because
 * `dotenv` repopulates anything the config deletes.
 */
const sendingDisabled = (): boolean => env.NODE_ENV === "test";

export const gmailMailer: Mailer = {
  get configured() {
    return !sendingDisabled() && Boolean(env.GMAIL_USER && env.GMAIL_APP_PASSWORD);
  },

  async send(message) {
    if (sendingDisabled()) {
      return "Email is disabled in the test environment; nothing was sent.";
    }

    const transport = gmailTransport();
    if (!transport) {
      return "Email is not configured (GMAIL_USER / GMAIL_APP_PASSWORD unset).";
    }

    try {
      await transport.sendMail({
        from: { name: headerSafe(env.MAIL_FROM_NAME), address: env.GMAIL_USER! },
        to: headerSafe(message.to),
        subject: headerSafe(message.subject),
        ...(message.replyTo ? { replyTo: headerSafe(message.replyTo) } : {}),
        text: message.text,
        html: message.html,
      });
      return null;
    } catch (error) {
      /* The message itself is never included: it holds somebody's note and
         their address, and this string is written to a database row the admin
         displays. Only what went wrong with the send. */
      return error instanceof Error ? error.message.slice(0, 500) : "Unknown mail failure";
    }
  },
};

/** The transport the contact feature uses. One line to change for ACS. */
export const mailer: Mailer = gmailMailer;
