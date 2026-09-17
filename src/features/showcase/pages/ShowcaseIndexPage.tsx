import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { HoloImage } from "../components/HoloImage";
import { TechConstellation } from "../components/TechConstellation";
import { useBackdropTint } from "../lib/backdropTint";
import { clearIndexReturnState, readIndexReturnState, saveIndexReturnState } from "../lib/indexReturnState";
import { useRestState } from "../lib/useRestState";
import { useShowcaseProjects, type ShowcaseProject } from "../lib/useShowcaseProjects";

// Matches the collapse animation in showcase.css.
const CLOSE_MS = 240;
/** Still this long and the list steps back into a watermark over the scene. */
const REST_AFTER_MS = 9000;
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
  const { setTint, setHighlights, setFocusProject, sceneShowing } = useBackdropTint();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  // Returning from a project page with the same view: restore it instantly.
  const [returning] = useState(() => {
    const saved = readIndexReturnState();
    return saved && saved.search === window.location.search ? saved : null;
  });
  // The preview restored on return shows already open; cleared by the next open/close.
  const [restoredOpenId, setRestoredOpenId] = useState(() =>
    returning ? new URLSearchParams(returning.search).get("open") : null,
  );
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
  const restState = useRestState(REST_AFTER_MS);

  // While resting, every other sweep fills the watermark with a project's
  // screenshot, swapped in while the names are at their faintest.
  const [watermarkImage, setWatermarkImage] = useState<string | null>(null);
  const watermarkImages = useMemo(
    () => visible.map((project) => project.image).filter((image): image is string => Boolean(image)),
    [visible],
  );
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const list = listRef.current;
    if (restState !== "resting" || !list || watermarkImages.length === 0) return;
    let cycle = 0;
    let cancelled = false;
    const onIteration = (event: AnimationEvent) => {
      if (event.animationName !== "showcase-watermark-sweep" && event.animationName !== "showcase-watermark-image") return;
      // One sweep per cycle reaches every title; react to the first title only.
      if (event.target !== list.querySelector(".showcase-list__title")) return;
      cycle += 1;
      if (cycle % 2 === 0) {
        setWatermarkImage(null);
        return;
      }
      const next = watermarkImages[Math.floor(Math.random() * watermarkImages.length)];
      const loader = new Image();
      loader.onload = () => {
        if (!cancelled) setWatermarkImage(next);
      };
      loader.src = next;
    };
    list.addEventListener("animationiteration", onIteration);
    return () => {
      cancelled = true;
      list.removeEventListener("animationiteration", onIteration);
    };
  }, [restState, watermarkImages]);
  const shownWatermark = restState === "resting" ? watermarkImage : null;
  const opened = visible.find((project) => project.id === openId) ?? null;
  const filterCore = cores.find((core) => core.name === coreFilter);

  useEffect(() => {
    setTint(hovered?.coreColor ?? opened?.coreColor ?? filterCore?.color ?? null);
  }, [hovered, opened, filterCore, setTint]);

  // The open project's technologies light up in the 3D Skills Lattice.
  const openedTech = opened?.technologies;
  useEffect(() => {
    setHighlights(openedTech ?? []);
  }, [openedTech, setHighlights]);
  useEffect(() => () => setHighlights([]), [setHighlights]);
  const openedId = opened?.id ?? null;
  useEffect(() => {
    setFocusProject(openedId);
  }, [openedId, setFocusProject]);
  useEffect(() => () => setFocusProject(null), [setFocusProject]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  // Put the page back where it was once the list has rendered.
  const restored = useRef(false);
  useLayoutEffect(() => {
    if (!returning || restored.current || projects.length === 0) return;
    restored.current = true;
    window.scrollTo({ top: returning.scrollY, behavior: "instant" as ScrollBehavior });
    clearIndexReturnState();
  }, [returning, projects.length]);

  // Bring a newly opened preview fully into view once it has expanded (not the
  // one restored on return, which is already where the visitor left it).
  useEffect(() => {
    if (!openId || openId === restoredOpenId) return;
    const timer = window.setTimeout(() => {
      itemRefs.current.get(openId)?.scrollIntoView({
        block: "nearest",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
    }, 420);
    return () => window.clearTimeout(timer);
  }, [openId, restoredOpenId]);

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
    setRestoredOpenId(null);
    if (openId === project.id) {
      beginClosing(project.id);
      updateParams({ open: null });
      return;
    }
    if (openId) beginClosing(openId);
    updateParams({ open: project.id });
  };

  const openProject = (project: ShowcaseProject) => {
    saveIndexReturnState({ search: location.search, scrollY: window.scrollY });
    navigate(`/portfolio/${project.id}`);
  };

  const closePreview = () => {
    if (!openId) return;
    setRestoredOpenId(null);
    beginClosing(openId);
    updateParams({ open: null });
  };

  return (
    <div
      className={`showcase-index${hovered ? " showcase-index--has-hover" : ""}${opened ? " showcase-index--has-open" : ""} is-${restState}${shownWatermark ? " has-watermark-image" : ""}`}
      style={shownWatermark ? ({ "--watermark-image": `url("${shownWatermark}")` } as React.CSSProperties) : undefined}
    >
      {/* Where the 3D scenes don't run (phones, reduced motion) the D3 constellation stands in. */}
      {sceneShowing ? null : (
        <TechConstellation highlights={opened?.technologies ?? []} visible={Boolean(opened)} />
      )}

      {/* Masthead: on the pills' line, top left. */}
      <header className="showcase-masthead">
        <h1 className="showcase-masthead__name">{personal?.name ?? "Harma Davtian"}</h1>
        <p className="showcase-masthead__role">
          {personal?.title ?? "Full Stack Engineer"}
          {personal?.location ? <span className="showcase-masthead__place">{personal.location}</span> : null}
        </p>
      </header>

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
        </div>

        {isLoading && projects.length === 0 ? <p className="showcase-label">Loading work…</p> : null}
        {!isLoading && visible.length === 0 ? (
          <p className="showcase-empty">Nothing matches those filters.</p>
        ) : null}

        <ul ref={listRef} className="showcase-list" onMouseLeave={() => setHoverId(null)}>
          {visible.map((project, projectIndex) => {
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
                  isOpen && project.id === restoredOpenId ? "is-restored" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{ "--item-index": projectIndex } as React.CSSProperties}
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
                    {isOpen ? (
                      <button
                        type="button"
                        className="showcase-preview__close"
                        onClick={closePreview}
                        aria-label={`Close ${project.title} preview`}
                        title="Close"
                      >
                        <span aria-hidden="true">✕</span>
                      </button>
                    ) : null}
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
                            className="showcase-more"
                            onClick={() => openProject(project)}
                            tabIndex={isOpen ? 0 : -1}
                          >
                            <span className="showcase-more__label">View project</span>
                            <span className="showcase-more__arrow" aria-hidden="true" />
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

    </div>
  );
}
