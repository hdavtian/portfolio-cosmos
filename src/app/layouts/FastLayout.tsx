import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  FastContextNav,
  type ContextNavItem,
} from "../../features/fast/components/FastContextNav";
import { FastTopNav } from "../../features/fast/components/FastTopNav";

const prefetchCinematic = () => {
  void import("../../App");
};

export function FastLayout() {
  const location = useLocation();
  const context = getContextNav(location.pathname);

  return (
    <div className="fast-layout">
      <a href="#fast-main-content" className="skip-link">
        Skip to main content
      </a>
      <FastTopNav />
      <div className="fast-layout__body">
        {context ? <FastContextNav title={context.title} items={context.items} /> : null}
        <main id="fast-main-content" className="fast-layout__content">
          <Outlet />
        </main>
      </div>
      <footer className="fast-footer">
        <p className="fast-footer__copy">
          harmadavtian.com | {new Date().getFullYear()}
        </p>
        <NavLink
          to="/cinematic"
          className="fast-footer__cinematic-link"
          onMouseEnter={prefetchCinematic}
          onFocus={prefetchCinematic}
        >
          Cinematic Experience →
        </NavLink>
      </footer>
    </div>
  );
}

function getContextNav(pathname: string): { title: string; items: ContextNavItem[] } | null {
  if (pathname.startsWith("/fast/portfolio")) {
    return {
      title: "Portfolio",
      items: [
        { to: "/fast/portfolio", label: "Browse", exact: true },
        { to: "/fast/portfolio?view=grid", label: "Grid View" },
        { to: "/fast/portfolio?view=card", label: "Card View" },
      ],
    };
  }

  if (pathname === "/fast/resume") {
    return {
      title: "Resume",
      items: [{ to: "/fast/resume", label: "Text Resume", exact: true }],
    };
  }

  return null;
}
