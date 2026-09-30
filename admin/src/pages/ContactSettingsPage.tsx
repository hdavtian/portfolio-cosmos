import { ButtonComponent, CheckBoxComponent } from "@syncfusion/ej2-react-buttons";
import { TextBoxComponent } from "@syncfusion/ej2-react-inputs";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ContactSettings } from "@hd/content-schema";
import { FormField } from "../components/FormField";
import { ApiError } from "../lib/apiClient";
import {
  useContactSettings,
  useSaveContactSettings,
  type ContactSettingsRecord,
} from "../lib/contactApi";
import { useStatus } from "../lib/status";

/**
 * The contact form's settings, including the confirmation email. HD-4.
 *
 * Deliberately *not* part of the content release. Everything else an editor
 * changes in this admin waits for a publish, because it changes what visitors
 * see on the site; this does not — it changes what an email says. Making
 * somebody publish the whole site to fix a typo in an autoresponder would be
 * the wrong trade, so these settings save straight to the live database and
 * take effect on the next submission.
 *
 * Reached from the Contact Form Submissions list rather than from the sidebar,
 * because the ticket asks for one nav entry with its subsections linked from
 * the default screen.
 */

const FIELD_HINTS = {
  notifyEmail: "Where the notification goes when somebody writes in.",
  confirmationSubject: "The subject line on the copy the sender receives.",
  confirmationBody:
    "Plain text, not HTML. Blank lines become paragraphs; anything that looks like a tag is shown as the characters you typed, so it cannot break the email.",
} as const;

/** Splits fetching from editing, and keys the editor by version -- see the
 *  note on `ContactSubmissionPage`, which is built the same way. */
export function ContactSettingsPage() {
  const settings = useContactSettings();

  if (settings.isPending) return <p className="admin-status">Loading the settings…</p>;

  if (settings.isError || !settings.data) {
    return <p className="admin-error">The contact settings could not be loaded.</p>;
  }

  return <ContactSettingsEditor key={settings.data.version} stored={settings.data} />;
}

/** The stored settings without the two fields that are not settings. */
const editableOf = (stored: ContactSettingsRecord): ContactSettings => {
  const { version, mailConfigured, ...values } = stored;
  void version;
  void mailConfigured;
  return values;
};

function ContactSettingsEditor({ stored }: { stored: ContactSettingsRecord }) {
  const navigate = useNavigate();
  const status = useStatus();
  const save = useSaveContactSettings();

  const [draft, setDraft] = useState<ContactSettings>(() => editableOf(stored));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const set = <K extends keyof ContactSettings>(key: K, value: ContactSettings[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const dirty = (Object.keys(draft) as Array<keyof ContactSettings>).some(
    (key) => draft[key] !== stored[key],
  );

  const submit = () => {
    setFieldErrors({});
    save.mutate(
      { ...draft, version: stored.version },
      {
        onSuccess: () => {
          status.success("Saved the contact settings. They apply to the next message, with no publish needed.");
          navigate("/contactSubmissions");
        },
        onError: (error) => {
          /* Field-level messages beside each field, the top-level one in the
             status line -- the shape every editor page in this admin uses. */
          if (error instanceof ApiError) setFieldErrors(error.fieldErrors);
          status.error(error, "The settings could not be saved.");
        },
      },
    );
  };

  return (
    <>
      <div className="admin-page-header">
        <div>
          <h1>Contact form settings</h1>
          <p>
            Who gets told, what the sender is sent back, and what the form says once it has been
            submitted. Saved changes take effect immediately — these are not part of a release.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
          <ButtonComponent
            cssClass="e-flat e-outline"
            onClick={() => navigate("/contactSubmissions")}
          >
            Back to messages
          </ButtonComponent>
        </div>
      </div>

      {!stored.mailConfigured ? (
        <section className="admin-card" style={{ marginBottom: 16 }}>
          <div className="admin-card__label">Email is not configured</div>
          <p className="admin-error" style={{ margin: "4px 0 0" }}>
            No Gmail credential is set on the API, so nothing below will actually be sent.
          </p>
          <p className="admin-status" style={{ margin: "6px 0 0" }}>
            Messages are still stored — every submission is kept, and each one records that no email
            went out, so nothing is lost while this is unset. Set{" "}
            <code>GMAIL_USER</code> and <code>GMAIL_APP_PASSWORD</code> on the API to switch sending
            on. The app password comes from Google Account → Security → 2-Step Verification → App
            passwords; the account password will not work for SMTP.
          </p>
        </section>
      ) : null}

      <section className="admin-card" style={{ marginBottom: 16 }}>
        <div className="admin-card__label">Notification to you</div>
        <div className="admin-form" style={{ marginTop: 8 }}>
          <FormField
            label="Notify address"
            hint={FIELD_HINTS.notifyEmail}
            error={fieldErrors.notifyEmail}
          >
            <TextBoxComponent
              value={draft.notifyEmail}
              change={(args: { value?: string }) => set("notifyEmail", args.value ?? "")}
            />
          </FormField>
        </div>
      </section>

      <section className="admin-card" style={{ marginBottom: 16 }}>
        <div className="admin-card__label">Confirmation to the sender</div>
        <div className="admin-form" style={{ marginTop: 8 }}>
          <FormField
            label="Send a confirmation"
            hint="Off means the sender gets nothing back. Your own notification is sent either way."
          >
            <CheckBoxComponent
              checked={draft.confirmationEnabled}
              label="Email the sender a copy of their message"
              change={(args: { checked?: boolean }) =>
                set("confirmationEnabled", Boolean(args.checked))
              }
            />
          </FormField>

          <FormField
            label="Subject"
            hint={FIELD_HINTS.confirmationSubject}
            error={fieldErrors.confirmationSubject}
          >
            <TextBoxComponent
              value={draft.confirmationSubject}
              enabled={draft.confirmationEnabled}
              change={(args: { value?: string }) => set("confirmationSubject", args.value ?? "")}
            />
          </FormField>

          <FormField
            label="Body"
            hint={FIELD_HINTS.confirmationBody}
            error={fieldErrors.confirmationBody}
          >
            <TextBoxComponent
              multiline
              value={draft.confirmationBody}
              enabled={draft.confirmationEnabled}
              htmlAttributes={{ rows: "8", maxlength: "4000" }}
              change={(args: { value?: string }) => set("confirmationBody", args.value ?? "")}
            />
          </FormField>
          <p className="admin-status" style={{ margin: "0 0 4px" }}>
            The sender's own message and their reference are added underneath this, so there is no
            need to repeat them.
          </p>
        </div>
      </section>

      <section className="admin-card">
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <ButtonComponent
            cssClass="e-primary e-outline"
            disabled={!dirty || save.isPending}
            onClick={submit}
          >
            {save.isPending ? "Saving…" : "Save settings"}
          </ButtonComponent>
          <ButtonComponent
            cssClass="e-flat e-outline"
            disabled={!dirty || save.isPending}
            onClick={() => {
              setDraft(editableOf(stored));
              setFieldErrors({});
            }}
          >
            Revert
          </ButtonComponent>
        </div>
      </section>
    </>
  );
}
