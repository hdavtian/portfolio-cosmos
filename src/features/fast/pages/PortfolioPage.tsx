import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { usePortfolioCoresQuery } from "../../../lib/query/contentQueries";
import { flattenPortfolioCores } from "../lib/portfolioTransform";
import { useFavorites } from "../hooks/useFavorites";
import { usePersistentState } from "../hooks/usePersistentState";
import { EmptyState } from "../components/EmptyState";
import type { PortfolioItem } from "../types";

type ViewMode = "grid" | "card";
type SortMode = "newest" | "oldest" | "title";

export function PortfolioPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get("view");
  const initialView: ViewMode = viewParam === "card" ? "card" : "grid";

  const [viewMode, setViewMode] = usePersistentState<ViewMode>(
    "fast-experience:portfolio:view",
    initialView,
    (value): value is ViewMode => value === "grid" || value === "card",
  );
  const [sortMode, setSortMode] = usePersistentState<SortMode>(
    "fast-experience:portfolio:sort",
    "newest",
    (value): value is SortMode =>
      value === "newest" || value === "oldest" || value === "title",
  );
  const [categoryFilter, setCategoryFilter] = usePersistentState<string>(
    "fast-experience:portfolio:category",
    "all",
    (value): value is string => typeof value === "string",
  );
  const [searchTerm, setSearchTerm] = usePersistentState<string>(
    "fast-experience:portfolio:search",
    "",
    (value): value is string => typeof value === "string",
  );
  const [cardScale, setCardScale] = usePersistentState<number>(
    "fast-experience:portfolio:scale",
    1,
    (value): value is number => typeof value === "number" && value >= 0.75 && value <= 1.35,
  );
  const [quickViewItem, setQuickViewItem] = useState<PortfolioItem | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const portfolioQuery = usePortfolioCoresQuery();
  const { favoritesSet, toggleFavorite } = useFavorites();

  const allItems = useMemo(
    () => flattenPortfolioCores(portfolioQuery.data?.payload ?? []),
    [portfolioQuery.data?.payload],
  );

  const categoryOptions = useMemo(
    () => ["all", ...new Set(allItems.map((item) => item.category))],
    [allItems],
  );

  const filteredItems = useMemo(() => {
    const lowered = searchTerm.trim().toLowerCase();

    return [...allItems]
      .filter((item) => {
        const matchesCategory =
          categoryFilter === "all" ? true : item.category === categoryFilter;
        const matchesSearch =
          lowered.length === 0
            ? true
            : `${item.title} ${item.description} ${item.technologies.join(" ")}`
                .toLowerCase()
                .includes(lowered);

        return matchesCategory && matchesSearch;
      })
      .sort((a, b) => {
        if (sortMode === "title") return a.title.localeCompare(b.title);
        if (sortMode === "oldest") return (a.year ?? 0) - (b.year ?? 0);
        return (b.year ?? 0) - (a.year ?? 0);
      });
  }, [allItems, categoryFilter, searchTerm, sortMode]);

  const updateViewMode = (nextMode: ViewMode) => {
    setViewMode(nextMode);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("view", nextMode);
    setSearchParams(nextParams);
  };

  useEffect(() => {
    if (!quickViewItem) return;
    closeButtonRef.current?.focus();

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setQuickViewItem(null);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onEscape);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onEscape);
    };
  }, [quickViewItem]);

  if (portfolioQuery.isPending) {
    return <div className="fast-panel">Loading portfolio content...</div>;
  }

  if (portfolioQuery.isError) {
    return <EmptyState title="Portfolio unavailable" message="Please refresh to retry loading portfolio data." />;
  }

  return (
    <section className="portfolio-page">
      <header className="portfolio-page__header">
        <h1 className="portfolio-page__title">Portfolio</h1>
        <p className="portfolio-page__lead">
          Filter by category, adjust card size, favorite items, and open quick previews.
        </p>
      </header>

      <div className="portfolio-toolbar">
        <label>
          Search
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search projects or technologies"
          />
        </label>

        <label>
          Category
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
          >
            {categoryOptions.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>

        <label>
          Sort
          <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="title">Title</option>
          </select>
        </label>

        <label>
          Card Size
          <input
            type="range"
            min="0.75"
            max="1.35"
            step="0.05"
            value={cardScale}
            onChange={(event) => setCardScale(Number(event.target.value))}
          />
        </label>

        <div className="portfolio-toolbar__view-toggle" role="group" aria-label="View mode">
          <button
            type="button"
            onClick={() => updateViewMode("grid")}
            className={viewMode === "grid" ? "is-active" : ""}
            aria-pressed={viewMode === "grid"}
          >
            Grid View
          </button>
          <button
            type="button"
            onClick={() => updateViewMode("card")}
            className={viewMode === "card" ? "is-active" : ""}
            aria-pressed={viewMode === "card"}
          >
            Card View
          </button>
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <EmptyState
          title="No projects match these filters"
          message="Try a different category, clear search text, or switch sort mode."
          actionLabel="Clear Filters"
          onAction={() => {
            setSearchTerm("");
            setCategoryFilter("all");
            setSortMode("newest");
          }}
        />
      ) : null}

      <div
        className={`portfolio-results ${viewMode === "card" ? "portfolio-results--card" : ""}`}
        style={{ ["--portfolio-scale" as string]: String(cardScale) }}
      >
        {filteredItems.map((item) => (
          <article key={item.id} className="portfolio-card">
            {item.image ? (
              <img src={item.image} alt={item.title} className="portfolio-card__image" loading="lazy" />
            ) : null}
            <div className="portfolio-card__content">
              <p className="portfolio-card__meta">
                {item.category} · {item.subcategory}
              </p>
              <h3 className="portfolio-card__title">{item.title}</h3>
              <p className="portfolio-card__description">{item.description}</p>
              <div className="portfolio-card__tags">
                {item.technologies.slice(0, 5).map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            </div>
            <div className="portfolio-card__actions">
              <button type="button" onClick={() => setQuickViewItem(item)}>
                Quick View
              </button>
              <Link to={`/fast/portfolio/${item.id}`}>Detail View</Link>
              <button
                type="button"
                aria-pressed={favoritesSet.has(item.id)}
                onClick={() => toggleFavorite(item.id)}
              >
                {favoritesSet.has(item.id) ? "Unfavorite" : "Favorite"}
              </button>
            </div>
          </article>
        ))}
      </div>

      {quickViewItem ? (
        <div className="portfolio-quick-view" role="dialog" aria-modal="true" aria-labelledby="quick-view-title">
          <div className="portfolio-quick-view__card">
            <h2 id="quick-view-title">{quickViewItem.title}</h2>
            <p>{quickViewItem.description}</p>
            <p>
              <strong>Category:</strong> {quickViewItem.category}
            </p>
            <p>
              <strong>Technologies:</strong> {quickViewItem.technologies.join(", ") || "N/A"}
            </p>
            <button ref={closeButtonRef} type="button" onClick={() => setQuickViewItem(null)}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
