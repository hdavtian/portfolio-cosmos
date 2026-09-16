import { ButtonComponent } from "@syncfusion/ej2-react-buttons";
import type { ReactNode } from "react";
import { confirmAction } from "../lib/confirm";

interface ListEditorProps<T> {
  title: string;
  description?: string;
  items: T[];
  onChange: (items: T[]) => void;
  /** A blank item appended by "Add". */
  createItem: () => T;
  /** Short label used in the remove confirmation, e.g. the item's title. */
  describeItem: (item: T, index: number) => string;
  renderItem: (item: T, update: (next: T) => void, index: number) => ReactNode;
  addLabel: string;
  /** Server validation messages for this section, keyed by field path. */
  errors?: string[];
}

/**
 * Edits an ordered list embedded in a record (positions, projects, memories).
 * Changes stay local until the record is saved as a whole, so reordering and
 * removing are free to undo by leaving without saving.
 */
export function ListEditor<T>({
  title,
  description,
  items,
  onChange,
  createItem,
  describeItem,
  renderItem,
  addLabel,
  errors = [],
}: ListEditorProps<T>) {
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  };

  const remove = (index: number) => {
    confirmAction({
      title: "Remove this item?",
      content: `"${describeItem(items[index], index)}" will be removed when you save.`,
      confirmText: "Remove",
      confirmClass: "e-danger e-outline",
      onConfirm: () => onChange(items.filter((_, i) => i !== index)),
    });
  };

  return (
    <section className="admin-card admin-section">
      <div className="admin-section__header">
        <div>
          <h2>
            {title} <span className="admin-status">({items.length})</span>
          </h2>
          {description ? <p className="admin-status" style={{ margin: "2px 0 0" }}>{description}</p> : null}
        </div>
        <ButtonComponent
          cssClass="e-small e-primary e-outline"
          onClick={() => onChange([...items, createItem()])}
        >
          {addLabel}
        </ButtonComponent>
      </div>

      {errors.length > 0 ? (
        <ul className="admin-error" style={{ margin: "0 0 10px", paddingLeft: 18 }}>
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : null}

      {items.length === 0 ? <p className="admin-status">None yet.</p> : null}

      {items.map((item, index) => (
        <div className="admin-list-item" key={index}>
          <div className="admin-list-item__bar">
            <ButtonComponent
              cssClass="e-small e-flat e-outline"
              disabled={index === 0}
              onClick={() => move(index, index - 1)}
            >
              Move up
            </ButtonComponent>
            <ButtonComponent
              cssClass="e-small e-flat e-outline"
              disabled={index === items.length - 1}
              onClick={() => move(index, index + 1)}
            >
              Move down
            </ButtonComponent>
            <ButtonComponent cssClass="e-small e-danger e-outline" onClick={() => remove(index)}>
              Remove
            </ButtonComponent>
          </div>
          {renderItem(
            item,
            (next) => onChange(items.map((current, i) => (i === index ? next : current))),
            index,
          )}
        </div>
      ))}
    </section>
  );
}
