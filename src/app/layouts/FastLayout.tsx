import { Link, NavLink, Outlet, useMatch } from "react-router-dom";
import { FastTopNav } from "../../features/fast/components/FastTopNav";
import { usePortfolioCoresQuery } from "../../lib/query/contentQueries";
import { flattenPortfolioCores } from "../../features/fast/lib/portfolioTransform";

const prefetchCinematic = () => {
  void import("../../App");
};

export function FastLayout() {
  const detailMatch = useMatch("/portfolio/:portfolioId");
  const activePortfolioId = detailMatch?.params.portfolioId;
  const isPortfolioDetailRoute = Boolean(activePortfolioId);
  const portfolioQuery = usePortfolioCoresQuery();
  const portfolioItems = flattenPortfolioCores(portfolioQuery.data?.payload ?? []);
  const activePortfolioTitle =
    portfolioItems.find((item) => item.id === activePortfolioId)?.title ??
    "Unknown";

  return (
    <div className="fast-layout">
      <a href="#fast-main-content" className="skip-link">
        Skip to main content
      </a>
      <FastTopNav />
      {isPortfolioDetailRoute ? (
        <nav className="fast-layout__crumbs" aria-label="Breadcrumb">
          <Link to="/portfolio">Portfolio</Link>
          <span aria-hidden="true">|</span>
          <span>{activePortfolioTitle}</span>
        </nav>
      ) : null}
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
