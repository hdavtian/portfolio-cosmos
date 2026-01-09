import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import resumeData from "../data/resume.json";
import "./Skills.scss";

gsap.registerPlugin(ScrollTrigger);

interface SkillsProps {
  className?: string;
}

const Skills = ({ className = "" }: SkillsProps) => {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!className.includes("active")) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power2.out" } });

      tl.from(".skills__title", {
        opacity: 0,
        y: 20,
        duration: 0.6,
        delay: 0.2,
      }).from(
        ".skills__category",
        {
          opacity: 0,
          y: 15,
          duration: 0.5,
          stagger: 0.1,
        },
        "-=0.3"
      );
    }, sectionRef);

    return () => ctx.revert();
  }, [className]);

  return (
    <section ref={sectionRef} className={`skills section ${className}`}>
      <div className="skills__background"></div>
      <div className="skills__overlay"></div>
      <div className="skills__content">
        <h2 className="skills__title">Technical Expertise</h2>
        <div className="skills__grid">
          {Object.entries(resumeData.skills).map(([category, items]) => (
            <div key={category} className="skills__category">
              <h3 className="skills__category-name">{category}</h3>
              <div className="skills__items">
                {items.map((skill) => (
                  <span key={skill} className="skills__item">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Skills;
