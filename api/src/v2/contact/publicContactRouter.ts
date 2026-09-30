import { contactSubmissionInputSchema } from "@hd/content-schema";
import express, { Router } from "express";
import { ApiError, asyncHandler, parseOrThrow } from "../http.js";
import { createContactChallenge, verifyContactSolution } from "./altcha.js";
import { sendContactMails } from "./contactMail.js";
import {
  findRecentDuplicate,
  fingerprintOf,
  insertSubmission,
  readContactSettings,
  recordMailError,
} from "./contactStore.js";

/**
 * The public half of the contact feature. HD-4.
 *
 * Kept in its own file for the same reason the admin router is kept apart from
 * the content router: everything here is unauthenticated, and a guard loosened
 * by accident on a router that could also *read* submissions would publish
 * strangers' email addresses. Nothing in this file can read a message back —
 * the only response a visitor ever gets is their own reference.
 *
 * ## Why there is no CSRF token
 *
 * CSRF protects a *session*, by proving a request came from your own page
 * rather than somebody else's. This endpoint has no session and grants no
 * authority: the worst a forged cross-site post can do is create a contact
 * message, which is what the form is for. A token here would be ceremony. What
 * actually defends it is below — the challenge, the honeypot, the timing check,
 * the link heuristic, the rate limits, and validation. None is load-bearing
 * alone.
 */

/**
 * The shortest a person takes to write and send a message.
 *
 * Three seconds is well under anybody typing twenty characters and far over a
 * script, which posts the instant it has parsed the page. Deliberately crude:
 * the pairing with the honeypot is what makes it worth having, since a bot must
 * now be slow *and* observant.
 */
const TOO_FAST_MS = 3_000;

/** Links in a message. Four is nobody's genuine note. */
const MAX_LINKS = 3;

/* Rate limiting, in memory and by hand.
 *
 * The same shape as the financing form's limiter on the other site, and a
 * dependency not added for the same reason: one Map is a smaller thing to own
 * than another package. It shares that limiter's limitation too -- a restart
 * forgets, and a second instance counts separately -- which is acceptable in
 * front of a personal contact form.
 *
 * Two limits, because they stop different things. The address limit is the one
 * that matters most: without it, this form is a machine for sending our
 * confirmation email to a stranger, repeatedly, and Gmail's own sending quota
 * would be the thing that noticed first. */
const RATE_WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_IP_PER_HOUR = 5;
const MAX_PER_EMAIL_PER_HOUR = 2;

const recentByIp = new Map<string, number[]>();
const recentByEmail = new Map<string, number[]>();

/**
 * Clears both windows. For tests only.
 *
 * The limiter is module state shared by every request in the process, which is
 * correct in production and a trap in a suite: without this, the fourth test to
 * post a message gets a 429 from the third one's budget and fails somewhere
 * else entirely, looking like a bug in whatever it was actually checking.
 */
export function __resetRateLimits(): void {
  recentByIp.clear();
  recentByEmail.clear();
}

function overLimit(store: Map<string, number[]>, key: string, max: number): boolean {
  const now = Date.now();
  const kept = (store.get(key) ?? []).filter((stamp) => now - stamp < RATE_WINDOW_MS);

  if (kept.length >= max) {
    store.set(key, kept);
    return true;
  }

  kept.push(now);
  store.set(key, kept);
  return false;
}

