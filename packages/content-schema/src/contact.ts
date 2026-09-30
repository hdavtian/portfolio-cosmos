import { z } from "zod";

/**
 * The contact form: what a visitor may send, and how a message is managed
 * afterwards. HD-4.
 *
 * ## Why this file is not part of the content bundle
 *
 * Every schema in `collections.ts` flows into the release snapshot that
 * `contentRouter` serves and `releaseService` publishes. Submissions must not:
 * they are runtime data written by strangers, they grow without limit, and a
 * release is meant to be a reviewable description of the *site*, not a copy of
 * everybody's messages. So they live in their own collection, behind their own
 * router, and nothing here is exported into `contentBundleSchema`.
 *
 * The same goes for the settings below. They are edited in the admin and take
 * effect immediately, with no publish step, because an operator changing the
 * wording of a confirmation email should not have to publish the whole site.
 */

/** How long a message may be. See the note on `message` for the reasoning. */
export const CONTACT_MESSAGE_MIN = 20;
export const CONTACT_MESSAGE_MAX = 4_000;

/**
 * Where a message is in Harma's own triage, from HD-4.
 *
 * `new` is the default and the only one the public endpoint can write; the
 * other four are set by hand in the admin. `test` exists so a message sent
 * while checking the form can be marked as such rather than deleted, which
 * keeps the count of real inquiries honest.
 */
export const CONTACT_STATUSES = ["new", "open", "closed", "spam", "test"] as const;

export const contactStatusSchema = z.enum(CONTACT_STATUSES);

export type ContactStatus = z.infer<typeof contactStatusSchema>;

/** The label for each status, so the form and the grid never disagree. */
export const CONTACT_STATUS_LABELS: Record<ContactStatus, string> = {
  new: "New",
  open: "Open",
  closed: "Closed",
  spam: "Spam",
  test: "Test",
};

/**
 * What the public form posts.
 *
 * The three visible fields carry hard length caps, and every one of them is a
 * sanity limit rather than a number anybody writing a genuine note will meet:
 *
 * - `name` at 160 matches the financing form on the other site. Comfortably
 *   over any real name, including the long ones that cheap forms truncate.
 * - `email` at 254 is the RFC 5321 maximum for an address, so the cap can
 *   never reject a legal one.
 * - `message` between 20 and 4,000. The floor exists because "hi" costs a
 *   notification email and tells Harma nothing; the ceiling is about 600 words,
 *   which is a long note and nowhere near a pasted document.
 *
 * Nothing here strips or rewrites what was typed. A visitor may perfectly well
 * write `<script>` in a message to a developer's portfolio, and mangling it
 * would be both rude and useless: the defence is that the text is never
 * interpreted as code anywhere it is later shown. See `contactMail.ts` for the
 * escaping on the way into an email, and note that React escapes text children
 * in the admin, which is why no cell there may use a raw HTML template.
 *
 * The email check is deliberately loose for the same reason it is on the other
 * site: strict address validation rejects legal addresses, and the real test of
 * an address is whether a reply arrives. This catches the obvious typo.
 */
export const contactSubmissionInputSchema = z.object({
  name: z.string().trim().min(1, "Your name is required").max(160),
  email: z.string().trim().max(254).pipe(z.email("That email address does not look right")),
  message: z
    .string()
    .trim()
    .min(CONTACT_MESSAGE_MIN, `Please write at least ${CONTACT_MESSAGE_MIN} characters`)
    .max(CONTACT_MESSAGE_MAX),

  /**
   * The honeypot. Offered to bots, hidden from people, expected to be empty.
   * Named for something a form-filler would plausibly want to complete.
   */
  website: z.string().max(255).optional(),

  /** When the form was rendered, in milliseconds. See TOO_FAST_MS in the router. */
  renderedAt: z.coerce.number().int().optional(),

  /** The ALTCHA payload, base64 JSON. */
  altcha: z.string().max(20_000).optional(),
});

export type ContactSubmissionInput = z.infer<typeof contactSubmissionInputSchema>;

/**
 * A stored message.
 *
 * `reference` is what a person can quote back and what the emails carry; it is
 * the only handle on a message that exists outside the database. `fingerprint`
 * is how the same note submitted twice is recognised — see the duplicate guard
 * in the public router.
 */
export const contactSubmissionSchema = contactSubmissionInputSchema
  .pick({ name: true, email: true, message: true })
  .extend({
    reference: z.string().min(1).max(32),
    status: contactStatusSchema.default("new"),
    /** Harma's own notes, never sent to anybody. */
    notes: z.string().max(4_000).default(""),
    submittedAt: z.coerce.date(),
    fingerprint: z.string().length(64),
    /** Kept for triage: where the form was, and who sent it. */
    sourcePath: z.string().max(255).optional(),
    userAgent: z.string().max(500).optional(),
    /** What went wrong sending the two emails, if anything. */
    mailError: z.string().max(1_000).optional(),
  });

export type ContactSubmission = z.infer<typeof contactSubmissionSchema>;

/** What the admin may change on a message: its status and Harma's notes. */
export const contactSubmissionPatchSchema = z.object({
  status: contactStatusSchema.optional(),
  notes: z.string().max(4_000).optional(),
  version: z.coerce.number().int().min(1),
});

/**
 * The operator-managed half of the contact feature.
 *
 * `confirmationBody` is stored as **plain text**, not HTML or markdown. The
 * body is interpolated into an email template, and plain text is the one form
 * that cannot carry a tag into it: it is escaped and then blank lines become
 * paragraphs, so typing `<b>` puts those three characters in the email rather
 * than turning the rest of it bold. That is worth more here than formatting.
 */
export const contactSettingsSchema = z.object({
  /** Where the notification goes. Defaulted to Harma's own address. */
  notifyEmail: z.string().trim().max(254).pipe(z.email()).default("harmadavtian@gmail.com"),
  /** Whether the sender gets a confirmation at all. */
  confirmationEnabled: z.boolean().default(true),
  confirmationSubject: z.string().trim().min(1).max(200).default("Thanks for getting in touch"),
  confirmationBody: z
    .string()
    .max(4_000)
    .default(
      [
        "Thanks for your note — it reached me and I read everything that comes through here.",
        "I will reply myself, usually within a couple of days.",
        "— Harma",
      ].join("\n\n"),
    ),
  /** The line the visitor sees once the form has been sent. */
  successMessage: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .default("Thanks — your message has been sent. I will get back to you shortly."),
});

export type ContactSettings = z.infer<typeof contactSettingsSchema>;

/** The defaults, for a database that has never had the settings saved. */
export const defaultContactSettings = (): ContactSettings => contactSettingsSchema.parse({});
