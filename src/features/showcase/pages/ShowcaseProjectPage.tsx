import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { useBackdropTint } from "../lib/backdropTint";
import { readIndexReturnState } from "../lib/indexReturnState";
import { useShowcaseProjects } from "../lib/useShowcaseProjects";
import { markProjectVisited } from "../lib/visitedProjects";

/** One project: story and spec sheet on the left, large images on the right. */
export function ShowcaseProjectPage() {
  const { portfolioId } = useParams();
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
                      <Link to={`/?tech=${encodeURIComponent(tech)}`}>{tech}</Link>
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
        {media.map((item, mediaIndex) => (
          <figure key={item.id ?? `${project.id}-${mediaIndex}`} className="showcase-shot">
            <img
              src={item.image}
              alt={item.title ?? project.title}
              loading={mediaIndex === 0 ? "eager" : "lazy"}
              decoding="async"
            />
            {item.title && item.title !== project.title ? (
              <figcaption className="showcase-label">{item.title}</figcaption>
            ) : null}
          </figure>
        ))}

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
