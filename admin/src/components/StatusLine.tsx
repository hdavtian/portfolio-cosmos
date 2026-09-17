import { MessageComponent } from "@syncfusion/ej2-react-notifications";
import { useStatus } from "../lib/status";

/** The on-page status line: Syncfusion Message, shown above the page content. */
export function StatusLine() {
  const status = useStatus();
  const current = status.current;

  if (!current) return null;

  return (
    <div className="admin-status-line" role={current.severity === "Error" ? "alert" : "status"}>
      <MessageComponent
        key={current.id}
        severity={current.severity}
        variant="Outlined"
        showCloseIcon
        closed={status.clear}
      >
        <div>
          <strong>{current.message}</strong>
          {current.details.length > 0 ? (
            <ul className="admin-status-line__details">
              {current.details.slice(0, 12).map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
              {current.details.length > 12 ? <li>…and {current.details.length - 12} more</li> : null}
            </ul>
          ) : null}
        </div>
      </MessageComponent>
    </div>
  );
}
