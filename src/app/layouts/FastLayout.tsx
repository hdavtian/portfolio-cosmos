import { NavLink, Outlet } from "react-router-dom";
import { FastTopNav } from "../../features/fast/components/FastTopNav";

const prefetchCinematic = () => {
  void import("../../App");
};

export function FastLayout() {
  return (
    <div className="fast-layout">
      <a href="#fast-main-content" className="skip-link">
        Skip to main content
      </a>
      <FastTopNav />
      <div className="fast-layout__body">
        <aside className="fast-layout__sidebar" aria-hidden="true" />
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
