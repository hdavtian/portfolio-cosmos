import { ButtonComponent } from "@syncfusion/ej2-react-buttons";
import {
  ColumnDirective,
  ColumnsDirective,
  GridComponent,
  Inject,
  Page,
  Resize,
  Sort,
} from "@syncfusion/ej2-react-grids";
import { TextBoxComponent } from "@syncfusion/ej2-react-inputs";
import { DialogUtility } from "@syncfusion/ej2-popups";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, ApiError } from "../lib/apiClient";
import { confirmAction } from "../lib/confirm";

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

const alertApiError = (title: string, error: unknown) => {
  if (error instanceof ApiError && error.details.length > 0) {
    // Draft validation failures list every invalid field path.
    const list = error.details
      .slice(0, 12)
      .map((detail) => `<li><code>${detail.path}</code>: ${detail.message}</li>`)
      .join("");
    const more = error.details.length > 12 ? `<p>…and ${error.details.length - 12} more.</p>` : "";
    DialogUtility.alert({ title, content: `<p>${error.message}</p><ul>${list}</ul>${more}` });
    return;
  }
  DialogUtility.alert({ title, content: error instanceof ApiError ? error.message : "Unexpected error." });
};

export function ReleasesPage() {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState("");

  const status = useQuery({
    queryKey: ["releases", "status"],
    queryFn: () => api.get<ReleaseStatus>("/api/v2/admin/releases/status"),
  });

  const history = useQuery({
    queryKey: ["releases", "history"],
    queryFn: () => api.get<{ items: ReleaseSummary[] }>("/api/v2/admin/releases"),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["releases"] });

  const check = useMutation({
    mutationFn: () => api.get<{ ok: boolean }>("/api/v2/admin/releases/draft-check"),
    onSuccess: () =>
      DialogUtility.alert({
        title: "Drafts are valid",
        content: "Everything passes validation and can be published.",
      }),
    onError: (error) => alertApiError("Drafts need fixing before publishing", error),
  });

  const publish = useMutation({
    mutationFn: () => api.post<ReleaseSummary>("/api/v2/admin/releases/publish", { notes: notes.trim() }),
    onSuccess: (release) => {
      setNotes("");
      void refresh();
      DialogUtility.alert({
        title: `Release #${release.id} is live`,
        content: "Both sites now serve this content.",
      });
    },
    onError: (error) => alertApiError("Could not publish", error),
  });

  const rollback = useMutation({
    mutationFn: (id: number) => api.post<ReleaseSummary>(`/api/v2/admin/releases/${id}/rollback`),
    onSuccess: (release) => {
      void refresh();
      DialogUtility.alert({
        title: `Rolled back to release #${release.rolledBackFrom}`,
        content: `Published as release #${release.id}. Your drafts are unchanged.`,
      });
    },
    onError: (error) => alertApiError("Could not roll back", error),
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
    confirmAction({
      title: `Roll back to release #${release.id}?`,
      content:
        "Its content is republished as a new release, so the sites show it again. History is kept, and your drafts are not changed.",
      confirmText: "Roll back",
      confirmClass: "e-danger e-outline",
      onConfirm: () => rollback.mutate(release.id),
    });
  };

  const whenTemplate = (release: ReleaseSummary) => (
    <span>{new Date(release.publishedAt).toLocaleString()}</span>
  );

  const notesTemplate = (release: ReleaseSummary) => (
    <span>
      {release.current ? <strong>Live · </strong> : null}
      {release.notes || <span className="admin-status">No notes</span>}
    </span>
  );

  const actionsTemplate = (release: ReleaseSummary) =>
    release.current ? (
      <span className="admin-status">Current</span>
    ) : (
      <ButtonComponent
        cssClass="e-small e-danger e-outline"
        disabled={rollback.isPending}
        onClick={() => confirmRollback(release)}
      >
        Roll back
      </ButtonComponent>
    );

  const busy = publish.isPending || check.isPending;
  const s = status.data;

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
            {s && s.unpublishedChanges > 0
              ? `${s.unpublishedChanges} draft change${s.unpublishedChanges === 1 ? "" : "s"} not yet published.`
              : "No unpublished changes."}
          </p>
        )}

        <div className="admin-form__row" style={{ marginTop: 12 }}>
          <div className="admin-form__label">Notes</div>
          <div className="admin-form__control">
            <TextBoxComponent
              placeholder="What changed? (optional)"
              value={notes}
              input={(event: { value: string }) => setNotes(event.value)}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <ButtonComponent cssClass="e-flat e-outline" disabled={busy} onClick={() => check.mutate()}>
            {check.isPending ? "Checking…" : "Check drafts"}
          </ButtonComponent>
          <ButtonComponent cssClass="e-primary e-outline" disabled={busy} onClick={confirmPublish}>
            {publish.isPending ? "Publishing…" : "Publish"}
          </ButtonComponent>
        </div>
      </section>

      <section className="admin-card admin-section">
        <div className="admin-section__header">
          <h2>History</h2>
        </div>
        {history.isError ? <p className="admin-error">Could not load release history.</p> : null}
        <GridComponent
          dataSource={history.data?.items ?? []}
          allowPaging
          allowSorting
          allowResizing
          pageSettings={{ pageSize: 25 }}
          gridLines="Horizontal"
        >
          <ColumnsDirective>
            <ColumnDirective field="id" headerText="#" width={70} textAlign="Right" />
            <ColumnDirective headerText="Published" width={190} template={whenTemplate} />
            <ColumnDirective field="publishedBy" headerText="By" width={110} />
            <ColumnDirective headerText="Notes" width={320} template={notesTemplate} />
            <ColumnDirective headerText="" width={130} template={actionsTemplate} allowSorting={false} />
          </ColumnsDirective>
          <Inject services={[Page, Sort, Resize]} />
        </GridComponent>
      </section>
    </>
  );
}
