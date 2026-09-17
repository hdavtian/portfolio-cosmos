import { DialogComponent } from "@syncfusion/ej2-react-popups";
import { useEffect } from "react";

interface ImagePreviewProps {
  image: { url: string; altText: string } | null;
  onClose: () => void;
}

/**
 * Full-size view of an image. A viewer, not an editor, so a dialog is fine here
 * (edit screens stay full pages). Closes on Escape, the × or a click outside.
 */
export function ImagePreview({ image, onClose }: ImagePreviewProps) {
  // Syncfusion's closeOnEscape only hears keys while focus is inside the
  // dialog; opening it from a thumbnail leaves focus on the thumbnail.
  useEffect(() => {
    if (!image) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [image, onClose]);

  if (!image) return null;

  const fileName = decodeURIComponent(image.url.split("/").pop() ?? "");

  return (
    <DialogComponent
      visible
      isModal
      showCloseIcon
      closeOnEscape
      header={image.altText || fileName}
      width="min(1200px, 92vw)"
      position={{ X: "center", Y: "center" }}
      overlayClick={onClose}
      // beforeClose, not close: close waits for the hide animation, which stalls
      // in background tabs and left the preview mounted.
      beforeClose={onClose}
      cssClass="admin-image-preview"
    >
      <img src={image.url} alt={image.altText} className="admin-image-preview__img" />
      <div className="admin-status" style={{ marginTop: 6 }}>
        {fileName} ·{" "}
        <a href={image.url} target="_blank" rel="noreferrer">
          Open original in a new tab
        </a>
      </div>
    </DialogComponent>
  );
}
