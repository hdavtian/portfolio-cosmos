import type { PropsWithChildren } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useSessionQuery } from "../lib/session";

/** Sends anyone without a valid hd_session cookie to the login page. */
export function RequireSession({ children }: PropsWithChildren) {
  const location = useLocation();
  const session = useSessionQuery();

  if (session.isLoading) {
    return <p className="admin-status" style={{ padding: 24 }}>Checking your session…</p>;
  }

  if (!session.data?.authenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
