import type { ReactNode } from "react";

/** Label and control on one row (stacked on narrow screens), with hint or error below. */
export function FormField({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="admin-form__row">
      <div className="admin-form__label">{label}</div>
      <div className="admin-form__control">
        {children}
        {error ? (
          <p className="admin-error" style={{ margin: "4px 0 0" }}>
            {error}
          </p>
        ) : hint ? (
          <p className="admin-status" style={{ margin: "4px 0 0" }}>
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}
