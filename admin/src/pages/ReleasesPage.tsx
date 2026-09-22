import { ButtonComponent } from "@syncfusion/ej2-react-buttons";
import {
  ColumnChooser,
  ColumnDirective,
  ColumnsDirective,
  Filter,
  GridComponent,
  Inject,
  Page,
  Reorder,
  Resize,
  Sort,
  Toolbar,
} from "@syncfusion/ej2-react-grids";
import { TextBoxComponent } from "@syncfusion/ej2-react-inputs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useStatus } from "../lib/status";
import { api } from "../lib/apiClient";
import { confirmAction } from "../lib/confirm";
import { usePendingChanges } from "../lib/pendingChanges";

interface ReleaseSummary {
  id: number;
  notes: string;
  publishedAt: string;
  publishedBy: string;
  current: boolean;
  etag: string;
  rolledBackFrom?: number;
}

interface ReleaseStatus {
  current: { id: number; notes: string; publishedAt: string; publishedBy: string } | null;
  unpublishedChanges: number;
  neverPublished: boolean;
}

// Passed to the grid as a constant: a new object on each render makes
// Syncfusion refresh the grid.
const HISTORY_PAGE_SETTINGS = { pageSize: 25 };

// Matches the API's limit on release notes.
const HISTORY_TOOLBAR = ["Search", "ColumnChooser"];
const HISTORY_FILTER_SETTINGS = { type: "Menu" as const };

const NOTES_MAX = 500;

/** Joins change lines into notes, trimming whole lines to stay within the limit. */
const toNotes = (lines: string[]): string => {
  let notes = "";
  for (const [index, line] of lines.entries()) {
    const remaining = lines.length - index - 1;
    const next = notes ? `${notes}; ${line}` : line;
    const suffix = remaining > 0 ? `; and ${remaining} more` : "";
    if ((next + suffix).length > NOTES_MAX) {
      return `${notes}; and ${lines.length - index} more`.slice(0, NOTES_MAX);
    }
    notes = next;
  }
  return notes;
};

// The history grid uses plain text columns, not React templates: its template
// cells rendered empty, which also hid the per-row Roll back buttons. Rolling
// back now works on the selected row instead.
type HistoryRow = ReleaseSummary & { publishedLabel: string; notesLabel: string };

const toHistoryRow = (release: ReleaseSummary): HistoryRow => ({
  ...release,
  publishedLabel: new Date(release.publishedAt).toLocaleString(),
  notesLabel: `${release.current ? "LIVE · " : ""}${release.notes || "No notes"}`,
});

