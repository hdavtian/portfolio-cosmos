import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import resumeData from "../data/resume.json";
import "./Footer.scss";

gsap.registerPlugin(ScrollTrigger);

interface FooterProps {
  className?: string;
}

const Footer = ({ className = "" }: FooterProps) => {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!className.includes("active")) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power2.out" } });

      tl.from(".footer__section", {
        opacity: 0,
        y: 20,
        duration: 0.6,
        stagger: 0.15,
        delay: 0.2,
      });
    }, sectionRef);

    return () => ctx.revert();
  }, [className]);

  return (
    <footer ref={sectionRef} className={`footer section ${className}`}>
      <div className="footer__background"></div>
      <div className="footer__overlay"></div>
      <div className="footer__container">
        {/* Education */}
        <div className="footer__section">
          <h2 className="footer__title">Education</h2>
          <div className="footer__item">
            <h3 className="footer__institution">
              {resumeData.education.institution}
            </h3>
            <p className="footer__degree">
              {resumeData.education.degree} • {resumeData.education.major}
            </p>
            <p className="footer__date">
              {resumeData.education.graduationDate}
            </p>
          </div>
        </div>

        {/* Certifications */}
        <div className="footer__section">
          <h2 className="footer__title">Certifications</h2>
          {resumeData.certifications.map((cert, index) => (
            <div key={index} className="footer__item">
              <h3 className="footer__cert-name">{cert.name}</h3>
              <p className="footer__date">{cert.date}</p>
            </div>
          ))}
        </div>

        {/* Links */}
        <div className="footer__section footer__section--links">
          <h2 className="footer__title">Connect</h2>
          <div className="footer__links">
            {resumeData.links.map((link, index) => (
              <a
                key={index}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="footer__link"
              >
                {link.title}
              </a>
            ))}
          </div>
        </div>

        {/* Credits */}
        <div className="footer__credits">
          <p className="footer__credits-name">{resumeData.personal.name}</p>
          <p className="footer__credits-text">
            Crafted with React • TypeScript • GSAP • SCSS
          </p>
          <p className="footer__credits-year">© {new Date().getFullYear()}</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
