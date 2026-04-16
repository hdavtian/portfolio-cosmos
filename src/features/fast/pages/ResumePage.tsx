import { useResumeQuery } from "../../../lib/query/contentQueries";

export function ResumePage() {
  const resumeQuery = useResumeQuery();

  if (resumeQuery.isPending) {
    return <div className="fast-panel">Loading resume...</div>;
  }

  if (resumeQuery.isError) {
    return (
      <div className="fast-panel">
        <h2>Resume is currently unavailable.</h2>
        <p>Please verify the API is running and seeded.</p>
      </div>
    );
  }

  const resume = resumeQuery.data.payload;

  return (
    <section className="resume-page">
      <header className="resume-page__header">
        <h1>{resume.personal.name}</h1>
        <p>{resume.personal.title}</p>
        <p>
          {resume.personal.email} · {resume.personal.location}
        </p>
      </header>

      <article className="resume-page__summary">
        <h2>Summary</h2>
        <p>{resume.summary}</p>
      </article>

      <article className="resume-page__experience">
        <h2>Experience</h2>
        {resume.experience.map((job) => (
          <section key={job.id} className="resume-page__job">
            <h3>{job.navLabel || job.company}</h3>
            <p className="resume-page__job-meta">
              {job.location} · {job.startDate} - {job.endDate}
            </p>
            {job.positions.map((position, index) => (
              <div key={`${job.id}-${index}`} className="resume-page__position">
                <h4>{position.title}</h4>
                <p className="resume-page__position-meta">
                  {position.startDate ? `${position.startDate} - ${position.endDate}` : null}
                </p>
                <ul>
                  {position.responsibilities.map((responsibility) => (
                    <li key={responsibility}>{responsibility}</li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))}
      </article>
    </section>
  );
}
