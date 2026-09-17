import { ButtonComponent } from "@syncfusion/ej2-react-buttons";
import { ColumnDirective } from "@syncfusion/ej2-react-grids";
import { UploaderComponent, type SelectedEventArgs } from "@syncfusion/ej2-react-inputs";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { EntityGrid } from "../components/EntityGrid";
import { useStatus } from "../lib/status";
import { api, ApiError } from "../lib/apiClient";
import { DEFAULT_LIST_STATE, useEntityList, type ListState } from "../lib/entityApi";

export interface MediaRecord {
  id: string;
  blobPath: string;
  sourcePath?: string;
  contentType: string;
  bytes: number;
  width?: number;
  height?: number;
  altText: string;
  url: string;
  version: number;
  updatedAt: string;
  updatedBy: string;
}

const ENTITY = "media";

const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;

export function MediaPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const uploaderRef = useRef<UploaderComponent>(null);
  const [state, setState] = useState<ListState>(DEFAULT_LIST_STATE);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const list = useEntityList<MediaRecord>(ENTITY, state);
  const status = useStatus();

  // The uploader is only a file picker here: files are sent one at a time to the
  // API, which checks each file's type by content and strips EXIF data.
  const handleSelected = async (args: SelectedEventArgs) => {
    args.cancel = true;
    const files = args.filesData.map((file) => file.rawFile).filter((file): file is File => file instanceof File);
    if (files.length === 0) return;

    const failures: string[] = [];
    setUploading({ done: 0, total: files.length });

    for (const [index, file] of files.entries()) {
      const form = new FormData();
      form.append("file", file);
      try {
        await api.upload(`/api/v2/admin/${ENTITY}`, form);
      } catch (error) {
        failures.push(`${file.name}: ${error instanceof ApiError ? error.message : "upload failed"}`);
      }
      setUploading({ done: index + 1, total: files.length });
    }

    setUploading(null);
    uploaderRef.current?.clearAll();
    void queryClient.invalidateQueries({ queryKey: [ENTITY] });

    if (failures.length > 0) {
      status.failure(`${failures.length} of ${files.length} uploads failed.`, failures);
    } else {
      status.success(`Uploaded ${files.length} file${files.length === 1 ? "" : "s"}.`);
    }
  };

  const previewTemplate = (record: MediaRecord) => (
    <img
      src={record.url}
      alt={record.altText}
      loading="lazy"
      style={{ width: 64, height: 44, objectFit: "cover", borderRadius: 4, display: "block" }}
    />
  );

  const sizeTemplate = (record: MediaRecord) => (
    <span className="admin-status">
      {record.width && record.height ? `${record.width}×${record.height} · ` : ""}
      {formatBytes(record.bytes)}
    </span>
  );

  const altTemplate = (record: MediaRecord) =>
    record.altText ? <span>{record.altText}</span> : <span className="admin-status">Missing</span>;

  const actionsTemplate = (record: MediaRecord) => (
    <ButtonComponent cssClass="e-small e-outline e-primary" onClick={() => navigate(`/media/${record.id}`)}>
      Open
    </ButtonComponent>
  );

  return (
    <>
      <div className="admin-page-header">
        <div>
          <h1>Media</h1>
          <p>Images used across both sites. Search matches file path and alt text.</p>
        </div>
      </div>

      <section className="admin-card" style={{ marginBottom: 16 }}>
        <div className="admin-card__label">Upload images</div>
        <p className="admin-status" style={{ margin: "4px 0 10px" }}>
          JPEG, PNG, GIF or WebP, up to 25 MB each. Location and camera data are removed on upload.
        </p>
        <UploaderComponent
          ref={uploaderRef}
          allowedExtensions=".jpg,.jpeg,.png,.gif,.webp"
          multiple
          autoUpload={false}
          showFileList={false}
          enabled={!uploading}
          selected={handleSelected}
        />
        {uploading ? (
          <p className="admin-status" style={{ marginTop: 8 }}>
            Uploading {uploading.done} of {uploading.total}…
          </p>
        ) : null}
      </section>

      {list.isError ? <p className="admin-error">Could not load media.</p> : null}

      <div className="admin-grid-wrap">
        <EntityGrid
          rows={list.data?.items}
          total={list.data?.total}
          mode="server"
          state={state}
          onStateChange={setState}
        >
          {[
            <ColumnDirective key="preview" headerText="" width={90} template={previewTemplate} allowSorting={false} />,
            <ColumnDirective key="blobPath" field="blobPath" headerText="File" width={300} clipMode="EllipsisWithTooltip" />,
            <ColumnDirective key="size" headerText="Size" width={150} template={sizeTemplate} allowSorting={false} />,
            <ColumnDirective key="alt" headerText="Alt text" width={200} template={altTemplate} allowSorting={false} />,
            <ColumnDirective key="updatedAt" field="updatedAt" headerText="Updated" width={130} type="date" format="yMd" />,
            <ColumnDirective key="actions" headerText="" width={100} template={actionsTemplate} allowSorting={false} allowFiltering={false} />,
          ]}
        </EntityGrid>
      </div>
    </>
  );
}
