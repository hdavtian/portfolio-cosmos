import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { usePortfolioCoresQuery } from "../../../lib/query/contentQueries";
import { flattenPortfolioCores } from "../lib/portfolioTransform";
import { useFavorites } from "../hooks/useFavorites";
import { usePersistentState } from "../hooks/usePersistentState";
import { useVisited } from "../hooks/useVisited";
import { EmptyState } from "../components/EmptyState";

type SortMode = "newest" | "oldest" | "title";

export function PortfolioPage() {
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

  const portfolioQuery = usePortfolioCoresQuery();
  const { favoritesSet, toggleFavorite } = useFavorites();
  const { visitedSet, markVisited, clearVisited } = useVisited();

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

  const subcategoryDisabled = useMemo(() => {
    const meaningful = subcategoryOptions.filter(
      (option) => option !== "all" && option !== "General",
    );
    return meaningful.length === 0;
  }, [subcategoryOptions]);

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

  useEffect(() => {
    if (subcategoryDisabled && subcategoryFilter !== "all") {
      setSubcategoryFilter("all");
      return;
    }
    if (subcategoryOptions.includes(subcategoryFilter)) return;
    setSubcategoryFilter("all");
  }, [
    subcategoryFilter,
    subcategoryOptions,
    subcategoryDisabled,
    setSubcategoryFilter,
  ]);

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
          Filter by category, subcategory, and favorites for fast project discovery.
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

        <label
          className={subcategoryDisabled ? "portfolio-toolbar__label--disabled" : ""}
        >
          Subcategory
          <select
            value={subcategoryFilter}
            onChange={(event) => setSubcategoryFilter(event.target.value)}
            disabled={subcategoryDisabled}
            title={
              subcategoryDisabled
                ? "No subcategories available for this selection"
                : undefined
            }
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

      <div className="portfolio-results__summary">
        <p className="portfolio-results__count" aria-live="polite">
          Showing {filteredItems.length} of {allItems.length} projects
          {visitedSet.size > 0 ? ` · ${visitedSet.size} viewed` : ""}
        </p>
        {visitedSet.size > 0 ? (
          <button
            type="button"
            className="portfolio-results__clear-visited"
            onClick={clearVisited}
            title="Clear viewed history"
          >
            Clear viewed
          </button>
        ) : null}
      </div>

      <div
        className="portfolio-results"
        style={{ ["--portfolio-scale" as string]: String(cardScale) }}
      >
        {filteredItems.map((item) => {
          const isFavorited = favoritesSet.has(item.id);
          const isVisited = visitedSet.has(item.id);
          return (
            <article
              key={item.id}
              className={`portfolio-card ${isVisited ? "is-visited" : ""}`}
            >
              {isVisited ? (
                <span
                  className="portfolio-card__visited-badge"
                  aria-label="Already viewed"
                  title="You've viewed this project"
                >
                  <i className="fas fa-check" aria-hidden="true" /> Viewed
                </span>
              ) : null}
              <Link
                to={`/fast/portfolio/${item.id}`}
                className="portfolio-card__surface"
                aria-label={
                  isVisited
                    ? `Open details for ${item.title} (already viewed)`
                    : `Open details for ${item.title}`
                }
                onClick={() => markVisited(item.id)}
              >
                {item.image ? (
                  <img
                    src={item.image}
                    alt=""
                    className="portfolio-card__image"
                    loading="lazy"
                  />
                ) : (
                  <div className="portfolio-card__image portfolio-card__image--placeholder" aria-hidden="true" />
                )}

                <div className="portfolio-card__header">
                  <span className="portfolio-card__title-bar" title={item.title}>
                    {item.title}
                  </span>
                </div>

                <div className="portfolio-card__descriptions">
                  <p className="portfolio-card__meta">
                    {item.category} · {item.subcategory}
                    {item.year ? ` · ${item.year}` : ""}
                  </p>
                  <p className="portfolio-card__description">{item.description}</p>
                  {item.technologies.length > 0 ? (
                    <div className="portfolio-card__tags">
                      {item.technologies.slice(0, 5).map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                  ) : null}
                  <span className="portfolio-card__cta" aria-hidden="true">
                    View →
                  </span>
                </div>
              </Link>

              <button
                type="button"
                aria-pressed={isFavorited}
                className={`portfolio-card__favorite ${isFavorited ? "is-active" : ""}`}
                aria-label={isFavorited ? `Unfavorite ${item.title}` : `Favorite ${item.title}`}
                onClick={() => toggleFavorite(item.id)}
              >
                <i
                  className={isFavorited ? "fas fa-heart" : "far fa-heart"}
                  aria-hidden="true"
                />
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
