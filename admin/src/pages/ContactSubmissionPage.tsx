import { ButtonComponent } from "@syncfusion/ej2-react-buttons";
import { DropDownListComponent } from "@syncfusion/ej2-react-dropdowns";
import { TextBoxComponent } from "@syncfusion/ej2-react-inputs";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CONTACT_STATUSES, CONTACT_STATUS_LABELS, type ContactStatus } from "@hd/content-schema";
import { FormField } from "../components/FormField";
import { confirmAction } from "../lib/confirm";
import {
  useContactSubmission,
  useDeleteContactSubmission,
  usePatchContactSubmission,
  type ContactSubmissionRecord,
} from "../lib/contactApi";
import { useStatus } from "../lib/status";

/**
 * One contact message. HD-4.
 *
 * A full page rather than a dialog, per Harma's preference (2026-09-16) and the
 * edit-dialogs skill.
 *
 * The message itself is displayed, never edited. Only the status and the notes
 * are writable, which mirrors what the API accepts: the stored text is the
 * record of what somebody actually said, and an admin that can quietly rewrite
 * it destroys the only evidence of that.
 */

const STATUS_OPTIONS = CONTACT_STATUSES.map((value) => ({
  value,
  text: CONTACT_STATUS_LABELS[value],
}));

/**
 * One object, not a literal per render.
 *
 * Syncfusion rebinds when a prop's identity changes, and a rebind mid-selection
 * throws the selection away -- the same trap `EntityEditPage` documents for its
 * reference dropdowns. Inline, this silently made the status dropdown
 * unusable: clicking an option left the popup open and the value on "New",
 * with no error anywhere. Caught by trying to change a status in the browser,
 * not by any test or the compiler.
 */
const STATUS_FIELDS = { text: "text", value: "value" };

/** What each status is for, so the choice does not have to be guessed. */
const STATUS_HINTS: Record<ContactStatus, string> = {
  new: "Nobody has looked at it yet. Set automatically when it arrives.",
  open: "Being dealt with — read, or waiting on a reply from you.",
  closed: "Finished with.",
  spam: "Junk. Kept rather than deleted, so the counts stay honest.",
  test: "Sent while checking the form. Not a real inquiry.",
};

/**
 * Fetches the message, then hands it to the editor as props.
 *
 * Split in two, and the editor keyed by id and version, which is how every
 * other editor in this admin is built (see `EntityEditPage`). The draft is
 * seeded by `useState` from those props rather than copied out of the query in
 * an effect: the key means a background refetch of a *changed* record remounts
 * the editor instead of silently overwriting whatever is half-typed, and there
 * is no render in between showing the old values as though they were current.
 */
export function ContactSubmissionPage() {
  const { id } = useParams();
  const record = useContactSubmission(id);

  if (record.isPending) return <p className="admin-status">Loading the message…</p>;

  if (record.isError || !record.data) {
    return <p className="admin-error">That message could not be loaded. It may have been deleted.</p>;
  }

  return (
    <ContactSubmissionEditor
      key={`${record.data.id}-${record.data.version}`}
      message={record.data}
    />
  );
}

