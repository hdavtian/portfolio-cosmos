import { ButtonComponent } from "@syncfusion/ej2-react-buttons";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
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
      { to: "/portfolioEntries", text: "Projects" },
      { to: "/portfolioCores", text: "Cores" },
    ],
  },
  {
    label: "Library",
    links: [
      { to: "/media", text: "Media" },
      { to: "/releases", text: "Publishing", ready: true },
    ],
  },
];

export function AdminLayout() {
  const navigate = useNavigate();
  const logout = useLogoutMutation();

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
        <Outlet />
      </main>
    </div>
  );
}
