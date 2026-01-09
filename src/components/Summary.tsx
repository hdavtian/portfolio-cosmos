import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import resumeData from "../data/resume.json";
import "./Summary.scss";

gsap.registerPlugin(ScrollTrigger);

interface SummaryProps {
  className?: string;
}

const Summary = ({ className = "" }: SummaryProps) => {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!className.includes("active")) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power2.out" } });

      tl.from(".summary__title", {
        opacity: 0,
        y: 20,
        duration: 0.6,
        delay: 0.2,
      }).from(
        ".summary__text",
        {
          opacity: 0,
          y: 15,
          duration: 0.8,
        },
        "-=0.3"
      );
    }, sectionRef);

    return () => ctx.revert();
  }, [className]);

  return (
    <section ref={sectionRef} className={`summary section ${className}`}>
      <div className="summary__background"></div>
      <div className="summary__overlay"></div>
      <div className="summary__content">
        <h2 className="summary__title">Summary</h2>
        <p className="summary__text">{resumeData.summary}</p>
      </div>
    </section>
  );
};

export default Summary;
