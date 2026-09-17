import { DialogUtility } from "@syncfusion/ej2-popups";

interface ConfirmOptions {
  title: string;
  content: string;
  confirmText: string;
  /** Syncfusion button classes for the confirm button, e.g. "e-danger e-outline". */
  confirmClass?: string;
  onConfirm: () => void;
}

/**
 * A confirmation dialog that closes itself before running the action.
 *
 * DialogUtility.confirm does not close when an okButton click handler is
 * supplied. Every confirm in the admin used to leave its dialog open behind the
 * result, so the next click repeated the action - Publish created release after
 * release. Always use this helper instead of calling DialogUtility.confirm.
 */
export function confirmAction({
  title,
  content,
  confirmText,
  confirmClass = "e-primary e-outline",
  onConfirm,
}: ConfirmOptions): void {
  let handled = false;

  const dialog = DialogUtility.confirm({
    title,
    content,
    okButton: {
      text: confirmText,
      cssClass: confirmClass,
      click: () => {
        // Guard against a double click firing the action twice before hiding.
        if (handled) return;
        handled = true;
        dialog.hide();
        onConfirm();
      },
    },
    cancelButton: {
      text: "Cancel",
      cssClass: "e-flat e-outline",
      click: () => dialog.hide(),
    },
    showCloseIcon: true,
    closeOnEscape: true,
  });
}