function ContactSubmissionEditor({ message }: { message: ContactSubmissionRecord }) {
  const navigate = useNavigate();
  const status = useStatus();
  const patch = usePatchContactSubmission();
  const remove = useDeleteContactSubmission();

  const [draftStatus, setDraftStatus] = useState<ContactStatus>(message.status);
  const [notes, setNotes] = useState(message.notes);

  const dirty = draftStatus !== message.status || notes !== message.notes;

  const save = () => {
    patch.mutate(
      { id: message.id, status: draftStatus, notes, version: message.version },
      {
        onSuccess: () => {
          /* Back to the list with the message above the grid, as the
             edit-dialogs skill requires of an editor that belongs to a list. */
          status.success(`Saved the message from ${message.name} as ${CONTACT_STATUS_LABELS[draftStatus]}.`);
          navigate("/contactSubmissions");
        },
        onError: (error) => status.error(error, "The message could not be saved."),
      },
    );
  };

  const destroy = () => {
    confirmAction({
      title: "Delete this message?",
      content: `The message from ${message.name} (${message.reference}) will be removed permanently. Mark it as Spam instead if you only want it out of the way.`,
      confirmText: "Delete",
      confirmClass: "e-danger e-outline",
      onConfirm: () => {
        remove.mutate(message.id, {
          onSuccess: () => {
            status.success(`Deleted the message from ${message.name}.`);
            navigate("/contactSubmissions");
          },
          onError: (error) => status.error(error, "The message could not be deleted."),
        });
      },
    });
  };

  return (
    <>
      <div className="admin-page-header">
        <div>
          <h1>Message {message.reference}</h1>
          <p>
            Sent {new Date(message.submittedAt).toLocaleString()} by {message.name}.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
          <ButtonComponent
            cssClass="e-flat e-outline"
            onClick={() => navigate("/contactSubmissions")}
          >
            Back
          </ButtonComponent>
          <ButtonComponent cssClass="e-danger e-outline" onClick={destroy}>
            Delete
          </ButtonComponent>
        </div>
      </div>

      {message.mailError ? (
        <section className="admin-card" style={{ marginBottom: 16 }}>
          <div className="admin-card__label">Email</div>
          <p className="admin-error" style={{ margin: "4px 0 0" }}>
            The notification or confirmation could not be sent: {message.mailError}
          </p>
          <p className="admin-status" style={{ margin: "6px 0 0" }}>
            The message itself was stored safely — that is what this row is. Nothing is resent
            automatically, so reply by hand if it matters.
          </p>
        </section>
      ) : null}

      <section className="admin-card" style={{ marginBottom: 16 }}>
        <div className="admin-card__label">What was sent</div>
        {/* Rendered as text children, so React escapes it. `white-space:
            pre-wrap` keeps the sender's line breaks without any parsing. */}
        <p style={{ whiteSpace: "pre-wrap", margin: "8px 0 0", lineHeight: 1.6 }}>
          {message.message}
        </p>
      </section>

      <section className="admin-card" style={{ marginBottom: 16 }}>
        <div className="admin-card__label">Who sent it</div>
        <div className="admin-form" style={{ marginTop: 8 }}>
          <FormField label="Name">
            <p style={{ margin: 0 }}>{message.name}</p>
          </FormField>
          <FormField label="Email">
            <p style={{ margin: 0 }}>
              <a href={`mailto:${message.email}?subject=Re:%20your%20message%20(${message.reference})`}>
                {message.email}
              </a>
            </p>
          </FormField>
          {message.sourcePath ? (
            <FormField label="From page" hint="Where the form was when it was sent.">
              <p style={{ margin: 0, wordBreak: "break-all" }}>{message.sourcePath}</p>
            </FormField>
          ) : null}
        </div>
      </section>

      <section className="admin-card">
        <div className="admin-card__label">Your triage</div>
        <div className="admin-form" style={{ marginTop: 8 }}>
          <FormField label="Status" hint={STATUS_HINTS[draftStatus]}>
            <DropDownListComponent
              dataSource={STATUS_OPTIONS}
              fields={STATUS_FIELDS}
              value={draftStatus}
              change={(args: { value?: string | number | boolean | null }) => {
                if (typeof args.value === "string") setDraftStatus(args.value as ContactStatus);
              }}
            />
          </FormField>

          <FormField
            label="Notes"
            hint="For you only. Never sent to anybody and never shown on the site."
          >
            <TextBoxComponent
              multiline
              value={notes}
              /* Matches the API's cap, so a long note cannot be typed and then
                 refused on save. */
              htmlAttributes={{ rows: "5", maxlength: "4000" }}
              change={(args: { value?: string }) => setNotes(args.value ?? "")}
            />
          </FormField>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <ButtonComponent
            cssClass="e-primary e-outline"
            disabled={!dirty || patch.isPending}
            onClick={save}
          >
            {patch.isPending ? "Saving…" : "Save"}
          </ButtonComponent>
          <ButtonComponent
            cssClass="e-flat e-outline"
            disabled={!dirty || patch.isPending}
            onClick={() => {
              setDraftStatus(message.status);
              setNotes(message.notes);
            }}
          >
            Revert
          </ButtonComponent>
          <span className="admin-status" style={{ marginLeft: "auto", alignSelf: "center" }}>
            {message.updatedBy === "visitor"
              ? "Not touched since it arrived."
              : `Last changed by ${message.updatedBy} on ${new Date(message.updatedAt).toLocaleString()}.`}
          </span>
        </div>
      </section>
    </>
  );
}
