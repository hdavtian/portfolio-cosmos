import { useEffect, useState } from "react";
import gsap from "gsap";
import resumeData from "./data/resume.json";
import ResumeStructureDiagram from "./components/ResumeStructureDiagram";
import DiagramSettings, {
  type DiagramStyle,
  type DiagramStyleOptions,
} from "./components/DiagramSettings";
import { isCinematicSuspended, subscribeCinematicSuspended } from "./lib/cinematicSuspend";
import { useResumeQuery } from "./lib/query/contentQueries";
import "./styles/main.scss";

// The diagram styles can link to page sections; the experience is a single
// screen now, so those links have nowhere to go.
const noSectionNavigation = () => {};

function App() {
  // The cinematic body styles (scroll lock, fonts) apply only while this page is
  // showing (mounted and not paused behind the portfolio); see
  // body.cinematic-experience in styles/main.scss.
  useEffect(() => {
    const apply = (suspended: boolean) =>
      document.body.classList.toggle("cinematic-experience", !suspended);
    apply(isCinematicSuspended());
    const unsubscribe = subscribeCinematicSuspended(apply);
    return () => {
      unsubscribe();
      document.body.classList.remove("cinematic-experience");
    };
  }, []);

  // Name, title, contact and summary come from the published profile
  // (Admin → Profile), falling back to the bundled resume.
  const publishedResume = useResumeQuery();
  const personal = publishedResume.data?.payload.personal ?? resumeData.personal;
  const summary = publishedResume.data?.payload.summary ?? resumeData.summary;

  // Diagram settings state
  const [diagramStyle, setDiagramStyle] = useState<DiagramStyle>("space");
  const [diagramOptions, setDiagramOptions] = useState<DiagramStyleOptions>({
    nodeSpacing: 100,
    glowIntensity: 5,
    parentSpacing: 180,
    twinkleSpeed: 3,
    circuitComplexity: 50,
    traceWidth: 3,
    ringCount: 3,
    ringSpacing: 80,
    branchAngle: 45,
    leafDensity: 50,
    pulseSpeed: 2,
    connectionDensity: 50,
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [spaceReloadKey, setSpaceReloadKey] = useState(0);

  useEffect(() => {
    if (!document.querySelector(".hero__content")) return;
    // Animate hero on load
    const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
    tl.fromTo(
      ".hero__content",
      { opacity: 0 },
      { opacity: 1, duration: 0.8, delay: 0.2 },
    )
      .fromTo(
        ".hero__name",
        { opacity: 0 },
        { opacity: 1, duration: 0.6 },
        "-=0.4",
      )
      .fromTo(
        ".hero__title",
        { opacity: 0 },
        { opacity: 1, duration: 0.6 },
        "-=0.3",
      )
      .fromTo(
        ".hero__contact-item",
        { opacity: 0 },
        { opacity: 1, duration: 0.4, stagger: 0.1 },
        "-=0.3",
      )
      .fromTo(
        ".hero__summary",
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.6 },
        "-=0.2",
      );
  }, []);

  return (
    <div className="app">
      {/* Diagram Settings */}
      <DiagramSettings
        currentStyle={diagramStyle}
        options={diagramOptions}
        onStyleChange={setDiagramStyle}
        onOptionsChange={setDiagramOptions}
        isOpen={settingsOpen}
        onToggle={() => setSettingsOpen(!settingsOpen)}
      />

      {/* Hero + Summary Section */}
      <section className="hero section active">
        <div className="hero__background"></div>
        <div className="hero__overlay"></div>
        <div
          className={`hero__header ${diagramStyle === "space" ? "hero__header--hidden" : ""}`}
        >
          <h1 className="hero__name">
            {personal.name}
            <span className="hero__title">{personal.title}</span>
          </h1>
        </div>
        <div className="hero__canvas">
          <ResumeStructureDiagram
            onNavigate={noSectionNavigation}
            style={diagramStyle}
            options={diagramOptions}
            onOptionsChange={setDiagramOptions}
            spaceReloadKey={spaceReloadKey}
            onReloadUniverse={() => setSpaceReloadKey((k) => k + 1)}
          />
        </div>
        <div
          className={`hero__footer ${diagramStyle === "space" ? "hero__footer--hidden" : ""}`}
        >
          <div className="hero__summary">
            <p className="hero__summary-text">{summary}</p>
          </div>
          <div className="hero__contact">
            <div className="hero__contact-item">
              {personal.email}
            </div>
            <div className="hero__contact-item">
              {personal.location}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default App;
