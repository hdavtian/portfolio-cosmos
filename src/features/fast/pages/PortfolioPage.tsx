import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { usePortfolioCoresQuery } from "../../../lib/query/contentQueries";
import { flattenPortfolioCores } from "../lib/portfolioTransform";
import { useFavorites } from "../hooks/useFavorites";
import { usePersistentState } from "../hooks/usePersistentState";
import { EmptyState } from "../components/EmptyState";
import { PortfolioCompareTray } from "../components/PortfolioCompareTray";
import { useCompareSelection } from "../hooks/useCompareSelection";
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
  const [subcategoryFilter, setSubcategoryFilter] = usePersistentState<string>(
    "fast-experience:portfolio:subcategory",
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
  const [favoritesOnly, setFavoritesOnly] = usePersistentState<boolean>(
    "fast-experience:portfolio:favorites-only",
    false,
    (value): value is boolean => typeof value === "boolean",
  );
  const [quickViewItem, setQuickViewItem] = useState<PortfolioItem | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const quickViewPanelRef = useRef<HTMLDivElement | null>(null);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);
  const [compareCapNotice, setCompareCapNotice] = useState<string>("");

  const portfolioQuery = usePortfolioCoresQuery();
  const { favoritesSet, toggleFavorite } = useFavorites();
  const {
    compareIds,
    compareSet,
    toggleCompare,
    clearCompare,
    canAddMore,
    compareLimit,
  } = useCompareSelection();

  const allItems = useMemo(
    () => flattenPortfolioCores(portfolioQuery.data?.payload ?? []),
    [portfolioQuery.data?.payload],
  );

  const categoryOptions = useMemo(
    () => ["all", ...new Set(allItems.map((item) => item.category))],
    [allItems],
  );
  const subcategoryOptions = useMemo(() => {
    const sourceItems =
      categoryFilter === "all"
        ? allItems
        : allItems.filter((item) => item.category === categoryFilter);
    return ["all", ...new Set(sourceItems.map((item) => item.subcategory))];
  }, [allItems, categoryFilter]);

  const filteredItems = useMemo(() => {
    const lowered = searchTerm.trim().toLowerCase();

    return [...allItems]
      .filter((item) => {
        const matchesCategory =
          categoryFilter === "all" ? true : item.category === categoryFilter;
        const matchesSubcategory =
          subcategoryFilter === "all" ? true : item.subcategory === subcategoryFilter;
        const matchesFavorites = favoritesOnly ? favoritesSet.has(item.id) : true;
        const matchesSearch =
          lowered.length === 0
            ? true
            : `${item.title} ${item.description} ${item.technologies.join(" ")}`
                .toLowerCase()
                .includes(lowered);

        return (
          matchesCategory &&
          matchesSubcategory &&
          matchesFavorites &&
          matchesSearch
        );
      })
      .sort((a, b) => {
        if (sortMode === "title") return a.title.localeCompare(b.title);
        if (sortMode === "oldest") return (a.year ?? 0) - (b.year ?? 0);
        return (b.year ?? 0) - (a.year ?? 0);
      });
  }, [
    allItems,
    categoryFilter,
    subcategoryFilter,
    favoritesOnly,
    favoritesSet,
    searchTerm,
    sortMode,
  ]);

  const compareItems = useMemo(
    () =>
      compareIds
        .map((id) => allItems.find((item) => item.id === id))
        .filter((item): item is PortfolioItem => Boolean(item)),
    [allItems, compareIds],
  );

  useEffect(() => {
    if (subcategoryOptions.includes(subcategoryFilter)) return;
    setSubcategoryFilter("all");
  }, [subcategoryFilter, subcategoryOptions, setSubcategoryFilter]);

  useEffect(() => {
    if (filteredItems.length > 0) return;
    if (allItems.length === 0) return;

    // If persisted filters become overly restrictive after navigation history restores
    // this page, reset to a safe baseline so content remains visible.
    const hasNonDefaultFilters =
      searchTerm.trim().length > 0 ||
      categoryFilter !== "all" ||
      subcategoryFilter !== "all" ||
      favoritesOnly;

    if (!hasNonDefaultFilters) return;

    setSearchTerm("");
    setCategoryFilter("all");
    setSubcategoryFilter("all");
    setFavoritesOnly(false);
    setSortMode("newest");
  }, [
    filteredItems.length,
    allItems.length,
    searchTerm,
    categoryFilter,
    subcategoryFilter,
    favoritesOnly,
    setSearchTerm,
    setCategoryFilter,
    setSubcategoryFilter,
    setFavoritesOnly,
    setSortMode,
  ]);

  const updateViewMode = (nextMode: ViewMode) => {
    setViewMode(nextMode);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("view", nextMode);
    setSearchParams(nextParams);
  };

  useEffect(() => {
    if (!quickViewItem) return;
    lastFocusedElementRef.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setQuickViewItem(null);
        return;
      }

      if (event.key !== "Tab" || !quickViewPanelRef.current) return;

      const focusable = quickViewPanelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeydown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeydown);
      lastFocusedElementRef.current?.focus();
    };
  }, [quickViewItem]);

  useEffect(() => {
    if (!compareCapNotice) return;
    const timer = window.setTimeout(() => setCompareCapNotice(""), 2500);
    return () => window.clearTimeout(timer);
  }, [compareCapNotice]);

  if (portfolioQuery.isPending || (portfolioQuery.isFetching && !portfolioQuery.data)) {
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
          Subcategory
          <select
            value={subcategoryFilter}
            onChange={(event) => setSubcategoryFilter(event.target.value)}
          >
            {subcategoryOptions.map((subcategory) => (
              <option key={subcategory} value={subcategory}>
                {subcategory}
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

        <label className="portfolio-toolbar__checkbox">
          Favorites Only
          <input
            type="checkbox"
            checked={favoritesOnly}
            onChange={(event) => setFavoritesOnly(event.target.checked)}
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
            setSubcategoryFilter("all");
            setFavoritesOnly(false);
            setSortMode("newest");
          }}
        />
      ) : null}

      <p className="portfolio-results__count" aria-live="polite">
        Showing {filteredItems.length} of {allItems.length} projects
      </p>

      <div
        className={`portfolio-results ${viewMode === "card" ? "portfolio-results--card" : ""}`}
        style={{ ["--portfolio-scale" as string]: String(cardScale) }}
      >
        {filteredItems.map((item) => (
          <article key={item.id} className="portfolio-card">
            {item.image ? (
              <Link
                to={`/fast/portfolio/${item.id}`}
                className="portfolio-card__image-link"
                aria-label={`Open details for ${item.title}`}
              >
                <img
                  src={item.image}
                  alt={item.title}
                  className="portfolio-card__image"
                  loading="lazy"
                />
              </Link>
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
              <button
                type="button"
                aria-pressed={compareSet.has(item.id)}
                disabled={!compareSet.has(item.id) && !canAddMore}
                onClick={() => {
                  if (!compareSet.has(item.id) && !canAddMore) {
                    setCompareCapNotice(
                      `Compare limit reached. Remove an item before adding another.`,
                    );
                    return;
                  }
                  setCompareCapNotice("");
                  toggleCompare(item.id);
                }}
              >
                {compareSet.has(item.id) ? "Remove Compare" : "Compare"}
              </button>
            </div>
          </article>
        ))}
      </div>

      {compareCapNotice ? (
        <p className="portfolio-compare-cap-notice" role="status" aria-live="polite">
          {compareCapNotice}
        </p>
      ) : null}

      <PortfolioCompareTray
        items={compareItems}
        maxItems={compareLimit}
        onClear={clearCompare}
        onRemove={toggleCompare}
        statusMessage={compareCapNotice}
      />

      {quickViewItem ? (
        <div className="portfolio-quick-view" role="dialog" aria-modal="true" aria-labelledby="quick-view-title">
          <div ref={quickViewPanelRef} className="portfolio-quick-view__card">
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
