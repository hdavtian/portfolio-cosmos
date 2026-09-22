import { ButtonComponent } from "@syncfusion/ej2-react-buttons";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { StatusLine } from "../components/StatusLine";
import { StatusProvider } from "../components/StatusProvider";
import { usePendingChanges } from "../lib/pendingChanges";
import { useLogoutMutation } from "../lib/session";

// Grouped so the sidebar mirrors how the content is actually organised.
// `ready: false` marks pages that are not built yet: they render as plainly
// unavailable rather than as links that bounce back to the dashboard.
const NAV_GROUPS: Array<{
  label: string;
  links: Array<{ to: string; text: string; ready?: boolean }>;
}> = [
  {
    label: "Resume",
    links: [
      { to: "/profile", text: "Profile", ready: true },
      { to: "/experiences", text: "Experience", ready: true },
      { to: "/skills", text: "Skills", ready: true },
      { to: "/skillCategories", text: "Skill categories", ready: true },
      { to: "/education", text: "Education", ready: true },
      { to: "/certifications", text: "Certifications", ready: true },
      { to: "/links", text: "Links", ready: true },
    ],
  },
  {
    label: "Portfolio",
    links: [
      { to: "/portfolioEntries", text: "Projects", ready: true },
      { to: "/portfolioCores", text: "Cores", ready: true },
      { to: "/technologies", text: "Technologies", ready: true },
      { to: "/techStackNodes", text: "Tech stack (old)", ready: true },
    ],
  },
  {
    label: "Cinematic",
    links: [{ to: "/pathTravelMessages", text: "Ride messages", ready: true }],
  },
  {
    label: "Library",
    links: [
      { to: "/media", text: "Media", ready: true },
      { to: "/releases", text: "Publishing", ready: true },
    ],
  },
];

export function AdminLayout() {
  const navigate = useNavigate();
  const logout = useLogoutMutation();
  const pending = usePendingChanges();
  const pendingCount = pending.data?.neverPublished ? 0 : (pending.data?.lines.length ?? 0);

  return (
    <div className="admin-shell">
      <nav className="admin-sidebar">
        <div className="admin-sidebar__brand">Content Admin</div>

        <NavLink
          to="/"
          end
          className={({ isActive }) => `admin-sidebar__link ${isActive ? "is-active" : ""}`}
          style={{ marginTop: 12 }}
        >
          Dashboard
        </NavLink>

        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="admin-sidebar__group-label">{group.label}</div>
            {group.links.map((link) =>
              link.ready ? (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) => `admin-sidebar__link ${isActive ? "is-active" : ""}`}
                >
                  {link.text}
                  {link.to === "/releases" && pendingCount > 0 ? (
                    <span
                      className="admin-sidebar__badge"
                      title={`${pendingCount} change${pendingCount === 1 ? "" : "s"} waiting to be published`}
                    >
                      {pendingCount}
                    </span>
                  ) : null}
                </NavLink>
              ) : (
                <span key={link.to} className="admin-sidebar__link is-pending" title="Not built yet">
                  {link.text}
                  <span className="admin-sidebar__soon">soon</span>
                </span>
              ),
            )}
          </div>
        ))}

        <div className="admin-sidebar__footer">
          <ButtonComponent
            cssClass="e-flat e-outline e-small"
            disabled={logout.isPending}
            onClick={() => {
              logout.mutate(undefined, { onSuccess: () => navigate("/login", { replace: true }) });
            }}
          >
            {logout.isPending ? "Signing out…" : "Sign out"}
          </ButtonComponent>
        </div>
      </nav>

      <main className="admin-main">
        <StatusProvider>
          <StatusLine />
          <Outlet />
        </StatusProvider>
      </main>
    </div>
  );
}
