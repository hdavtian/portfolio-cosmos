import { createHmac } from "node:crypto";
import { createChallenge, randomInt, verifySolution } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/pbkdf2";
import { env } from "../../config/env.js";

/**
 * The proof-of-work challenge in front of the public contact form. HD-4.
 *
 * ALTCHA rather than a hosted captcha: it is a library, it runs entirely on our
 * own infrastructure, there is no third party to name in a privacy notice, and
 * the visitor is never asked to identify a bus. The browser spends a moment
 * hashing while the form is being filled in, and the server checks the work.
 *
 * The same choice was made for the financing form on hydrodent.com, and the
 * tuning below is lifted from it rather than rediscovered — including the two
 * settings that were measured and rejected there.
 *
 * ## What this is and is not
 *
 * It is a cost, not a wall. A determined attacker driving a real browser will
 * pay it. What it stops is the volume case: the scripts that post to every form
 * they find, thousands of times, because posting is free. Making each attempt
 * cost real CPU is enough to make this form a bad target.
 *
 * The other layers — honeypot, timing, link heuristic, rate limit, validation —
 * are in publicContactRouter.ts, and none of them is load-bearing alone.
 */

/**
 * How hard the browser has to work.
 *
 * Two numbers multiply together here, which is easy to get badly wrong: the
 * browser tries counter values one at a time until the derived key matches, and
 * each attempt runs `COST` PBKDF2 iterations. So the work is roughly
 * `counter × COST`, not either alone.
 *
 * These are hydrodent's measured figures, and the measurements are the reason
 * to keep them. Its first version asked for 50,000 iterations with a counter
 * drawn up to 50,000 — some 2.5 *billion* iterations — and locked the browser
 * tab solid. The library's own documented example (5,000 and a counter to
 * 20,000, around 60 million iterations) still took 32 seconds in a desktop
 * Chrome, which is not a form, it is a wait.
 *
 * What is below comes out at roughly 3 million iterations: a second or so,
 * finished while somebody is still typing their message. That is still a second
 * of real CPU per submission, which is the whole point — nothing to a person
 * sending one note, a genuine cost to anything posting to thousands.
 *
 * Raise MAX_COUNTER, not COST, if spam ever gets through: it scales the total
 * work linearly without making any single attempt slow, and slow attempts are
 * what produced the two bad settings above.
 */
const COST = 1_000;
const MIN_COUNTER = 1_000;
const MAX_COUNTER = 5_000;

/** How long a challenge stays solvable. Generous: a form can sit open a while. */
const CHALLENGE_TTL_MS = 20 * 60 * 1000;

const ALGORITHM = "PBKDF2/SHA-256";

/**
 * The signing secrets, derived rather than configured.
 *
 * A deliberate choice not to add another required environment variable. These
 * secrets only need to be unguessable and stable for the life of a challenge —
 * they sign "this challenge came from us", nothing durable — so deriving them
 * from a secret the app already requires means one less thing to set in
 * production and one less way for a deployment to be quietly misconfigured.
 *
 * Two distinct derivations, because ALTCHA signs the challenge parameters and
 * the derived key with separate keys; reusing one value for both would collapse
 * that distinction.
 *
 * The fallback exists only for local development, where AUTH_COOKIE_SECRET is
 * optional. In production `env.ts` refuses to start without it.
 */
const baseSecret = env.AUTH_COOKIE_SECRET ?? "local-development-contact-challenge-secret";

const derivedSecret = (label: string): string =>
  createHmac("sha256", baseSecret).update(label).digest("hex");

const HMAC_SIGNATURE_SECRET = derivedSecret("contact-altcha-signature");
const HMAC_KEY_SIGNATURE_SECRET = derivedSecret("contact-altcha-key-signature");