export function createPublicContactRouter(): Router {
  const router = Router();

  /* A tighter body limit than the app's 2mb default. Three fields and a
     challenge payload fit in a fraction of this; the app-wide limit exists for
     content saves with embedded data, and there is no reason for an
     unauthenticated endpoint to accept anything near it. */
  router.use(express.json({ limit: "32kb" }));

  /* ---- what the form needs to render ---- */

  /*
   * There is no public settings endpoint.
   *
   * There was one, serving the single `successMessage` field, and it was
   * written to name that field explicitly rather than return the settings row
   * with the private ones stripped -- `notifyEmail` is one mistake away from
   * the open internet in that second design. The setting itself is gone now
   * (the page shows a fixed line), so the safest version of the endpoint is
   * the one that does not exist.
   */

  router.get(
    "/challenge",
    asyncHandler(async (_req, res) => {
      /* Never cached. A challenge is single-use by design -- see the spent-
         signature map in altcha.ts -- so a CDN handing the same one to
         everybody would break the form for everyone but the first visitor. */
      res.set("Cache-Control", "no-store");
      res.json(await createContactChallenge());
    }),
  );

  /* ---- submission ---- */

  router.post(
    "/submissions",
    asyncHandler(async (req, res) => {
      const body = parseOrThrow(
        contactSubmissionInputSchema,
        req.body,
        "Some of those details could not be read. Please check and try again.",
      );

      /**
       * Silent rejections.
       *
       * A bot that is told *why* it failed is a bot that can be adjusted until
       * it passes. So the honeypot, the timing check and the link heuristic all
       * answer exactly as a success does. The cost of being wrong is a genuine
       * visitor who believes they got through and did not, which is why none of
       * the three can fire on anything a person plausibly does: the field is
       * invisible, three seconds is inhumanly fast for twenty characters, and
       * four links is not a note to a portfolio site.
       */
      const looksAutomated =
        Boolean(body.website && body.website.trim()) ||
        (body.renderedAt !== undefined && Date.now() - body.renderedAt < TOO_FAST_MS) ||
        body.message.split(/https?:\/\//i).length - 1 > MAX_LINKS;

      if (looksAutomated) {
        res.status(202).json({ reference: null });
        return;
      }

      const solution = await verifyContactSolution(body.altcha);
      if (!solution.ok) {
        throw new ApiError(
          400,
          "CHALLENGE_FAILED",
          "That form could not be verified. Please reload the page and try again.",
        );
      }

      const email = body.email.toLowerCase();

      if (
        overLimit(recentByIp, req.ip ?? "unknown", MAX_PER_IP_PER_HOUR) ||
        overLimit(recentByEmail, email, MAX_PER_EMAIL_PER_HOUR)
      ) {
        throw new ApiError(
          429,
          "TOO_MANY_REQUESTS",
          "Your message has already been sent. Please email me directly if it is urgent.",
        );
      }

      const now = new Date();
      const fingerprint = fingerprintOf(body.email, body.message);

      /**
       * The duplicate guard, from HD-4.
       *
       * A resubmission of the same note answers with the *original* reference
       * and sends nothing further. Idempotent rather than rejected, on purpose:
       * the commonest cause is a double-click or a retried post on a flaky
       * connection, and telling somebody their message was refused as a
       * duplicate when they only clicked twice reads as though it was lost.
       * They get the same success they would have got the first time.
       */
      const existing = await findRecentDuplicate(fingerprint, now);
      if (existing) {
        res.status(200).json({ reference: existing.reference as string });
        return;
      }

      const sourcePath =
        typeof req.get("referer") === "string" ? req.get("referer")?.slice(0, 255) : undefined;

      const { id, reference } = await insertSubmission({
        name: body.name,
        email: body.email,
        message: body.message,
        fingerprint,
        submittedAt: now,
        sourcePath,
        userAgent: req.get("user-agent")?.slice(0, 500),
      });

      /**
       * The row is written before any mail is attempted, and the visitor is
       * told it worked because it did. A failed send is recorded on the row and
       * surfaced in the admin.
       *
       * Awaited rather than left running after the response. A second of
       * latency on a form somebody submits once is worth less than the
       * certainty that `mailError` reflects what actually happened — and a
       * floating promise writing to the database after the handler has returned
       * is how a process gets killed mid-write on a deployment.
       */
      const settings = await readContactSettings();
      const mailError = await sendContactMails(
        { reference, name: body.name, email: body.email, message: body.message, submittedAt: now, sourcePath },
        settings,
      );

      if (mailError) {
        console.error(`[contact] ${reference}: ${mailError}`);
        await recordMailError(id, mailError);
      }

      res.status(201).json({ reference });
    }),
  );

  return router;
}
