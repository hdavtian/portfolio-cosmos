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
  /** Clears the tick and the solved payload, ready to be solved again. */
  reset?: () => void;
}

/**
 * The solved payload the widget has written into the form, if it has one.
 *
 * The widget writes a hidden input named `altcha` into the form rather than
 * telling React anything, so the form is where its answer is read from.
 *
 * ## Why this does not solve the challenge itself
 *
 * It used to. Send called `verify()` when the payload was missing, so the
 * proof of work simply happened inside the send and the checkbox was
 * optional. That was safe -- the server refuses any submission without a
 * valid solution, so skipping the tick bypassed nothing -- but it made a
 * visible control that says "I'm not a robot" do nothing when ignored, which
 * reads as a bug to anybody who tries it. A checkbox is either required, as
 * reCAPTCHA's is, or there is no checkbox at all, as with an invisible
 * challenge. The hybrid is the one option that is not a pattern.
 */
const solvedPayload = (form: HTMLFormElement): string =>
  String(new FormData(form).get("altcha") ?? "");

/**
 * The widget's look, in its own CSS variables.
 *
 * One object at module scope, not a literal per render: a new identity on
 * every render makes a custom element rebind, and the values never change.
 * They read the page's own tokens, so the widget follows the showcase palette
 * rather than carrying a second one. Its markup lives in a shadow root, so
 * these variables are the only way in -- a stylesheet cannot reach it.
 */
const ALTCHA_THEME = {
  "--altcha-max-width": "100%",
  "--altcha-border-radius": "4px",
  "--altcha-border-color": "var(--showcase-ink-dim)",
  "--altcha-color-base": "rgba(255, 255, 255, 0.04)",
  "--altcha-color-base-content": "var(--showcase-ink)",
  "--altcha-color-text": "var(--showcase-ink)",
  "--altcha-color-border": "var(--showcase-ink-dim)",
  "--altcha-checkbox-border-color": "var(--showcase-ink-dim)",
  "--altcha-color-primary": "var(--showcase-ink)",
  "--altcha-color-error": "#ff9a8a",
  "--altcha-spinner-color": "var(--showcase-ink)",
} as const;

/** No footer line and no logo: the page carries no other chrome. */
const ALTCHA_CONFIGURATION = JSON.stringify({ hideFooter: true, hideLogo: true });

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
  /**
   * The last successful send, or null.
   *
   * An object rather than the reference string, because a reference is not
   * always there: a submission caught by one of the silent rejections answers
   * exactly like a success and carries none. That has to look like a success
   * here too -- a rejection a person could tell apart from a success is a
   * rejection a bot can be tuned against -- so "sent" and "has a reference"
   * are two separate facts.
   */
  const [sent, setSent] = useState<{ reference: string | null } | null>(null);
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

    /* Any previous result goes now, before anything else: the note under the
       form must never be left over from the last message while a new one is
       in flight. */
    const found = validate(data);
    setErrors(found);
    setFailure(null);
    setSent(null);
    if (Object.keys(found).length > 0) {
      // Focus the first thing that is wrong, so a keyboard user is taken to it.
      const firstBad = Object.keys(found)[0];
      form.querySelector<HTMLElement>(`[name="${firstBad}"]`)?.focus();
      return;
    }

    /* Nothing is sent until the challenge has been solved, and solving it is
       the visitor's own click on the widget. Checked before the button is
       disabled, so refusing here leaves the form exactly as it was. */
    const altcha = solvedPayload(form);
    if (!altcha) {
      setFailure("Please confirm you are not a robot, then send.");
      widgetRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }

    /* Disabled for the whole attempt, from here until either outcome. HD-4
       asks for the button to disable on the first click, and it is also what
       stops the commonest duplicate: a second click while the request is in
       flight. The server's fingerprint guard is the backstop. */
    setSending(true);

    /*
     * Only the network call is guarded.
     *
     * The whole of this used to sit in one try/catch, so anything that threw
     * *after* a successful post -- clearing the form, resetting the widget --
     * was reported as "your message could not be sent". That happened: a
     * message was stored server-side while the page said it had failed, which
     * is the worst thing this form could tell somebody. It invites them to
     * write it again, and only the duplicate guard stops two of everything.
     *
     * So the fetch is wrapped and nothing else is.
     */
    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}/api/v2/contact/submissions`, {
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
    } catch {
      setFailure("Your message could not be sent. Check your connection and try again.");
      setSending(false);
      return;
    }

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
      setSending(false);
      return;
    }

    /* Past this point the message is stored, and the visitor is told so
       whatever else happens. A reference we cannot read is not a failure. */
    const body = (await response.json().catch(() => ({}))) as Partial<SubmitResponse>;

    form.reset();
    setRemaining(CONTACT_MESSAGE_MAX);

    /* The challenge is spent -- single-use, enforced server-side -- so the
       widget goes back to unticked. Without this it still reads "Verified"
       while holding a payload the server will refuse as replayed, and the
       next message fails for a reason nobody could guess from the screen.
       Guarded on its own: a widget that objects to being reset must not cost
       somebody the confirmation for a message that did arrive. */
    try {
      widgetRef.current?.reset?.();
    } catch {
      // Nothing to do. The next send solves a fresh challenge regardless.
    }

    /* A 202 with no reference is one of the silent rejections. It is answered
       exactly like a success on purpose -- see the router -- so it is treated
       as one here too, which is what makes the deception complete. */
    setSent({ reference: body.reference ?? null });
    setSending(false);
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
        {/* The form always stays. It used to be replaced by the confirmation,
            which meant writing a second message took a trip through a "send
            another" button -- and that button was itself the thing nobody
            needed. Now a send simply empties the fields and leaves a note
            underneath, so the page is ready for the next one either way. */}
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
            {/* Visible, and it starts nothing by itself.
                `auto="off"` means the widget neither solves on load nor
                reacts to the form being focused: it sits there until somebody
                ticks it, or until Send does it for them. So a visitor who
                opens the page and wanders off has spent none of their CPU,
                and nothing on the page moves or takes focus while they type.
                Themed through the widget's own CSS variables, which is the
                supported way -- its markup is in a shadow root and cannot be
                reached by a stylesheet. */}
            <altcha-widget
              ref={widgetRef}
              challenge={`${API_BASE_URL}/api/v2/contact/challenge`}
              name="altcha"
              auto="off"
              configuration={ALTCHA_CONFIGURATION}
              style={ALTCHA_THEME}
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

          {/* Under the form, dismissible, and it does not block anything: a
              second message can be written and sent with this still on
              screen, and pressing Send clears it before the next attempt.
              `role="status"` rather than "alert" -- a screen reader should
              announce it once the send is done, not interrupt. */}
          {sent ? (
            <div className="showcase-contact__sent" role="status">
              <div className="showcase-contact__sent-body">
                <p className="showcase-contact__sent-heading">Your message has been sent.</p>
                {sent.reference ? (
                  <p className="showcase-contact__sent-reference">
                    Reference <strong>{sent.reference}</strong>
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                className="showcase-contact__sent-close"
                aria-label="Dismiss this confirmation"
                onClick={() => setSent(null)}
              >
                ×
              </button>
            </div>
          ) : null}
      </div>
    </article>
  );
}
