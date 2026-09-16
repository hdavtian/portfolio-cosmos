import { ButtonComponent } from "@syncfusion/ej2-react-buttons";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useLogoutMutation } from "../lib/session";

// Grouped so the sidebar mirrors how the content is actually organised.
const NAV_GROUPS: Array<{ label: string; links: Array<{ to: string; text: string }> }> = [
  {
    label: "Resume",
    links: [
      { to: "/experiences", text: "Experience" },
      { to: "/skills", text: "Skills" },
      { to: "/education", text: "Education" },
      { to: "/certifications", text: "Certifications" },
      { to: "/links", text: "Links" },
      { to: "/profile", text: "Profile" },
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
      { to: "/releases", text: "Publishing" },
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
            {group.links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) => `admin-sidebar__link ${isActive ? "is-active" : ""}`}
              >
                {link.text}
              </NavLink>
            ))}
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
