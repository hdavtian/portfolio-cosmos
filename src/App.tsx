import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import * as d3 from "d3";
import resumeData from "./data/resume.json";
import ResumeStructureDiagram from "./components/ResumeStructureDiagram";
import DiagramSettings, {
  type DiagramStyle,
  type DiagramStyleOptions,
} from "./components/DiagramSettings";
import "./styles/main.scss";

// Skills Diagram Component using D3.js force-directed graph
function SkillsDiagram({ skills }: { skills: Record<string, string[]> }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<
    SVGSVGElement,
    unknown
  > | null>(null);

  useEffect(() => {
    const svg = svgRef.current;
    const container = containerRef.current;
    if (!svg || !container) return;

    const width = 1200;
    const height = 600;

    // Clear previous content
    d3.select(svg).selectAll("*").remove();

    const g = d3
      .select(svg)
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet")
      .append("g");

    // Build node data structure
    interface Node extends d3.SimulationNodeDatum {
      id: string;
      type: "center" | "category" | "skill";
      category?: string;
      label: string;
      radius: number;
    }

    interface Link extends d3.SimulationLinkDatum<Node> {
      source: string | Node;
      target: string | Node;
    }

    const nodes: Node[] = [
      {
        id: "center",
        type: "center",
        label: "TECH STACK",
        radius: 50,
        x: width / 2,
        y: height / 2,
        fx: width / 2,
        fy: height / 2,
      },
    ];

    const links: Link[] = [];

    // Add category and skill nodes
    Object.entries(skills).forEach(([category, items]) => {
      const categoryId = `cat-${category}`;
      nodes.push({
        id: categoryId,
        type: "category",
        label: category,
        radius: 45,
      });

      links.push({
        source: "center",
        target: categoryId,
      });

      items.forEach((skill) => {
        const skillId = `skill-${category}-${skill}`;
        // Calculate radius based on text length to ensure text fits
        const baseRadius = 25;
        const charWidth = 0.6; // approximate character width in pixels per font size
        const fontSize = 8;
        const textWidth = skill.length * charWidth * fontSize;
        const calculatedRadius = Math.max(baseRadius, textWidth / 2 + 8);

        nodes.push({
          id: skillId,
          type: "skill",
          category,
          label: skill,
          radius: calculatedRadius,
        });

        links.push({
          source: categoryId,
          target: skillId,
        });
      });
    });

    // Create force simulation
    const simulation = d3
      .forceSimulation(nodes)
      .force(
        "link",
        d3
          .forceLink<Node, Link>(links)
          .id((d) => d.id)
          .distance((d) => {
            const source = d.source as Node;
            if (source.type === "center") return 180;
            if (source.type === "category") return 100;
            return 50;
          })
          .strength(0.8),
      )
      .force(
        "charge",
        d3.forceManyBody().strength((d) => {
          const node = d as Node;
          if (node.type === "center") return -1000;
          if (node.type === "category") return -400;
          return -150;
        }),
      )
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force(
        "collision",
        d3.forceCollide<Node>().radius((d) => d.radius + 10),
      );

    // Draw links
    const link = g
      .append("g")
      .attr("class", "links")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", "rgba(212, 175, 55, 0.3)")
      .attr("stroke-width", (d) => {
        const source = d.source as Node;
        return source.type === "center" ? 2.5 : 1.5;
      })
      .style("pointer-events", "none");

    // Draw nodes
    const node = g
      .append("g")
      .attr("class", "nodes")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .call(
        d3
          .drag<SVGGElement, Node>()
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d) => {
            // Don't release position immediately - keep node where dropped
            if (!event.active) simulation.alphaTarget(0);

            // Store the drop position
            const dropX = event.x;
            const dropY = event.y;

            // Create a small "settling zone" within 10% of node radius
            const settleRadius = d.radius * 0.1;

            // Add a gentle spring back force to settle within the zone
            const settleSimulation = d3
              .forceSimulation([d])
              .force(
                "settle",
                d3.forceRadial(settleRadius, dropX, dropY).strength(0.3),
              )
              .alphaDecay(0.1)
              .on("tick", () => {
                // Update the fixed position slightly for bounce effect
                d.fx = d.x;
                d.fy = d.y;
              })
              .on("end", () => {
                // After settling, fix the position permanently
                d.fx = d.x;
                d.fy = d.y;
              });

            // Run settling simulation for a short time
            setTimeout(() => {
              settleSimulation.stop();
              d.fx = d.x;
              d.fy = d.y;
            }, 500);
          }) as any,
      );

    // Add circles
    node
      .append("circle")
      .attr("r", (d) => d.radius)
      .attr("fill", (d) => {
        if (d.type === "center") return "rgba(30, 30, 30, 1)";
        if (d.type === "category") return "rgba(30, 30, 30, 1)";
        return "rgba(0, 0, 0, 0.95)";
      })
      .attr("stroke", (d) => {
        if (d.type === "center") return "rgba(212, 175, 55, 1)";
        if (d.type === "category") return "rgba(212, 175, 55, 0.9)";
        return "rgba(212, 175, 55, 0.6)";
      })
      .attr("stroke-width", (d) => (d.type === "center" ? 3 : 2));

    // Add labels
    node
      .append("text")
      .text((d) => d.label)
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("font-size", (d) => {
        if (d.type === "center") return "11px";
        if (d.type === "category") return "10px";
        return "8px";
      })
      .attr("fill", (d) => (d.type === "skill" ? "#ffffff" : "#d4af37"))
      .attr("font-weight", (d) =>
        d.type === "center" ? "700" : d.type === "category" ? "600" : "400",
      )
      .attr("font-family", (d) =>
        d.type === "center" || d.type === "category"
          ? "Cinzel, serif"
          : "Montserrat, sans-serif",
      )
      .attr("letter-spacing", (d) =>
        d.type === "center" || d.type === "category" ? "0.1em" : "0",
      )
      .style("pointer-events", "none")
      .style("user-select", "none")
      .each(function (d) {
        const text = d3.select(this);

        // Wrap text for category nodes
        if (d.type === "category") {
          const words = d.label.split(/[\s&]+/);
          if (words.length > 1) {
            text.text("");
            if (words.length === 2) {
              text
                .append("tspan")
                .attr("x", 0)
                .attr("dy", "-0.4em")
                .text(words[0]);
              text
                .append("tspan")
                .attr("x", 0)
                .attr("dy", "1.2em")
                .text(words.slice(1).join(" "));
            } else if (words.length >= 3) {
              text
                .append("tspan")
                .attr("x", 0)
                .attr("dy", "-0.7em")
                .text(words[0]);
              text.append("tspan").attr("x", 0).attr("dy", "1.1em").text("&");
              text
                .append("tspan")
                .attr("x", 0)
                .attr("dy", "1.1em")
                .text(words.slice(1).join(" "));
            }
          }
        }

        // Wrap text for skill nodes
        if (d.type === "skill") {
          const text = d3.select(this);
          const words = d.label.split(/\s+/);
          if (words.length > 1 && d.label.length > 12) {
            text.text("");
            text
              .append("tspan")
              .attr("x", 0)
              .attr("dy", "-0.3em")
              .text(words[0]);
            text
              .append("tspan")
              .attr("x", 0)
              .attr("dy", "1.1em")
              .text(words.slice(1).join(" "));
          }
        }
      });

    // Update positions on simulation tick
    simulation.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as Node).x!)
        .attr("y1", (d) => (d.source as Node).y!)
        .attr("x2", (d) => (d.target as Node).x!)
        .attr("y2", (d) => (d.target as Node).y!);

      node.attr("transform", (d) => `translate(${d.x},${d.y})`);

      // Ensure nodes are always on top
      node.raise();
    });

    // Add zoom behavior
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 3])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
        setZoomLevel(event.transform.k);
      });

    zoomBehaviorRef.current = zoom;
    d3.select(svg).call(zoom);

    return () => {
      simulation.stop();
    };
  }, [skills]);

  const handleZoomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newZoom = parseFloat(e.target.value);
    applyZoom(newZoom);
  };

  const applyZoom = (newZoom: number) => {
    setZoomLevel(newZoom);

    if (svgRef.current && zoomBehaviorRef.current) {
      const svg = d3.select(svgRef.current);
      const transform = d3.zoomIdentity
        .translate((1200 * (1 - newZoom)) / 2, (600 * (1 - newZoom)) / 2)
        .scale(newZoom);

      svg
        .transition()
        .duration(300)
        .call(zoomBehaviorRef.current.transform as any, transform);
    }
  };

  const handleZoomIn = () => {
    const newZoom = Math.min(3, zoomLevel + 0.25);
    applyZoom(newZoom);
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(0.5, zoomLevel - 0.25);
    applyZoom(newZoom);
  };

  const handleZoomReset = () => {
    applyZoom(1);
  };

  return (
    <div ref={containerRef} className="skills__d3-container">
      <svg
        ref={svgRef}
        className="skills__d3-svg"
        style={{ display: "block", margin: "0 auto" }}
      />
      <div className="skills__zoom-control">
        <button
          className="skills__zoom-btn"
          onClick={handleZoomIn}
          aria-label="Zoom in"
        >
          +
        </button>
        <div className="skills__zoom-percentage">
          {Math.round(zoomLevel * 100)}%
        </div>
        <div className="skills__zoom-slider-container">
          <input
            type="range"
            min="0.5"
            max="3"
            step="0.01"
            value={zoomLevel}
            onChange={handleZoomChange}
            className="skills__zoom-slider"
          />
          <div className="skills__zoom-ticks">
            <div className="skills__zoom-tick" data-value="3x"></div>
            <div className="skills__zoom-tick" data-value="2x"></div>
            <div className="skills__zoom-tick" data-value="1x"></div>
            <div className="skills__zoom-tick" data-value="0.5x"></div>
          </div>
        </div>
        <button
          className="skills__zoom-btn"
          onClick={handleZoomOut}
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          className="skills__zoom-reset"
          onClick={handleZoomReset}
          aria-label="Reset zoom"
        >
          ⟲
        </button>
      </div>
    </div>
  );
}

