import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import resumeData from "../data/resume.json";
import "./Hero.scss";

gsap.registerPlugin(ScrollTrigger);

interface HeroProps {
  className?: string;
}

const Hero = ({ className = "" }: HeroProps) => {
  const heroRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!className.includes("active")) return;

    const ctx = gsap.context(() => {
      // Initial entrance - fade in elements
      const tl = gsap.timeline({ defaults: { ease: "power2.out" } });

      tl.from(".hero__content", {
        opacity: 0,
        duration: 0.8,
        delay: 0.2,
      })
        .from(
          ".hero__name",
          {
            opacity: 0,
            duration: 0.6,
          },
          "-=0.4"
        )
        .from(
          ".hero__title",
          {
            opacity: 0,
            duration: 0.6,
          },
          "-=0.3"
        )
        .from(
          ".hero__contact-item",
          {
            opacity: 0,
            duration: 0.4,
            stagger: 0.1,
          },
          "-=0.3"
        );
    }, heroRef);

    return () => ctx.revert();
  }, [className]);

  return (
    <section ref={heroRef} className={`hero section ${className}`}>
      <div className="hero__background"></div>
      <div className="hero__overlay"></div>
      <div className="hero__content">
        <h1 className="hero__name">{resumeData.personal.name}</h1>
        <h2 className="hero__title">{resumeData.personal.title}</h2>
        <div className="hero__contact">
          <div className="hero__contact-item">{resumeData.personal.email}</div>
          <div className="hero__contact-item">{resumeData.personal.phone}</div>
          <div className="hero__contact-item">
            {resumeData.personal.location}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