/** A fresh challenge, in the shape the ALTCHA widget fetches. */
export async function createContactChallenge() {
  return createChallenge({
    algorithm: ALGORITHM,
    cost: COST,
    /* Random, so the work cannot be short-circuited by always guessing low,
       and so two visitors never face the same amount of it. */
    counter: randomInt(MIN_COUNTER, MAX_COUNTER),
    deriveKey,
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    hmacSignatureSecret: HMAC_SIGNATURE_SECRET,
    hmacKeySignatureSecret: HMAC_KEY_SIGNATURE_SECRET,
  });
}

/**
 * Challenges that have already been spent.
 *
 * Without this, one solved challenge can be replayed forever: the signature
 * stays valid until it expires, so a bot could pay the cost once and then post
 * the same payload as fast as it likes — exactly the volume case the proof of
 * work exists to prevent.
 *
 * In memory, and that is a considered limit rather than an oversight. A restart
 * forgets everything, and a second instance would not share it. Both mean a
 * replay window measured in minutes, on a form behind a rate limiter that would
 * throttle the replay anyway. A shared store would be the right answer at a
 * scale a personal contact form will not reach; if it ever does, this is the
 * one function to change.
 */
const spentSignatures = new Map<string, number>();

/**
 * When a challenge stops being replayable, in milliseconds.
 *
 * ALTCHA states `expiresAt` in **seconds** — a unix timestamp, as the protocol
 * carries it — and everything on this side of the line is `Date.now()`
 * milliseconds. Taking it at face value made every spent signature on the other
 * site look as though it had expired in 1970, so the replay guard swept its own
 * record away between one request and the next and the same solved payload
 * could be posted forever. It fails silently in exactly the way that would
 * never show up in ordinary use, so the conversion is explicit here too.
 *
 * The threshold is the standard sanity check: any plausible timestamp in
 * milliseconds is far above 1e12, and any in seconds far below it.
 */
function expiryMs(parameters: { expiresAt?: number } | undefined, now: number): number {
  const expiresAt = parameters?.expiresAt;
  if (!expiresAt) return now + CHALLENGE_TTL_MS;
  return expiresAt < 1e12 ? expiresAt * 1000 : expiresAt;
}

function forgetExpired(now: number): void {
  for (const [signature, expiresAt] of spentSignatures) {
    if (expiresAt <= now) spentSignatures.delete(signature);
  }
}

/**
 * Checks a payload from the widget.
 *
 * Returns a reason rather than throwing, because every failure here ends the
 * same way for the visitor — one polite message asking them to reload — and the
 * distinction is only useful in a log.
 */
export async function verifyContactSolution(
  payload: unknown,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (typeof payload !== "string" || payload.length === 0) {
    return { ok: false, reason: "missing" };
  }

  let decoded: { challenge?: unknown; solution?: unknown };
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64").toString("utf8")) as typeof decoded;
  } catch {
    return { ok: false, reason: "unparseable" };
  }

  const challenge = decoded.challenge as
    | { parameters?: { expiresAt?: number }; signature?: string }
    | undefined;
  const solution = decoded.solution;

  if (!challenge?.signature || !solution) {
    return { ok: false, reason: "incomplete" };
  }

  const now = Date.now();
  forgetExpired(now);

  if (spentSignatures.has(challenge.signature)) {
    return { ok: false, reason: "replayed" };
  }

  const result = await verifySolution({
    challenge: challenge as Parameters<typeof verifySolution>[0]["challenge"],
    solution: solution as Parameters<typeof verifySolution>[0]["solution"],
    deriveKey,
    hmacSignatureSecret: HMAC_SIGNATURE_SECRET,
    hmacKeySignatureSecret: HMAC_KEY_SIGNATURE_SECRET,
  });

  if (!result.verified) {
    if (result.expired) return { ok: false, reason: "expired" };
    if (result.invalidSignature) return { ok: false, reason: "bad_signature" };
    return { ok: false, reason: "bad_solution" };
  }

  /* Spent only once it has been accepted. Recording a failed attempt would let
     anyone burn a stranger's challenge by replaying a broken copy of it. */
  spentSignatures.set(challenge.signature, expiryMs(challenge.parameters, now));

  return { ok: true };
}