function App() {
  const [currentSection, setCurrentSection] = useState(0);
  const isNavigating = useRef(false);
  const totalSections = 2 + resumeData.experience.length + 1; // hero+summary, skills, jobs, footer

  // Diagram settings state
  const [diagramStyle, setDiagramStyle] = useState<DiagramStyle>("circles");
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

  useEffect(() => {
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

  useEffect(() => {
    const navigate = (direction: 1 | -1) => {
      if (isNavigating.current) return;
      isNavigating.current = true;

      setCurrentSection((prev) => {
        const next = prev + direction;
        if (next < 0 || next >= totalSections) {
          isNavigating.current = false;
          return prev;
        }

        // Handle experience section (indices 2 to 2+jobs-1)
        if (next >= 2 && next < 2 + resumeData.experience.length) {
          animateExperienceJob(next - 2);
        } else if (next === 1) {
          animateSkills();
        } else if (next === totalSections - 1) {
          animateFooter();
        }

        setTimeout(() => {
          isNavigating.current = false;
        }, 600);

        return next;
      });
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        navigate(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        navigate(-1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [totalSections]);

  const animateSkills = () => {
    const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
    tl.fromTo(
      ".skills__title",
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.6 },
    ).fromTo(
      ".skills__category",
      { opacity: 0, y: 15 },
      { opacity: 1, y: 0, duration: 0.5, stagger: 0.1 },
      "-=0.3",
    );
  };

  const animateExperienceJob = (jobIndex: number) => {
    const jobEl = `.experience__job[data-job-index="${jobIndex}"]`;
    const tl = gsap.timeline({ defaults: { ease: "power2.out" } });

    tl.fromTo(
      `${jobEl} .experience__company`,
      { opacity: 0, scale: 1.3 },
      { opacity: 1, scale: 1, duration: 0.6 },
    )
      .fromTo(
        `${jobEl} .experience__meta`,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5 },
        "-=0.4",
      )
      .fromTo(
        `${jobEl} .experience__position`,
        { opacity: 0, y: 15 },
        { opacity: 1, y: 0, duration: 0.5 },
        "-=0.3",
      )
      .fromTo(
        `${jobEl} .experience__position-dates`,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.4 },
        "-=0.3",
      )
      .fromTo(
        `${jobEl} .experience__responsibility`,
        { opacity: 0, x: -20 },
        { opacity: 1, x: 0, duration: 0.4, stagger: 0.05 },
        "-=0.3",
      );
  };

  const animateFooter = () => {
    const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
    tl.fromTo(
      ".footer__section",
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.6, stagger: 0.15 },
    );
  };

  const getSectionClass = (index: number) => {
    return currentSection === index ? "active" : "";
  };

  const navigateToSection = (index: number) => {
    if (isNavigating.current || index === currentSection) return;
    isNavigating.current = true;

    setCurrentSection(index);

    // Handle animations for specific sections
    if (index >= 2 && index < 2 + resumeData.experience.length) {
      animateExperienceJob(index - 2);
    } else if (index === 1) {
      animateSkills();
    } else if (index === totalSections - 1) {
      animateFooter();
    }

    setTimeout(() => {
      isNavigating.current = false;
    }, 600);
  };

  const getSectionLabel = (index: number) => {
    if (index === 0) return "HD - Full Stack Engineer";
    if (index === 1) return "Skills";
    if (index >= 2 && index < 2 + resumeData.experience.length) {
      return (
        resumeData.experience[index - 2].navLabel ||
        resumeData.experience[index - 2].company
      );
    }
    if (index === totalSections - 1) return "Education";
    return "";
  };

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

      {/* Vertical Navigation */}
      <nav className={`nav ${currentSection === 0 ? "nav--hidden" : ""}`}>
        <div className="nav__line"></div>
        {Array.from({ length: totalSections }).map((_, index) => {
          const showExperienceLabel = index === 2;
          const isExperienceItem =
            index >= 2 && index < 2 + resumeData.experience.length;
          return (
            <div key={index}>
              {showExperienceLabel && (
                <div className="nav__item nav__item--label">
                  <span className="nav__tick"></span>
                  <span className="nav__label">Experience</span>
                </div>
              )}
              <button
                className={`nav__item ${
                  currentSection === index ? "nav__item--active" : ""
                } ${isExperienceItem ? "nav__item--experience" : ""}`}
                onClick={() => navigateToSection(index)}
                aria-label={`Navigate to ${getSectionLabel(index)}`}
              >
                <span className="nav__tick"></span>
                <span className="nav__label">{getSectionLabel(index)}</span>
              </button>
            </div>
          );
        })}
      </nav>
      {/* Hero + Summary Section */}
      <section className={`hero section ${getSectionClass(0)}`}>
        <div className="hero__background"></div>
        <div className="hero__overlay"></div>
        <div className="hero__header">
          <h1 className="hero__name">
            {resumeData.personal.name}
            <span className="hero__title">{resumeData.personal.title}</span>
          </h1>
        </div>
        <div className="hero__canvas">
          <ResumeStructureDiagram
            onNavigate={navigateToSection}
            style={diagramStyle}
            options={diagramOptions}
          />
        </div>
        <div
          className={`hero__footer ${diagramStyle === "space" ? "hero__footer--hidden" : ""}`}
        >
          <div className="hero__summary">
            <p className="hero__summary-text">{resumeData.summary}</p>
          </div>
          <div className="hero__contact">
            <div className="hero__contact-item">
              {resumeData.personal.email}
            </div>
            <div className="hero__contact-item">
              {resumeData.personal.location}
            </div>
          </div>
        </div>
      </section>

      {/* Skills Section */}
      <section className={`skills section ${getSectionClass(1)}`}>
        <div className="skills__background"></div>
        <div className="skills__overlay"></div>
        <div className="skills__content">
          <h2 className="skills__title">Technical Expertise</h2>
          <SkillsDiagram skills={resumeData.skills} />
        </div>
      </section>

      {/* Experience Sections - Each job is a section */}
      {resumeData.experience.map((job, jobIndex) => (
        <section
          key={jobIndex}
          className={`experience section ${getSectionClass(2 + jobIndex)}`}
          data-job-id={job.id}
        >
          <div className="experience__job" data-job-index={jobIndex}>
            <div className="experience__container">
              <h3 className="experience__company">
                {job.navLabel || job.company}
              </h3>
              {job.positions.length === 1 ? (
                <div className="experience__meta">
                  <span className="experience__location">{job.location}</span>
                  <span className="experience__dates">
                    {job.startDate} — {job.endDate}
                  </span>
                </div>
              ) : (
                <div className="experience__meta">
                  <span className="experience__location">{job.location}</span>
                </div>
              )}
              {job.positions.map((position, posIndex) => (
                <div key={posIndex} className="experience__position-block">
                  <h4 className="experience__position">{position.title}</h4>
                  {job.positions.length > 1 &&
                    "startDate" in position &&
                    "endDate" in position && (
                      <div className="experience__position-dates">
                        {position.startDate} — {position.endDate}
                      </div>
                    )}
                  <ul className="experience__responsibilities">
                    {position.responsibilities.map((resp, respIndex) => (
                      <li
                        key={respIndex}
                        className="experience__responsibility"
                      >
                        {resp}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <div className="experience__divider"></div>
              <div className="experience__full-name">{job.company}</div>
            </div>
          </div>
        </section>
      ))}

      {/* Footer Section */}
      <section
        className={`footer section ${getSectionClass(totalSections - 1)}`}
      >
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
        </div>
      </section>
    </div>
  );
}

export default App;
