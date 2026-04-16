import { useResumeQuery } from "../../../lib/query/contentQueries";
import { EmptyState } from "../components/EmptyState";

export function ResumePage() {
  const resumeQuery = useResumeQuery();

  if (resumeQuery.isPending) {
    return <div className="fast-panel">Loading resume...</div>;
  }

  if (resumeQuery.isError) {
    return (
      <EmptyState
        title="Resume unavailable"
        message="Please refresh to retry loading resume data."
      />
    );
  }

  const resume = resumeQuery.data.payload;
  const { personal, summary, experience, education, certifications } = resume;

  return (
    <article className="resume-page">
      <header className="resume-page__hero">
        <h1 className="resume-page__name">{personal.name}</h1>
        <p className="resume-page__role">{personal.title}</p>
        <p className="resume-page__contact">
          <a href={`mailto:${personal.email}`}>{personal.email}</a>
          <span aria-hidden="true"> · </span>
          <span>{personal.location}</span>
        </p>
      </header>

      <section className="resume-page__section" aria-labelledby="resume-summary">
        <h2 id="resume-summary" className="resume-page__section-title">
          Summary
        </h2>
        <p className="resume-page__body">{summary}</p>
      </section>

      <section className="resume-page__section" aria-labelledby="resume-experience">
        <h2 id="resume-experience" className="resume-page__section-title">
          Experience
        </h2>
        {experience.map((job) => (
          <section key={job.id} className="resume-page__job">
            <header className="resume-page__job-header">
              <h3 className="resume-page__job-title">
                {job.navLabel || job.company}
              </h3>
              <p className="resume-page__job-meta">
                {[job.location, formatDateRange(job.startDate, job.endDate)]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </header>
            {job.positions.map((position, index) => (
              <div
                key={`${job.id}-${index}`}
                className="resume-page__position"
              >
                <h4 className="resume-page__position-title">
                  {position.title}
                </h4>
                {formatDateRange(position.startDate, position.endDate) ? (
                  <p className="resume-page__position-meta">
                    {formatDateRange(position.startDate, position.endDate)}
                  </p>
                ) : null}
                {position.responsibilities.length > 0 ? (
                  <ul className="resume-page__bullets">
                    {position.responsibilities.map((responsibility) => (
                      <li key={responsibility}>{responsibility}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </section>
        ))}
      </section>

      {education ? (
        <section
          className="resume-page__section"
          aria-labelledby="resume-education"
        >
          <h2 id="resume-education" className="resume-page__section-title">
            Education
          </h2>
          <h3 className="resume-page__job-title">{education.institution}</h3>
          <p className="resume-page__body">
            {[education.degree, education.major].filter(Boolean).join(", ")}
          </p>
          {education.graduationDate ? (
            <p className="resume-page__job-meta">{education.graduationDate}</p>
          ) : null}
        </section>
      ) : null}

      {certifications && certifications.length > 0 ? (
        <section
          className="resume-page__section"
          aria-labelledby="resume-certifications"
        >
          <h2
            id="resume-certifications"
            className="resume-page__section-title"
          >
            Certifications
          </h2>
          <ul className="resume-page__cert-list">
            {certifications.map((cert) => (
              <li key={`${cert.name}-${cert.date}`}>
                <span className="resume-page__cert-name">{cert.name}</span>
                {cert.date ? (
                  <span className="resume-page__cert-date">{cert.date}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}

function formatDateRange(start?: string, end?: string): string {
  if (!start && !end) return "";
  if (start && end) return `${start} – ${end}`;
  return start || end || "";
}
