import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { HoloImage } from "../components/HoloImage";
import { TechConstellation } from "../components/TechConstellation";
import { useBackdropTint } from "../lib/backdropTint";
import { useShowcaseProjects, type ShowcaseProject } from "../lib/useShowcaseProjects";

// Matches the collapse animation in showcase.css.
const CLOSE_MS = 240;
const EXCERPT_LENGTH = 320;

const excerpt = (text: string) => {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= EXCERPT_LENGTH) return clean;
  const cut = clean.slice(0, EXCERPT_LENGTH);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
};

/**
 * The work index. Hovering a name gives a holographic teaser; clicking opens an
 * inline preview (step one) with a More button to the project page (step two).
 * Filters and the open preview live in the URL, so views can be shared and Back
 * works.
 */
export function ShowcaseIndexPage() {
  const { projects, cores, topTech, personal, isLoading } = useShowcaseProjects();
  const { setTint } = useBackdropTint();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const itemRefs = useRef(new Map<string, HTMLLIElement>());

  const coreFilter = searchParams.get("core");
  const techFilter = searchParams.get("tech");
  const openId = searchParams.get("open");

  const visible = useMemo(
    () =>
      projects.filter(
        (project) =>
          (!coreFilter || project.category === coreFilter) &&
          (!techFilter || project.technologies.includes(techFilter)),
      ),
    [projects, coreFilter, techFilter],
  );

  const hovered = visible.find((project) => project.id === hoverId) ?? null;
  const opened = visible.find((project) => project.id === openId) ?? null;
  const filterCore = cores.find((core) => core.name === coreFilter);

  useEffect(() => {
    setTint(hovered?.coreColor ?? opened?.coreColor ?? filterCore?.color ?? null);
  }, [hovered, opened, filterCore, setTint]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  // Bring a newly opened preview fully into view once it has expanded.
  useEffect(() => {
    if (!openId) return;
    const timer = window.setTimeout(() => {
      itemRefs.current.get(openId)?.scrollIntoView({
        block: "nearest",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
    }, 420);
    return () => window.clearTimeout(timer);
  }, [openId]);

  const updateParams = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(changes).forEach(([key, value]) => (value === null ? next.delete(key) : next.set(key, value)));
    setSearchParams(next, { replace: true });
  };

  const toggleFilter = (key: "core" | "tech", value: string) =>
    updateParams({ [key]: searchParams.get(key) === value ? null : value });

  const beginClosing = (id: string) => {
    window.clearTimeout(closeTimer.current);
    setClosingId(id);
    closeTimer.current = window.setTimeout(() => setClosingId(null), CLOSE_MS);
  };

  const openPreview = (event: MouseEvent<HTMLAnchorElement>, project: ShowcaseProject) => {
    // Modified clicks keep their browser meaning (new tab, new window).
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    if (openId === project.id) {
      beginClosing(project.id);
      updateParams({ open: null });
      return;
    }
    if (openId) beginClosing(openId);
    updateParams({ open: project.id });
  };

  const closePreview = () => {
    if (!openId) return;
    beginClosing(openId);
    updateParams({ open: null });
  };

  return (
    <div
      className={`showcase-index${hovered ? " showcase-index--has-hover" : ""}${opened ? " showcase-index--has-open" : ""}`}
    >
      <TechConstellation highlights={opened?.technologies ?? []} visible={Boolean(opened)} />

      <section className="showcase-index__work" aria-label="Projects">
        <div className="showcase-filters" role="group" aria-label="Filter projects">
          <div className="showcase-filters__row">
            <span className="showcase-label">Core</span>
            {cores.map((core) => (
              <button
                key={core.name}
                type="button"
                className="showcase-chip"
                aria-pressed={coreFilter === core.name}
                style={{ "--chip-color": core.color } as React.CSSProperties}
                onClick={() => toggleFilter("core", core.name)}
              >
                {core.name}
                <span className="showcase-chip__count">{core.count}</span>
              </button>
            ))}
          </div>
          <div className="showcase-filters__row">
            <span className="showcase-label">Tech</span>
            {topTech.map((tech) => (
              <button
                key={tech}
                type="button"
                className="showcase-chip"
                aria-pressed={techFilter === tech}
                onClick={() => toggleFilter("tech", tech)}
              >
                {tech}
              </button>
            ))}
            {coreFilter || techFilter ? (
              <button
                type="button"
                className="showcase-chip showcase-chip--clear"
                onClick={() => updateParams({ core: null, tech: null })}
              >
                Clear
              </button>
            ) : null}
          </div>
          <p className="showcase-label showcase-filters__count" aria-live="polite">
            {visible.length} of {projects.length} projects
          </p>
        </div>

        {isLoading && projects.length === 0 ? <p className="showcase-label">Loading work…</p> : null}
        {!isLoading && visible.length === 0 ? (
          <p className="showcase-empty">Nothing matches those filters.</p>
        ) : null}

        <ul className="showcase-list" onMouseLeave={() => setHoverId(null)}>
          {visible.map((project) => {
            const isOpen = project.id === openId;
            const isClosing = project.id === closingId && !isOpen;
            const panelId = `showcase-preview-${project.id}`;
            return (
              <li
                key={project.id}
                ref={(element) => {
                  if (element) itemRefs.current.set(project.id, element);
                  else itemRefs.current.delete(project.id);
                }}
                className={[
                  "showcase-list__item",
                  project.id === hoverId ? "is-hover" : "",
                  isOpen ? "is-open" : "",
                  isClosing ? "is-closing" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <Link
                  to={`/portfolio/${project.id}`}
                  className="showcase-list__link"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={(event) => openPreview(event, project)}
                  onMouseEnter={() => setHoverId(project.id)}
                  onFocus={() => setHoverId(project.id)}
                  onBlur={() => setHoverId(null)}
                >
                  <span className="showcase-list__title" data-text={project.title}>
                    {project.title}
                  </span>
                  {project.image && !isOpen && project.id === hoverId ? (
                    <HoloImage src={project.image} className="showcase-list__thumb" />
                  ) : null}
                  <span className="showcase-list__meta">
                    {project.category}
                    {project.isClientVariation ? ` / ${project.subcategory}` : ""}
                    {project.year ? ` / ${project.year}` : ""}
                  </span>
                </Link>

                {isOpen || isClosing ? (
                  <div id={panelId} className="showcase-preview" role="region" aria-label={`${project.title} preview`}>
                    <div className="showcase-preview__inner">
                      {project.image ? <HoloImage src={project.image} className="showcase-preview__image" /> : null}
                      <div className="showcase-preview__body">
                        <p className="showcase-label">
                          {project.category}
                          {project.isClientVariation ? ` / ${project.subcategory}` : ""}
                          {project.year ? ` / ${project.year}` : ""}
                        </p>
                        {project.description ? (
                          <p className="showcase-preview__lead">{excerpt(project.description)}</p>
                        ) : null}
                        {project.technologies.length ? (
                          <ul className="showcase-preview__tech">
                            {project.technologies.map((tech) => (
                              <li key={tech}>{tech}</li>
                            ))}
                          </ul>
                        ) : null}
                        <div className="showcase-preview__actions">
                          <button
                            type="button"
                            className="showcase-pill"
                            onClick={() => navigate(`/portfolio/${project.id}`)}
                            tabIndex={isOpen ? 0 : -1}
                          >
                            More
                          </button>
                          <button
                            type="button"
                            className="showcase-pill showcase-pill--ghost"
                            onClick={closePreview}
                            tabIndex={isOpen ? 0 : -1}
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <aside className="showcase-index__aside" aria-label="About">
        <p className="showcase-label">
          Portfolio of
          <br />
          <strong>{personal?.name ?? "Harma Davtian"}</strong>
        </p>
        <p className="showcase-label">
          <strong>{personal?.title ?? "Full Stack Engineer"}</strong>
          {personal?.location ? (
            <>
              <br />
              {personal.location}
            </>
          ) : null}
        </p>
      </aside>
    </div>
  );
}