export function ReleasesPage() {
  const queryClient = useQueryClient();
  const statusLine = useStatus();
  const [notes, setNotes] = useState("");
  // The notes start as the summary of what changed, refreshed while they are
  // untouched. Typing anything stops that: an edited note is never overwritten.
  const [notesEdited, setNotesEdited] = useState(false);

  const status = useQuery({
    queryKey: ["releases", "status"],
    queryFn: () => api.get<ReleaseStatus>("/api/v2/admin/releases/status"),
  });

  const history = useQuery({
    queryKey: ["releases", "history"],
    queryFn: () => api.get<{ items: ReleaseSummary[] }>("/api/v2/admin/releases"),
  });

  // Recomputed from the drafts each time the page is shown or refocused.
  const pending = usePendingChanges();

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["releases"] });

  const copyChanges = async (lines: string[]) => {
    try {
      await navigator.clipboard.writeText(lines.map((line) => `- ${line}`).join("\n"));
      statusLine.success("Changes copied to the clipboard.");
    } catch {
      statusLine.failure("Could not copy. Select the text in the list and copy it instead.");
    }
  };

  const check = useMutation({
    mutationFn: () => api.get<{ ok: boolean }>("/api/v2/admin/releases/draft-check"),
    onSuccess: () => statusLine.success("Drafts are valid: everything passes validation and can be published."),
    onError: (error) => statusLine.error(error, "Drafts need fixing before publishing."),
  });

  const publish = useMutation({
    mutationFn: () => api.post<ReleaseSummary>("/api/v2/admin/releases/publish", { notes: notes.trim() }),
    onSuccess: (release) => {
      // The next release starts from its own summary again.
      setNotes("");
      setNotesEdited(false);
      setSuggestionShown("");
      void refresh();
      statusLine.success(`Release #${release.id} is live on both sites.`);
    },
    onError: (error) => statusLine.error(error, "Could not publish."),
  });

  const discard = useMutation({
    mutationFn: () => api.post<{ discarded: boolean }>("/api/v2/admin/releases/discard-drafts"),
    onSuccess: () => {
      // Every cached record in the admin is now stale.
      void queryClient.invalidateQueries();
      statusLine.success("Unpublished changes discarded. The drafts match the live release again.");
    },
    onError: (error: unknown) => statusLine.error(error, "Could not discard the changes."),
  });

  const confirmDiscard = () => {
    if (discard.isPending) return;
    const count = pending.data?.lines.length ?? 0;
    confirmAction({
      title: "Discard unpublished changes?",
      content:
        `${count === 1 ? "One change" : `${count} changes`} will be thrown away and the drafts will match the live ` +
        "release again. A copy of the drafts is kept, so this can be undone by hand if it was a mistake.",
      confirmText: "Discard changes",
      confirmClass: "e-danger e-outline",
      onConfirm: () => discard.mutate(),
    });
  };

  const rollback = useMutation({
    mutationFn: (id: number) => api.post<ReleaseSummary>(`/api/v2/admin/releases/${id}/rollback`),
    onSuccess: (release) => {
      // Drafts were reset too, so every cached record in the admin is stale.
      void queryClient.invalidateQueries();
      statusLine.success(
        `Rolled back to release #${release.rolledBackFrom} (published as release #${release.id}). Drafts now match it.`,
      );
    },
    onError: (error) => statusLine.error(error, "Could not roll back."),
  });

  const confirmPublish = () => {
    if (publish.isPending) return;
    confirmAction({
      title: "Publish all drafts?",
      content: "Both sites will switch to the current drafts. You can roll back afterwards.",
      confirmText: "Publish",
      onConfirm: () => publish.mutate(),
    });
  };

  const confirmRollback = (release: ReleaseSummary) => {
    if (rollback.isPending) return;
    const escape = (text: string) =>
      text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const unpublished = pending.data?.lines ?? [];
    const replaced =
      unpublished.length > 0
        ? `<p><strong>These unpublished changes will be replaced</strong> (a backup is kept):</p><ul>${unpublished
            .slice(0, 8)
            .map((line) => `<li>${escape(line)}</li>`)
            .join("")}${unpublished.length > 8 ? `<li>…and ${unpublished.length - 8} more</li>` : ""}</ul>`
        : "";
    confirmAction({
      title: `Roll back to release #${release.id}?`,
      content: `<p>The sites show release #${release.id} again, and your drafts in the admin are reset to match it. History is kept.</p>${replaced}`,
      confirmText: "Roll back",
      confirmClass: "e-danger e-outline",
      onConfirm: () => rollback.mutate(release.id),
    });
  };


  const historyRows = useMemo(() => (history.data?.items ?? []).map(toHistoryRow), [history.data]);

  const suggestedNotes = pending.data ? toNotes(pending.data.lines) : "";
  const [suggestionShown, setSuggestionShown] = useState("");
  if (!notesEdited && suggestedNotes !== suggestionShown) {
    setSuggestionShown(suggestedNotes);
    setNotes(suggestedNotes);
  }

  const busy = publish.isPending || check.isPending || discard.isPending;
  const s = status.data;

  // Rolling back acts on one release, so the button belongs in its row: the
  // history is paged and the one you want is rarely at the top.
  const rollbackTemplate = (row: HistoryRow) =>
    row.current ? (
      <span className="admin-status">Live</span>
    ) : (
      <ButtonComponent
        cssClass="e-small e-danger e-outline"
        disabled={rollback.isPending}
        onClick={() => confirmRollback(row)}
      >
        Roll back
      </ButtonComponent>
    );

  return (
    <>
      <div className="admin-page-header">
        <div>
          <h1>Publishing</h1>
          <p>Edits are drafts until published. Publishing freezes a snapshot that both sites serve.</p>
        </div>
      </div>

      <section className="admin-card">
        <div className="admin-card__label">Status</div>
        {status.isLoading ? (
          <p className="admin-status">Loading…</p>
        ) : s?.neverPublished ? (
          <p style={{ margin: "6px 0 0" }}>Nothing published yet. The public API returns 404 until you publish.</p>
        ) : (
          <p style={{ margin: "6px 0 0" }}>
            Release <strong>#{s?.current?.id}</strong> is live, published{" "}
            {s?.current ? new Date(s.current.publishedAt).toLocaleString() : ""}.{" "}
            {pending.data
              ? pending.data.lines.length > 0
                ? `${pending.data.lines.length} change${pending.data.lines.length === 1 ? "" : "s"} waiting to be published.`
                : "No unpublished changes."
              : s && s.unpublishedChanges > 0
                ? `${s.unpublishedChanges} draft change${s.unpublishedChanges === 1 ? "" : "s"} not yet published.`
                : "No unpublished changes."}
          </p>
        )}

        <div className="admin-form__row" style={{ marginTop: 12 }}>
          <div className="admin-form__label">Changes</div>
          <div className="admin-form__control">
            {pending.isLoading ? (
              <p className="admin-status">Working out what changed…</p>
            ) : pending.isError ? (
              <p className="admin-error">Could not work out the changes.</p>
            ) : pending.data && pending.data.lines.length > 0 ? (
              <>
                <ul className="admin-change-list" aria-label="Changes waiting to be published">
                  {/* Keyed by position: two records with the same name make
                      the same line, and a repeated key breaks the list. */}
                  {pending.data.lines.map((line, index) => (
                    <li key={`${index}-${line}`}>{line}</li>
                  ))}
                </ul>
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <ButtonComponent
                    cssClass="e-small e-flat e-outline"
                    onClick={() => {
                      setNotes(toNotes(pending.data.lines));
                      setNotesEdited(false);
                    }}
                  >
                    Use as notes
                  </ButtonComponent>
                  <ButtonComponent cssClass="e-small e-flat e-outline" onClick={() => void copyChanges(pending.data.lines)}>
                    Copy
                  </ButtonComponent>
                </div>
              </>
            ) : (
              <p className="admin-status" style={{ margin: 0 }}>Nothing has changed since the live release.</p>
            )}
          </div>
        </div>

        <div className="admin-form__row" style={{ marginTop: 12 }}>
          <div className="admin-form__label">Notes</div>
          <div className="admin-form__control">
            <TextBoxComponent
              placeholder="What changed? (optional)"
              multiline
              maxLength={NOTES_MAX}
              value={notes}
              input={(event: { value: string }) => {
                setNotes(event.value);
                setNotesEdited(true);
              }}
            />
          </div>
        </div>

        {/* Publishing and its dry run on the left; discarding is destructive,
            so it sits apart on the right where it cannot be hit by habit. */}
        <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
          <ButtonComponent
            cssClass="e-flat e-outline"
            disabled={busy}
            title="Runs every check that publishing runs, and publishes nothing."
            onClick={() => check.mutate()}
          >
            {check.isPending ? "Checking…" : "Dry run"}
          </ButtonComponent>
          <ButtonComponent cssClass="e-primary e-outline" disabled={busy} onClick={confirmPublish}>
            {publish.isPending ? "Publishing…" : "Publish"}
          </ButtonComponent>
          <ButtonComponent
            cssClass="e-danger e-outline"
            style={{ marginLeft: "auto" }}
            disabled={busy || (pending.data?.lines.length ?? 0) === 0}
            onClick={confirmDiscard}
          >
            {discard.isPending ? "Discarding…" : "Discard changes"}
          </ButtonComponent>
        </div>
      </section>

      <section className="admin-card admin-section">
        <div className="admin-section__header">
          <h2>History</h2>
        </div>
        {history.isError ? <p className="admin-error">Could not load release history.</p> : null}
        {history.isLoading ? <p className="admin-status">Loading…</p> : null}
        {history.data ? (
          <>
            <p className="admin-status">
              {rollback.isPending ? "Rolling back…" : "Roll back from the row of the release you want to restore."}
            </p>
            <GridComponent
              id="releaseHistory"
              enablePersistence
              key={history.data.items[0]?.id ?? "empty"}
              dataSource={historyRows}
              allowPaging
              allowSorting
              allowResizing
              allowFiltering
              allowReordering
              showColumnChooser
              filterSettings={HISTORY_FILTER_SETTINGS}
              toolbar={HISTORY_TOOLBAR}
              pageSettings={HISTORY_PAGE_SETTINGS}
              gridLines="Horizontal"
            >
              <ColumnsDirective>
                <ColumnDirective field="id" headerText="#" width={70} textAlign="Right" />
                <ColumnDirective field="publishedLabel" headerText="Published" width={190} allowSorting={false} />
                <ColumnDirective field="publishedBy" headerText="By" width={110} />
                <ColumnDirective field="notesLabel" headerText="Notes" width={420} clipMode="EllipsisWithTooltip" />
                <ColumnDirective headerText="Actions" width={150} template={rollbackTemplate} />
              </ColumnsDirective>
              <Inject services={[Page, Sort, Resize, Filter, Reorder, Toolbar, ColumnChooser]} />
            </GridComponent>
          </>
        ) : null}
      </section>
    </>
  );
}
