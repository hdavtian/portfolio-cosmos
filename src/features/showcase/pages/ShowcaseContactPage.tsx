import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CONTACT_MESSAGE_MAX, CONTACT_MESSAGE_MIN } from "@hd/content-schema";
import { API_BASE_URL } from "../../../lib/api/contentClient";
import { useBackdropTint } from "../lib/backdropTint";

/**
 * The contact form. HD-4.
 *
 * The first thing on this site that collects anything about a visitor, and
 * everything about it follows from that: it asks for the least that lets a
 * reply happen — a name, an address, and what they wanted to say — and nothing
 * else. No company, no phone, no "how did you hear about us".
 *
 * ## Keeping bots out
 *
 * Four layers, none of them load-bearing alone, and only one of them visible:
 *
 * 1. **ALTCHA**, a proof-of-work challenge. A library, self-hosted, no third
 *    party and no puzzle to solve — the browser hashes for about a second while
 *    the form is being filled in. The only visible one, and it is a line of
 *    text.
 * 2. **A honeypot field**, hidden from people and offered to scripts.
 * 3. **A timing check**, on how long the form was open.
 * 4. **Rate limits**, per address and per IP, server-side.
 *
 * The last three are checked on the server and answer a bot exactly as they
 * answer a person, because a bot told why it failed is a bot that can be
 * adjusted until it passes. See publicContactRouter.ts.
 *
 * The honeypot is hidden with more than `display: none` on purpose. A screen
 * reader will happily read and offer a visually hidden input, so it also
 * carries `aria-hidden`, `tabIndex={-1}` and `autoComplete="off"` — otherwise
 * the trap catches exactly the visitors least able to work out what went wrong.
 */

/** The widget, as much of it as this file calls. */
interface AltchaElement extends HTMLElement {
  verify?: (options?: { controller?: AbortController }) => Promise<{ payload: string } | null>;
}

/**
 * Runs the proof of work and returns the payload to post.
 *
 * `verify()` resolves with the payload in altcha v3, so this awaits it rather
 * than polling the hidden input the widget writes. The first version here did
 * poll, every 250ms for fifteen seconds, which was copied from the other
 * site's older integration -- it worked, but it meant a failure took the full
 * fifteen seconds to report and a success waited up to a quarter of a second
 * after it was ready.
 *
 * Resolves to null on any failure, which is all the caller needs: every one of
 * them ends in the same sentence asking the visitor to reload.
 */
async function solveChallenge(widget: AltchaElement | null): Promise<string | null> {
  if (!widget?.verify) return null;

  try {
    const result = await widget.verify();
    return result?.payload ?? null;
  } catch {
    return null;
  }
}

type FieldErrors = Record<string, string>;

const FIELD_LABELS: Record<string, string> = {
  name: "Your name",
  email: "Email",
  message: "Message",
};

/**
 * What has to be right before anything is sent.
 *
 * Checked here so a typo is caught without a round trip, and checked again on
 * the server, which is the one that counts. The email test is deliberately
 * loose: strict address validation rejects perfectly legal addresses, and the
 * real test of an address is whether a reply arrives. This catches the typo
 * that is obviously a typo.
 */
function validate(data: FormData): FieldErrors {
  const errors: FieldErrors = {};
  const value = (name: string) => String(data.get(name) ?? "").trim();

  if (!value("name")) errors.name = `${FIELD_LABELS.name} is required.`;

  const email = value("email");
  if (!email) errors.email = `${FIELD_LABELS.email} is required.`;
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "That email address is not valid.";

  const message = value("message");
  if (!message) errors.message = `${FIELD_LABELS.message} is required.`;
  else if (message.length < CONTACT_MESSAGE_MIN) {
    errors.message = `Please write at least ${CONTACT_MESSAGE_MIN} characters.`;
  } else if (message.length > CONTACT_MESSAGE_MAX) {
    errors.message = `Please keep it under ${CONTACT_MESSAGE_MAX.toLocaleString()} characters.`;
  }

  return errors;
}

interface SubmitResponse {
  reference: string | null;
}

interface ApiErrorBody {
  error?: {
    message?: string;
    details?: Array<{ path: string; message: string }>;
  };
}

