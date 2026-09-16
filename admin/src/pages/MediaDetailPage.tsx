import { ButtonComponent } from "@syncfusion/ej2-react-buttons";
import { TextBoxComponent } from "@syncfusion/ej2-react-inputs";
import { DialogUtility } from "@syncfusion/ej2-popups";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FormField } from "../components/FormField";
import { api, ApiError } from "../lib/apiClient";
import { confirmAction } from "../lib/confirm";
import type { MediaRecord } from "./MediaPage";

type MediaDetail = MediaRecord & { usedBy: number };

export function MediaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const media = useQuery({
    queryKey: ["media", "detail", id],
    queryFn: () => api.get<MediaDetail>(`/api/v2/admin/media/${id}`),
    enabled: Boolean(id),
  });

  if (media.isLoading) return <p className="admin-status">Loading…</p>;
  if (media.isError || !media.data) {
    return (
      <p className="admin-error">
        {media.error instanceof ApiError ? media.error.message : "Could not load this image."}
      </p>
    );
  }

  // Keyed by version so a background refetch cannot overwrite an edit in progress.
  return <MediaEditor key={`${media.data.id}-${media.data.version}`} record={media.data} />;
}

function MediaEditor({ record }: { record: MediaDetail }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [altText, setAltText] = useState(record.altText);

  const save = useMutation({
    mutationFn: () =>
      api.patch<MediaRecord>(`/api/v2/admin/media/${record.id}`, {
        altText: altText.trim(),
        version: record.version,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["media"] }),
    onError: (error) => {
      if (error instanceof ApiError && error.isConflict) {
        DialogUtility.alert({
          title: "Someone else saved first",
          content: `${error.message} Reload to see the current version.`,
        });
        return;
      }
      DialogUtility.alert({
        title: "Could not save",
        content: error instanceof ApiError ? error.message : "Unexpected error.",
      });
    },
  });

  const remove = useMutation({
    mutationFn: () => api.delete<void>(`/api/v2/admin/media/${record.id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["media"] });
      navigate("/media", { replace: true });
    },
    onError: (error) =>
      DialogUtility.alert({
        title: "Could not delete",
        content: error instanceof ApiError ? error.message : "Unexpected error.",
      }),
  });

  const confirmDelete = () => {
    if (record.usedBy > 0) {
      DialogUtility.alert({
        title: "This image is in use",
        content: `It is used by ${record.usedBy} record${record.usedBy === 1 ? "" : "s"}. Replace it there before deleting it.`,
      });
      return;
    }
    confirmAction({
      title: "Delete this image?",
      content: "The file is removed from storage. This cannot be undone.",
      confirmText: "Delete",
      confirmClass: "e-danger e-outline",
      onConfirm: () => remove.mutate(),
    });
  };

  const fileName = record.blobPath.split("/").pop();

  return (
    <>
      <div className="admin-page-header">
        <div>
          <h1>{fileName}</h1>
          <p>
            Version {record.version} · used by {record.usedBy} record{record.usedBy === 1 ? "" : "s"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <ButtonComponent cssClass="e-flat e-outline" onClick={() => navigate("/media")}>
            Back
          </ButtonComponent>
          <ButtonComponent cssClass="e-danger e-outline" disabled={remove.isPending} onClick={confirmDelete}>
            Delete
          </ButtonComponent>
          <ButtonComponent cssClass="e-primary e-outline" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : "Save"}
          </ButtonComponent>
        </div>
      </div>

      <section className="admin-card" style={{ marginBottom: 16, textAlign: "center" }}>
        <img
          src={record.url}
          alt={record.altText}
          style={{ maxWidth: "100%", maxHeight: 420, objectFit: "contain" }}
        />
      </section>

      <section className="admin-card">
        <FormField
          label="Alt text"
          hint="Describes the image for screen readers and when it fails to load"
        >
          <TextBoxComponent value={altText} input={(event: { value: string }) => setAltText(event.value)} />
        </FormField>
        <FormField label="Dimensions">
          <span>{record.width && record.height ? `${record.width} × ${record.height}` : "Unknown"}</span>
        </FormField>
        <FormField label="Type">
          <span>
            {record.contentType} · {(record.bytes / 1024).toFixed(0)} KB
          </span>
        </FormField>
        <FormField label="Storage path">
          <code style={{ wordBreak: "break-all" }}>{record.blobPath}</code>
        </FormField>
        {record.sourcePath ? (
          <FormField label="Imported from">
            <code style={{ wordBreak: "break-all" }}>{record.sourcePath}</code>
          </FormField>
        ) : null}
      </section>
    </>
  );
}
