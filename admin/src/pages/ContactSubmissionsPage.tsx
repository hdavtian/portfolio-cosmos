import { ButtonComponent } from "@syncfusion/ej2-react-buttons";
import { ColumnDirective } from "@syncfusion/ej2-react-grids";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CONTACT_STATUSES, CONTACT_STATUS_LABELS, type ContactStatus } from "@hd/content-schema";
import { EntityGrid } from "../components/EntityGrid";
import { confirmAction } from "../lib/confirm";
import {
  useContactSubmissions,
  useDeleteContactSubmission,
  type ContactSubmissionRecord,
} from "../lib/contactApi";
import { DEFAULT_LIST_STATE, type ListState } from "../lib/entityApi";
import { resetGridLayout } from "../lib/gridLayout";
import { useStatus } from "../lib/status";

/**
 * Contact Form Submissions: the default screen. HD-4.
 *
 * The ticket asks for one nav entry with everything reachable from it, and for
 * the list to be what opens. So the settings page is linked from here rather
 * than given a nav entry of its own.
 *
 * Read, update and delete, but no add. A message exists because somebody sent
 * one; an admin able to invent them would make this list a worse record than
 * the inbox it replaces.
 */

/*
 * Bumped when a column changes.
 *
 * The grid is persisted, so it keeps the column set it was last shown with:
 * renaming "Email" to "Notified" would leave the old header in place for
 * anybody who had already opened the page. A new id is the fix the
 * syncfusion-list-pages skill requires -- never an instruction to press
 * "Reset layout".
 */
const GRID_ID = "contactSubmissions-v2";

const shorten = (value: string, length: number) =>
  value.length > length ? `${value.slice(0, length).trimEnd()}…` : value;