export function ShowcaseContactPage() {
  const { setTint } = useBackdropTint();
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);
  const widgetRef = useRef<AltchaElement | null>(null);

  const [errors, setErrors] = useState<FieldErrors>({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(CONTACT_MESSAGE_MAX);

  /** Stamped once, on mount. The server compares it against the clock. */
  const [renderedAt] = useState(() => Date.now());

  useEffect(() => {
    setTint(null);
    window.scrollTo({ top: 0 });
  }, [setTint]);

  // Escape leaves the page, as it does on the resume and a project.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      navigate("/");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  /**
   * The ALTCHA widget is a custom element and registers itself on import, so
   * the import is the setup. Loaded here rather than at the top of the module
   * so the proof-of-work code is not in the bundle for every visitor who never
   * opens this page.
   */
  useEffect(() => {
    void import("altcha");
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const form = event.currentTarget;
    const data = new FormData(form);

    const found = validate(data);
    setErrors(found);
    setFailure(null);
    if (Object.keys(found).length > 0) {
      // Focus the first thing that is wrong, so a keyboard user is taken to it.
      const firstBad = Object.keys(found)[0];
      form.querySelector<HTMLElement>(`[name="${firstBad}"]`)?.focus();
      return;
    }

    /* Disabled for the whole attempt, from here until either outcome. HD-4
       asks for the button to disable on the first click, and it is also what
       stops the commonest duplicate: a second click while the proof of work is
       still running. The server's fingerprint guard is the backstop. */
    setSending(true);

    try {
      const altcha = await solveChallenge(widgetRef.current);
      if (!altcha) {
        setFailure("The verification step did not finish. Please reload the page and try again.");
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/v2/contact/submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(data.get("name") ?? ""),
          email: String(data.get("email") ?? ""),
          message: String(data.get("message") ?? ""),
          website: String(data.get("website") ?? ""),
          altcha,
          renderedAt,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
        const details = body.error?.details ?? [];

        if (details.length > 0) {
          setErrors(
            Object.fromEntries(
              details
                .filter((detail) => detail.path in FIELD_LABELS)
                .map((detail) => [detail.path, detail.message]),
            ),
          );
        }

        setFailure(body.error?.message ?? "Your message could not be sent. Please try again.");
        return;
      }

      const body = (await response.json()) as SubmitResponse;

      /* A 202 with no reference is one of the silent rejections. It is answered
         exactly like a success on purpose -- see the router -- so it is treated
         as one here too, which is what makes the deception complete. */
      setSent(body.reference);
      form.reset();
      setRemaining(CONTACT_MESSAGE_MAX);
    } catch {
      setFailure("Your message could not be sent. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <article className="showcase-contact">
      <header className="showcase-contact__intro">
        <Link to="/" className="showcase-back showcase-contact__back">
          <span className="showcase-back__arrow" aria-hidden="true" />
          Back
        </Link>
        <p className="showcase-label">Contact</p>
        <h1 className="showcase-contact__heading">Send me a note</h1>
        {/* No blurb. The heading says what the page is for, and three
            labelled fields say the rest; a paragraph explaining a contact form
            is a paragraph nobody reads.

            The email address is deliberately not printed here either. It used
            to be, as a mailto fallback, but an address in the page source is
            an address a crawler harvests -- which is most of the reason this
            form exists. It is still on the downloadable resume, where a person
            has to ask for the file to get it. */}
      </header>

      <div className="showcase-contact__panel">
        {sent ? (
          <div className="showcase-contact__sent" role="status">
            <p className="showcase-contact__sent-heading">Your message has been sent.</p>
            {sent ? (
              <p>
                Reference <strong>{sent}</strong>
              </p>
            ) : null}
          </div>
        ) : (
          <form ref={formRef} className="showcase-contact__form" onSubmit={handleSubmit} noValidate>
            {/* Name and email share a row on a wide screen and stack on a
                narrow one: both are short single-line answers, and putting
                them side by side keeps the message box above the fold. */}
            <div className="showcase-contact__pair">
            <div className="showcase-contact__field">
              <label htmlFor="contact-name">Your name</label>
              <input
                id="contact-name"
                name="name"
                type="text"
                maxLength={160}
                autoComplete="name"
                required
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? "contact-name-error" : undefined}
                disabled={sending}
              />
              {errors.name ? (
                <p className="showcase-contact__error" id="contact-name-error">
                  {errors.name}
                </p>
              ) : null}
            </div>

            <div className="showcase-contact__field">
              <label htmlFor="contact-email">Email</label>
              <input
                id="contact-email"
                name="email"
                type="email"
                maxLength={254}
                autoComplete="email"
                required
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? "contact-email-error" : undefined}
                disabled={sending}
              />
              {errors.email ? (
                <p className="showcase-contact__error" id="contact-email-error">
                  {errors.email}
                </p>
              ) : null}
            </div>
            </div>

            <div className="showcase-contact__field">
              <label htmlFor="contact-message">Message</label>
              <textarea
                id="contact-message"
                name="message"
                rows={8}
                /* The same cap the server enforces, so the box stops taking
                   characters rather than letting somebody write 4,001 and lose
                   the lot on submit. The counter below says where they are. */
                maxLength={CONTACT_MESSAGE_MAX}
                required
                aria-invalid={Boolean(errors.message)}
                aria-describedby={
                  errors.message ? "contact-message-error contact-message-count" : "contact-message-count"
                }
                disabled={sending}
                onChange={(event) => setRemaining(CONTACT_MESSAGE_MAX - event.currentTarget.value.length)}
              />
              <p className="showcase-contact__count" id="contact-message-count">
                {remaining.toLocaleString()} characters left
              </p>
              {errors.message ? (
                <p className="showcase-contact__error" id="contact-message-error">
                  {errors.message}
                </p>
              ) : null}
            </div>

            {/* The honeypot. Hidden from people four ways over -- see the note
                at the top of this file -- and expected to stay empty. */}
            <div className="showcase-contact__decoy" aria-hidden="true">
              <label htmlFor="contact-website">Website</label>
              <input
                id="contact-website"
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
              />
            </div>

            {/* Solved on submit rather than on load: a visitor who opens the
                page and leaves should not have paid for a challenge, and the
                wait is hidden inside the send either way. */}
            {/* Absolute, like every other call from this site: the API is on
                its own hostname in production and on :8080 in development, so
                a relative path reaches the static site instead and the form
                silently cannot be verified. */}
            {/* Hidden entirely: this form reports its own progress on the
                send button, so the widget's UI would only be a second, quieter
                status line saying the same thing. `auto="off"` because a
                visitor who opens the page and leaves should not have paid for
                a challenge -- it is solved on submit, inside the send. */}
            <altcha-widget
              ref={widgetRef}
              challenge={`${API_BASE_URL}/api/v2/contact/challenge`}
              name="altcha"
              auto="off"
              style={{ display: "none" }}
            />

            {failure ? (
              <p className="showcase-contact__error showcase-contact__error--form" role="alert">
                {failure}
              </p>
            ) : null}

            <button type="submit" className="showcase-contact__submit" disabled={sending}>
              {sending ? "Sending…" : "Send"}
            </button>

          </form>
        )}
      </div>
    </article>
  );
}
