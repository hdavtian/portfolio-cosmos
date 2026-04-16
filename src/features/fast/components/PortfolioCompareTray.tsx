import type { PortfolioItem } from "../types";

interface PortfolioCompareTrayProps {
  items: PortfolioItem[];
  onRemove: (id: string) => void;
  onClear: () => void;
  maxItems: number;
  statusMessage?: string;
}

export function PortfolioCompareTray({
  items,
  onRemove,
  onClear,
  maxItems,
  statusMessage,
}: PortfolioCompareTrayProps) {
  if (items.length === 0) return null;

  return (
    <aside className="portfolio-compare-tray" aria-label="Compare projects">
      <div className="portfolio-compare-tray__header">
        <h2>Compare Projects</h2>
        <button type="button" onClick={onClear}>
          Clear
        </button>
      </div>
      <p className="portfolio-compare-tray__hint">
        {items.length}/{maxItems} selected
      </p>
      {statusMessage ? (
        <p className="portfolio-compare-tray__status" role="status" aria-live="polite">
          {statusMessage}
        </p>
      ) : null}
      <div className="portfolio-compare-tray__grid">
        {items.map((item) => (
          <article key={item.id} className="portfolio-compare-tray__card">
            <h3>{item.title}</h3>
            <p>{item.category}</p>
            <p>{item.year ?? "N/A"}</p>
            <div className="portfolio-compare-tray__tags">
              {item.technologies.slice(0, 4).map((tech) => (
                <span key={tech}>{tech}</span>
              ))}
            </div>
            <button type="button" onClick={() => onRemove(item.id)}>
              Remove
            </button>
          </article>
        ))}
      </div>
    </aside>
  );
}