export function ContactSubmissionsPage() {
  const navigate = useNavigate();
  const status = useStatus();
  const [state, setState] = useState<ListState>(DEFAULT_LIST_STATE);
  const [filter, setFilter] = useState<ContactStatus | undefined>(undefined);
  const list = useContactSubmissions(state, filter);
  const remove = useDeleteContactSubmission();

  const counts = list.data?.counts ?? {};
  const total = Object.values(counts).reduce((sum, count) => sum + (count ?? 0), 0);

  /**
   * The grid keeps the handlers it was given at mount, so a fresh closure per
   * render would delete using a stale record. Live values are read through a
   * ref, as the list-pages skill requires -- and the ref is written in an
   * effect, not during render, because a ref assigned mid-render is the thing
   * React's own lint rule (and 19's stricter rendering) objects to.
   */
  const removeRef = useRef(remove);
  const statusRef = useRef(status);
  useEffect(() => {
    removeRef.current = remove;
    statusRef.current = status;
  }, [remove, status]);

  const handleDelete = useCallback((record: ContactSubmissionRecord) => {
    confirmAction({
      title: "Delete this message?",
      content: `The message from ${record.name} (${record.reference}) will be removed permanently. Mark it as Spam instead if you only want it out of the way.`,
      confirmText: "Delete",
      confirmClass: "e-danger e-outline",
      onConfirm: () => {
        removeRef.current.mutate(record.id, {
          onSuccess: () => statusRef.current.success(`Deleted the message from ${record.name}.`),
          onError: (error) => statusRef.current.error(error, "The message could not be deleted."),
        });
      },
    });
  }, []);

  /* Templates are memoised once. A new function each render makes the grid
     rebuild every cell, which re-renders React, which makes new functions --
     the freeze the list-pages skill warns about. */
  const templates = useMemo(
    () => ({
      status: (record: ContactSubmissionRecord) => (
        <span className={`admin-pill admin-pill--${record.status}`}>
          {CONTACT_STATUS_LABELS[record.status]}
        </span>
      ),
      submitted: (record: ContactSubmissionRecord) => (
        <span title={new Date(record.submittedAt).toLocaleString()}>
          {new Date(record.submittedAt).toLocaleDateString()}
        </span>
      ),
      message: (record: ContactSubmissionRecord) => (
        /* Plain text, so React escapes it. Never a raw HTML template here: the
           message is whatever a stranger typed, and the only thing stopping it
           being interpreted is that nothing interprets it. */
        <span title={shorten(record.message, 400)}>{shorten(record.message, 90)}</span>
      ),
      /*
       * Only speaks up when something went wrong.
       *
       * Not an action -- there is nothing to do to a row from here. It reports
       * whether the two emails for that message actually went out, which
       * matters because the message is stored *before* any send is attempted:
       * a note must never be lost because Gmail was down or an app password
       * was revoked. Without it, a silently broken mailbox looks exactly like
       * a quiet week.
       *
       * Blank on a healthy row. The first version printed "Sent" on every one
       * of them, which is a column shouting a fact nobody needs and made the
       * warning harder to spot, not easier.
       */
      mail: (record: ContactSubmissionRecord) =>
        record.mailError ? (
          <span className="admin-error" title={record.mailError}>
            Not sent
          </span>
        ) : null,
      actions: (record: ContactSubmissionRecord) => (
        <div style={{ display: "flex", gap: 6 }}>
          <ButtonComponent
            cssClass="e-small e-outline e-primary"
            onClick={() => navigate(`/contactSubmissions/${record.id}`)}
          >
            Open
          </ButtonComponent>
          <ButtonComponent
            cssClass="e-small e-outline e-danger"
            onClick={() => handleDelete(record)}
          >
            Delete
          </ButtonComponent>
        </div>
      ),
    }),
    [handleDelete, navigate],
  );

  return (
    <>
      <div className="admin-page-header">
        <div>
          <h1>Contact Form Submissions</h1>
          <p>
            Messages sent from the contact form on the site. Search matches the reference, name,
            address, message and your notes.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
          <ButtonComponent
            cssClass="e-outline e-primary"
            onClick={() => navigate("/contactSubmissions/settings")}
          >
            Settings and emails
          </ButtonComponent>
        </div>
      </div>

      {/* Status chips rather than a grid filter: the API pages the list, so it
          filters server-side, and a menu filter on a server-mode grid would
          only narrow the page in front of you. */}
      <div className="admin-grid-mode" style={{ flexWrap: "wrap" }}>
        <ButtonComponent
          cssClass={`e-small e-outline ${filter === undefined ? "e-primary" : "e-flat"}`}
          onClick={() => {
            setFilter(undefined);
            setState(DEFAULT_LIST_STATE);
          }}
        >
          {`All${total ? ` (${total})` : ""}`}
        </ButtonComponent>
        {CONTACT_STATUSES.map((value) => (
          <ButtonComponent
            key={value}
            cssClass={`e-small e-outline ${filter === value ? "e-primary" : "e-flat"}`}
            onClick={() => {
              setFilter(value);
              // Back to page one: page four of "all" may not exist in one status.
              setState(DEFAULT_LIST_STATE);
            }}
          >
            {`${CONTACT_STATUS_LABELS[value]}${counts[value] ? ` (${counts[value]})` : ""}`}
          </ButtonComponent>
        ))}
        <ButtonComponent
          cssClass="e-small e-flat e-outline"
          style={{ marginLeft: "auto" }}
          title="Forget the remembered column widths, order, hidden columns, sorting and page size for this list."
          onClick={() => {
            resetGridLayout(GRID_ID);
            window.location.reload();
          }}
        >
          Reset layout
        </ButtonComponent>
      </div>

      {list.isError ? <p className="admin-error">Could not load the messages.</p> : null}

      {list.data && list.data.total === 0 ? (
        <p className="admin-status">
          {filter
            ? `No messages are marked ${CONTACT_STATUS_LABELS[filter]}.`
            : "Nothing has been sent through the form yet."}{" "}
          <Link to="/contactSubmissions/settings">Check the email settings</Link> if you were
          expecting something.
        </p>
      ) : null}

      <div className="admin-grid-wrap">
        <EntityGrid
          gridId={GRID_ID}
          rows={list.data?.items}
          total={list.data?.total}
          mode="server"
          state={state}
          onStateChange={setState}
        >
          {[
            <ColumnDirective
              key="reference"
              field="reference"
              headerText="Ref"
              width={110}
            />,
            <ColumnDirective
              key="submittedAt"
              field="submittedAt"
              headerText="Sent"
              width={120}
              template={templates.submitted}
            />,
            <ColumnDirective key="name" field="name" headerText="Name" width={160} />,
            <ColumnDirective key="email" field="email" headerText="Email" width={210} />,
            <ColumnDirective
              key="message"
              field="message"
              headerText="Message"
              width={320}
              template={templates.message}
              allowSorting={false}
            />,
            <ColumnDirective
              key="status"
              field="status"
              headerText="Status"
              width={110}
              template={templates.status}
            />,
            <ColumnDirective
              key="mailError"
              field="mailError"
              headerText="Notified"
              width={100}
              template={templates.mail}
              allowSorting={false}
            />,
            <ColumnDirective
              key="actions"
              headerText="Actions"
              width={170}
              template={templates.actions}
              allowSorting={false}
            />,
          ]}
        </EntityGrid>
      </div>
    </>
  );
}
