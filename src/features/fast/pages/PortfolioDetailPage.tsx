import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { usePortfolioCoresQuery } from "../../../lib/query/contentQueries";
import { trackEvent } from "../../../lib/analytics";
import { flattenPortfolioCores } from "../lib/portfolioTransform";
import { EmptyState } from "../components/EmptyState";
import { PortfolioMediaViewer } from "../components/PortfolioMediaViewer";
import { useVisited } from "../hooks/useVisited";

export function PortfolioDetailPage() {
  const { portfolioId } = useParams();
  const navigate = useNavigate();
  const portfolioQuery = usePortfolioCoresQuery();
  const { markVisited } = useVisited();

  useEffect(() => {
    if (portfolioId) {
      markVisited(portfolioId);
    }
  }, [portfolioId, markVisited]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [portfolioId]);

  if (portfolioQuery.isPending) {
    return <div className="fast-panel">Loading project details...</div>;
  }

  if (portfolioQuery.isError) {
    return (
      <EmptyState
        title="Project details unavailable"
        message="Please refresh to retry loading this project."
      />
    );
  }

  const items = flattenPortfolioCores(portfolioQuery.data?.payload ?? []);
  const itemIndex = items.findIndex((candidate) => candidate.id === portfolioId);
  const item = itemIndex >= 0 ? items[itemIndex] : null;
  const previousItem = itemIndex > 0 ? items[itemIndex - 1] : null;
  const nextItem = itemIndex >= 0 && itemIndex < items.length - 1 ? items[itemIndex + 1] : null;

  if (!item) {
    return (
      <EmptyState
        title="Project not found"
        message="This project may have been removed or filtered from the catalog."
        actionLabel="Back to portfolio"
        onAction={() => navigate("/portfolio")}
      />
    );
  }

  useEffect(() => {
    trackEvent("mainstream_portfolio_detail_view", {
      portfolio_id: item.id,
      title: item.title,
      category: item.category,
      subcategory: item.subcategory,
      media_count: item.detailMedia.length > 0 ? item.detailMedia.length : 1,
    });
  }, [
    item.id,
    item.title,
    item.category,
    item.subcategory,
    item.detailMedia.length,
  ]);

  return (
    <>
      <header className="portfolio-detail__header portfolio-detail__hero">
        <h1>{item.title}</h1>
        <p className="portfolio-detail__hero-description">{item.description}</p>
        <div className="portfolio-detail__facts">
          <span>{item.year ? `Year: ${item.year}` : "Year: N/A"}</span>
          <span>Media: {item.detailMedia.length > 0 ? item.detailMedia.length : 1}</span>
        </div>
        <div className="portfolio-detail__tech">
          {item.technologies.length > 0
            ? item.technologies.map((tech) => <span key={tech}>{tech}</span>)
            : <span>Technology details coming soon</span>}
        </div>
      </header>

      <nav className="portfolio-detail__adjacent portfolio-detail__adjacent--top" aria-label="Adjacent projects">
        {previousItem ? (
          <Link to={`/portfolio/${previousItem.id}`}>Previous: {previousItem.title}</Link>
        ) : (
          <span />
        )}
        {nextItem ? <Link to={`/portfolio/${nextItem.id}`}>Next: {nextItem.title}</Link> : null}
      </nav>

      <article className="portfolio-detail">
        <section className="portfolio-detail__media" aria-label="Project imagery">
          {(item.detailMedia.length > 0
            ? item.detailMedia
            : [
                {
                  id: `${item.id}-cover`,
                  image: item.image,
                  title: "",
                  description: "",
                },
              ]
          )
            .filter((media) => Boolean(media.image))
            .map((media, index) => (
              <PortfolioMediaViewer
                key={media.id ?? `${item.id}-${media.image}-${index}`}
                image={media.image as string}
                alt={media.title || item.title}
                title={media.title?.trim() || undefined}
                description={media.description?.trim() || undefined}
                onZoomButtonClick={(direction, zoomPercent) => {
                  trackEvent("mainstream_portfolio_zoom_click", {
                    portfolio_id: item.id,
                    media_index: index,
                    direction,
                    zoom_percent: zoomPercent,
                  });
                }}
              />
            ))}
        </section>
      </article>

      <nav className="portfolio-detail__adjacent" aria-label="Adjacent projects">
        {previousItem ? (
          <Link to={`/portfolio/${previousItem.id}`}>Previous: {previousItem.title}</Link>
        ) : (
          <span />
        )}
        {nextItem ? <Link to={`/portfolio/${nextItem.id}`}>Next: {nextItem.title}</Link> : null}
      </nav>
    </>
  );
}
