import type { ContactSettings } from "@hd/content-schema";
import { env } from "../../config/env.js";
import { mailer, type MailMessage } from "./mailer.js";

/**
 * The two messages a contact submission produces. HD-4.
 *
 * A notification to Harma, and — unless the setting is off — a confirmation to
 * whoever filled the form in. Both quote the reference, which is the only thing
 * either of them can be looked up by later.
 *
 * ## Mail never decides whether a message survives
 *
 * The row is written before any of this runs, and nothing here may fail a
 * submission. A note lost because Gmail was rate-limiting is the one failure in
 * this feature that actually costs something, so a send that fails is recorded
 * on the row (`mailError`) and the visitor is still told their message arrived —
 * because it did. That is why `sendContactMails` resolves with a string instead
 * of throwing: the caller has a row to finish writing either way.
 *
 * ## Escaping, and why it is done here rather than on the way in
 *
 * Everything below is built from text a stranger typed, and this is the one
 * place it becomes HTML. So it is escaped here, at the boundary, and the stored
 * copy stays exactly what was written. Somebody writing to a developer's
 * portfolio may perfectly well want to show me a snippet of code; stripping or
 * rejecting it would mangle a legitimate message to no benefit, because the
 * defence that matters is that the text is never *interpreted* as code anywhere
 * it is displayed.
 *
 * Escape first, format second. Doing it the other way round — inserting `<br>`
 * and then escaping — would escape our own tags into visible text, and doing
 * only one of the two lets `<script>` through. Both mistakes are easy and only
 * one of them is obvious.
 */

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Text to paragraphs, escaped on the way. */
const paragraphs = (text: string): string =>
  text
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 12px">${escapeHtml(block).replace(/\n/g, "<br />")}</p>`)
    .join("\n");

/* A deliberately plain template. Inline styles only -- every other mechanism a
   browser offers is unreliable in email clients -- and no images, so nothing
   depends on a remote fetch the recipient's client may block. */
const wrap = (inner: string): string =>
  [
    `<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1a1a1a;max-width:560px">`,
    inner,
    `</div>`,
  ].join("\n");

const referenceBlock = (reference: string): string =>
  `<p style="margin:20px 0;padding:12px 16px;background:#f4f4f5;border-left:3px solid #2563eb">` +
  `Reference: <strong style="letter-spacing:0.08em">${escapeHtml(reference)}</strong>` +
  `</p>`;

export interface MailableSubmission {
  reference: string;
  name: string;
  email: string;
  message: string;
  submittedAt: Date;
  sourcePath?: string;
}

/** The submission's own answers, as a table that reads at a glance. */
const detailRows = (submission: MailableSubmission): string => {
  const rows: Array<[string, string | undefined]> = [
    ["Name", submission.name],
    ["Email", submission.email],
    ["Sent", submission.submittedAt.toISOString()],
    ["From page", submission.sourcePath],
  ];

  return rows
    .filter((row): row is [string, string] => Boolean(row[1]))
    .map(
      ([label, value]) =>
        `<tr>` +
        `<td style="padding:5px 16px 5px 0;color:#666;vertical-align:top;white-space:nowrap">${label}</td>` +
        `<td style="padding:5px 0;vertical-align:top">${escapeHtml(value).replace(/\n/g, "<br />")}</td>` +
        `</tr>`,
    )
    .join("\n");
};

const notification = (
  submission: MailableSubmission,
  settings: ContactSettings,
): MailMessage => {
  const html = wrap(
    [
      `<p style="margin:0 0 12px"><strong>New contact form message</strong></p>`,
      `<table style="border-collapse:collapse;margin:0 0 16px">${detailRows(submission)}</table>`,
      `<div style="padding:14px 16px;background:#f8f8f9;border-radius:6px">`,
      paragraphs(submission.message),
      `</div>`,
      referenceBlock(submission.reference),
      `<p style="margin:0;color:#666;font-size:13px">Press Reply to answer ${escapeHtml(submission.name)} directly.</p>`,
    ].join("\n"),
  );

  const text = [
    "New contact form message",
    "",
    `Name:  ${submission.name}`,
    `Email: ${submission.email}`,
    `Sent:  ${submission.submittedAt.toISOString()}`,
    ...(submission.sourcePath ? [`Page:  ${submission.sourcePath}`] : []),
    "",
    submission.message,
    "",
    `Reference: ${submission.reference}`,
  ].join("\n");

  return {
    to: settings.notifyEmail,
    /* The name is in the subject because that is what makes an inbox scannable,
       and it is escaped into the header by `headerSafe` in mailer.ts. */
    subject: `Contact form: ${submission.name}`,
    replyTo: submission.email,
    html,
    text,
  };
};

const confirmation = (
  submission: MailableSubmission,
  settings: ContactSettings,
): MailMessage => {
  const html = wrap(
    [
      paragraphs(settings.confirmationBody),
      `<div style="margin:18px 0;padding:14px 16px;background:#f8f8f9;border-radius:6px">`,
      `<p style="margin:0 0 8px;color:#666;font-size:13px">What you sent:</p>`,
      paragraphs(submission.message),
      `</div>`,
      referenceBlock(submission.reference),
      `<p style="margin:0;color:#666;font-size:13px">`,
      `<a href="${escapeHtml(env.SITE_PUBLIC_URL)}" style="color:#2563eb">${escapeHtml(env.SITE_PUBLIC_URL)}</a>`,
      `</p>`,
    ].join("\n"),
  );

  const text = [
    settings.confirmationBody,
    "",
    "What you sent:",
    "",
    submission.message,
    "",
    `Reference: ${submission.reference}`,
    env.SITE_PUBLIC_URL,
  ].join("\n");

  return {
    to: submission.email,
    subject: settings.confirmationSubject,
    html,
    text,
  };
};

/**
 * Sends both messages, reporting what went wrong rather than throwing.
 *
 * The two sends are attempted independently: a confirmation rejected because
 * the visitor mistyped their own address must not also stop Harma hearing that
 * somebody wrote in. Returns null when everything went out.
 */
export const sendContactMails = async (
  submission: MailableSubmission,
  settings: ContactSettings,
): Promise<string | null> => {
  if (!mailer.configured) {
    /* Not an error in development, but still recorded: a message nobody was
       told about should say so on its own row rather than look delivered. */
    return "Email is not configured; nothing was sent.";
  }

  const failures: string[] = [];

  const notifyError = await mailer.send(notification(submission, settings));
  if (notifyError) failures.push(`notification: ${notifyError}`);

  if (settings.confirmationEnabled) {
    const confirmError = await mailer.send(confirmation(submission, settings));
    if (confirmError) failures.push(`confirmation: ${confirmError}`);
  }

  return failures.length > 0 ? failures.join(" | ").slice(0, 1_000) : null;
};

/** Exported for the unit tests, which check the escaping directly. */
export const __testing = { escapeHtml, paragraphs, notification, confirmation };
