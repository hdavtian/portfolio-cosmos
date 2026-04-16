import { Link, useParams } from "react-router-dom";
import { usePortfolioCoresQuery } from "../../../lib/query/contentQueries";
import { flattenPortfolioCores } from "../lib/portfolioTransform";

export function PortfolioDetailPage() {
  const { portfolioId } = useParams();
  const portfolioQuery = usePortfolioCoresQuery();

  if (portfolioQuery.isPending) {
    return <div className="fast-panel">Loading project details...</div>;
  }

  if (portfolioQuery.isError) {
    return (
      <div className="fast-panel">
        <h2>Unable to load project details.</h2>
        <p>Confirm the API is available and try again.</p>
      </div>
    );
  }

  const items = flattenPortfolioCores(portfolioQuery.data?.payload ?? []);
  const item = items.find((candidate) => candidate.id === portfolioId);

  if (!item) {
    return (
      <div className="fast-panel">
        <h2>Project not found.</h2>
        <Link to="/fast/portfolio">Back to portfolio</Link>
      </div>
    );
  }

  return (
    <article className="portfolio-detail">
      <header className="portfolio-detail__header">
        <p className="portfolio-detail__meta">
          {item.category} · {item.subcategory}
        </p>
        <h1>{item.title}</h1>
        <p>{item.description}</p>
        <Link to="/fast/portfolio" className="portfolio-detail__back">
          Back to portfolio
        </Link>
      </header>

      <section className="portfolio-detail__media-grid">
        {(item.detailMedia.length > 0
          ? item.detailMedia
          : [
              {
                id: `${item.id}-cover`,
                image: item.image,
                title: item.title,
                description: item.description,
              },
            ]
        ).map((media) => (
          <figure key={media.id ?? `${item.id}-${media.image}`} className="portfolio-detail__media-item">
            {media.image ? <img src={media.image} alt={media.title ?? item.title} loading="lazy" /> : null}
            <figcaption>{media.title ?? item.title}</figcaption>
          </figure>
        ))}
      </section>
    </article>
  );
}
