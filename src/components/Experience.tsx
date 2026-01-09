import { useEffect, useRef } from "react";
import gsap from "gsap";
import resumeData from "../data/resume.json";
import "./Experience.scss";

interface ExperienceProps {
  className?: string;
  activeJobIndex: number;
}

const Experience = ({ className = "", activeJobIndex }: ExperienceProps) => {
  const experienceRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!className.includes("active")) return;

    const jobEl = `.experience__job[data-job-index="${activeJobIndex}"]`;

    const ctx = gsap.context(() => {
      // Animate company name
      gsap.fromTo(
        `${jobEl} .experience__company`,
        { opacity: 0, scale: 1.3 },
        {
          opacity: 1,
          scale: 1,
          duration: 0.6,
        }
      );

      // Animate meta info
      gsap.fromTo(
        `${jobEl} .experience__meta`,
        { opacity: 0, y: 20 },
        {
          opacity: 1,
          y: 0,
          duration: 0.5,
          delay: 0.2,
        }
      );

      // Animate position blocks
      gsap.fromTo(
        `${jobEl} .experience__position`,
        { opacity: 0, y: 15 },
        {
          opacity: 1,
          y: 0,
          duration: 0.5,
          delay: 0.4,
        }
      );

      // Animate responsibilities
      gsap.fromTo(
        `${jobEl} .experience__responsibility`,
        { opacity: 0, x: -20 },
        {
          opacity: 1,
          x: 0,
          duration: 0.4,
          stagger: 0.05,
          delay: 0.6,
        }
      );
    }, experienceRef);

    return () => ctx.revert();
  }, [className, activeJobIndex]);

  return (
    <section ref={experienceRef} className={`experience ${className}`}>
      {resumeData.experience.map((job, jobIndex) => (
        <div
          key={jobIndex}
          className={`experience__job ${
            jobIndex === activeJobIndex ? "active" : ""
          }`}
          data-job-index={jobIndex}
        >
          <div className="experience__container">
            <h3 className="experience__company">{job.company}</h3>
            <div className="experience__meta">
              <span className="experience__location">{job.location}</span>
              <span className="experience__dates">
                {job.startDate} — {job.endDate}
              </span>
            </div>
            {job.positions.map((position, posIndex) => (
              <div key={posIndex} className="experience__position-block">
                <h4 className="experience__position">{position.title}</h4>
                <ul className="experience__responsibilities">
                  {position.responsibilities.map((resp, respIndex) => (
                    <li key={respIndex} className="experience__responsibility">
                      {resp}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
};

export default Experience;
