import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ProjectGallery } from "../components/ProjectGallery";
import { useBackdropTint } from "../lib/backdropTint";
import { readIndexReturnState } from "../lib/indexReturnState";
import { useShowcaseProjects } from "../lib/useShowcaseProjects";
import { markProjectVisited } from "../lib/visitedProjects";
import { trackEvent } from "../../../lib/analytics";

/** One project: story and spec sheet on the left, large images on the right. */
export function ShowcaseProjectPage() {
  const { portfolioId } = useParams();
  const navigate = useNavigate();
  const { projects, isLoading } = useShowcaseProjects();
  const { setTint } = useBackdropTint();

  const indexHref = `/${readIndexReturnState()?.search ?? ""}`;
  const index = projects.findIndex((project) => project.id === portfolioId);
  const project = index >= 0 ? projects[index] : null;
  const previous = index > 0 ? projects[index - 1] : null;
  const next = index >= 0 && index < projects.length - 1 ? projects[index + 1] : null;

  useEffect(() => {
    setTint(project?.coreColor ?? null);
  }, [project, setTint]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [portfolioId]);

  useEffect(() => {
    if (project) markProjectVisited(project.id);
  }, [project]);

  // The SDK's $pageview already records the URL; this carries the project's
  // identity alongside it, so reports don't have to parse paths.
  const detailId = project?.id ?? null;
  useEffect(() => {
    if (!project || !detailId) return;
    trackEvent("showcase_project_detail_view", {
      portfolio_id: project.id,
      title: project.title,
      category: project.category,
      year: project.year,
      media_count: project.detailMedia.filter((item) => item.image).length,
    });
    // Keyed on the id so a re-render with the same project does not re-fire.
  }, [detailId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape leaves the project, unless the full-size viewer is open — that
  // takes Escape first, to close itself.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelector(".showcase-viewer")) return;
      navigate(indexHref);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [indexHref, navigate]);

  if (!project) {
    return (
      <div className="showcase-project showcase-project--missing">
        <p className="showcase-label">{isLoading ? "Loading project…" : "That project could not be found."}</p>
        <Link to="/" className="showcase-back">
          <span className="showcase-back__arrow" aria-hidden="true" />
          Back
        </Link>
      </div>
    );
  }

  const media = project.detailMedia.filter((item) => item.image);

  return (
    <article className="showcase-project">
      <header className="showcase-project__story">
        <Link to={indexHref} className="showcase-back showcase-project__back">
          <span className="showcase-back__arrow" aria-hidden="true" />
          Back
        </Link>
        <h1 className="showcase-project__title">{project.title}</h1>
        {project.description ? <p className="showcase-project__lead">{project.description}</p> : null}

        <dl className="showcase-spec">
          <div>
            <dt>Core</dt>
            <dd>{project.category}</dd>
          </div>
          {project.isClientVariation ? (
            <div>
              <dt>Part of</dt>
              <dd>{project.subcategory}</dd>
            </div>
          ) : null}
          {project.year ? (
            <div>
              <dt>Year</dt>
              <dd>{project.year}</dd>
            </div>
          ) : null}
          {project.technologies.length ? (
            <div>
              <dt>Technologies</dt>
              <dd>
                <ul className="showcase-spec__list">
                  {project.technologies.map((tech) => (
                    <li key={tech}>
                      {/* Same action as the homepage chip, so it carries the same
                          event with a different source rather than its own name. */}
                      <Link
                        to={`/?tech=${encodeURIComponent(tech)}`}
                        onClick={() =>
                          trackEvent("showcase_filter_chip_toggle", {
                            chip_type: "tech",
                            value: tech,
                            action: "check",
                            source: "project_detail",
                            portfolio_id: project.id,
                          })
                        }
                      >
                        {tech}
                      </Link>
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ) : null}
        </dl>
      </header>

      <div className="showcase-project__media">
        {media.length === 0 ? <p className="showcase-label">No images for this project yet.</p> : null}
        {media.length > 0 ? (
          <ProjectGallery
            key={project.id}
            projectTitle={project.title}
            portfolioId={project.id}
            tint={project.coreColor}
            shots={media.map((item, mediaIndex) => ({
              key: item.id ?? `${project.id}-${mediaIndex}`,
              src: item.image!,
              title: item.title && item.title !== project.title ? item.title : `${project.title}, view ${mediaIndex + 1}`,
            }))}
          />
        ) : null}

        <nav className="showcase-project__pager" aria-label="More projects">
          {previous ? (
            <Link to={`/portfolio/${previous.id}`} className="showcase-pager">
              <span className="showcase-label">Previous</span>
              <span className="showcase-pager__title">{previous.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link to={`/portfolio/${next.id}`} className="showcase-pager showcase-pager--next">
              <span className="showcase-label">Next</span>
              <span className="showcase-pager__title">{next.title}</span>
            </Link>
          ) : null}
        </nav>
      </div>
    </article>
  );
}
