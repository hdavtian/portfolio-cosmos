import React, { useState, useCallback, useEffect, useRef } from "react";
import gsap from "gsap";
import type { OverlayContent, JobTechEntry } from "../CosmicContentOverlay";
import MatrixEffect from "./MatrixEffect";
import MoonOrbitHtmlNarrative from "./MoonOrbitHtmlNarrative";
import MoonOrbitHtmlTechChips from "./MoonOrbitHtmlTechChips";
import MoonOrbitHtmlPortfolio from "./MoonOrbitHtmlPortfolio";
import TVStaticOverlay from "./TVStaticOverlay";
import "./MoonOrbitHtmlLayout.scss";

interface Props {
  content: OverlayContent;
  visible: boolean;
}

type PanelKey = "portfolio" | "narrative" | "tech";
type OverlayMode = "static" | "bars";
const DEFAULT_PANEL_FLAGS: Record<PanelKey, boolean> = {
  portfolio: false,
  narrative: false,
  tech: false,
};
const DEFAULT_PANEL_MODES: Record<PanelKey, OverlayMode> = {
  portfolio: "static",
  narrative: "static",
  tech: "static",
};

const MoonOrbitHtmlLayout: React.FC<Props> = ({ content, visible }) => {
  const [hoveredTechIndex, setHoveredTechIndex] = useState<number | null>(null);
  const [lockedTechIndex, setLockedTechIndex] = useState<number | null>(null);
  const [portfolioExpanded, setPortfolioExpanded] = useState(false);
  const [panelsHidden, setPanelsHidden] = useState(false);
  const [replayTick, setReplayTick] = useState(0);
  const [panelStaticFlags, setPanelStaticFlags] =
    useState<Record<PanelKey, boolean>>(DEFAULT_PANEL_FLAGS);
  const [panelStaticModes, setPanelStaticModes] =
    useState<Record<PanelKey, OverlayMode>>(DEFAULT_PANEL_MODES);
  const [panelLabelFlags, setPanelLabelFlags] =
    useState<Record<PanelKey, boolean>>(DEFAULT_PANEL_FLAGS);
  const rootRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const entranceTlRef = useRef<gsap.core.Timeline | null>(null);
  const portfolioShellRef = useRef<HTMLDivElement>(null);
  const narrativeShellRef = useRef<HTMLDivElement>(null);
  const techShellRef = useRef<HTMLDivElement>(null);
  const portfolioStageRef = useRef<HTMLDivElement>(null);
  const narrativeStageRef = useRef<HTMLDivElement>(null);
  const techStageRef = useRef<HTMLDivElement>(null);
  const portfolioContentRef = useRef<HTMLDivElement>(null);
  const narrativeContentRef = useRef<HTMLDivElement>(null);
  const techContentRef = useRef<HTMLDivElement>(null);
  const portfolioTitleRef = useRef<HTMLDivElement>(null);
  const narrativeTitleRef = useRef<HTMLDivElement>(null);
  const techTitleRef = useRef<HTMLDivElement>(null);

  const techEntries: JobTechEntry[] = content.jobTech ?? [];
  const hasPortfolio =
    !!content.moonPortfolio &&
    content.moonPortfolio.tabs.length > 0 &&
    content.moonPortfolio.tabs.some((t) => t.cards.length > 0);

  const setStaticForPanel = useCallback((panel: PanelKey, active: boolean) => {
    setPanelStaticFlags((prev) =>
      prev[panel] === active ? prev : { ...prev, [panel]: active },
    );
  }, []);

  const setLabelForPanel = useCallback((panel: PanelKey, active: boolean) => {
    setPanelLabelFlags((prev) =>
      prev[panel] === active ? prev : { ...prev, [panel]: active },
    );
  }, []);

  const setStaticModeForPanel = useCallback(
    (panel: PanelKey, mode: OverlayMode) => {
      setPanelStaticModes((prev) =>
        prev[panel] === mode ? prev : { ...prev, [panel]: mode },
      );
    },
    [],
  );

  useEffect(() => {
    setHoveredTechIndex(null);
    setLockedTechIndex(null);
    setPortfolioExpanded(false);
    setPanelsHidden(false);
    setPanelStaticFlags(DEFAULT_PANEL_FLAGS);
    setPanelStaticModes(DEFAULT_PANEL_MODES);
    setPanelLabelFlags(DEFAULT_PANEL_FLAGS);
  }, [content.title]);

  useEffect(() => {
    const frameEl = frameRef.current;
    if (!frameEl) return;
    const rootEl = rootRef.current;
    const frameRect = frameEl.getBoundingClientRect();
    const viewportW = rootEl?.getBoundingClientRect().width ?? window.innerWidth;
    // Slide whole frame so only the left rail button remains peeking on the right.
    // Keep the button visible plus a little wrapper margin on its right edge.
    const keepVisiblePx = 43;
    const targetX = panelsHidden
      ? Math.max(0, viewportW - frameRect.left - keepVisiblePx)
      : 0;
    gsap.to(frameEl, {
      x: targetX,
      duration: 0.46,
      ease: "power3.inOut",
      overwrite: "auto",
    });
  }, [panelsHidden]);

  useEffect(() => {
    if (!visible) return;
    const frameEl = frameRef.current;
    const layoutEl = layoutRef.current;
    const toggleEl = toggleRef.current;
    if (!frameEl || !layoutEl || !toggleEl) return;

    entranceTlRef.current?.kill();

    const randomBetween = (min: number, max: number) =>
      gsap.utils.random(min, max, 0.001);
    const panelOrder: PanelKey[] = hasPortfolio
      ? ["portfolio", "narrative", "tech"]
      : ["narrative", "tech"];
    const weakPanel = panelOrder[(Math.random() * panelOrder.length) | 0];

    const getNodes = (panel: PanelKey) => {
      if (panel === "portfolio") {
        return {
          shell: portfolioShellRef.current,
          stage: portfolioStageRef.current,
          content: portfolioContentRef.current,
          title: portfolioTitleRef.current,
        };
      }
      if (panel === "narrative") {
        return {
          shell: narrativeShellRef.current,
          stage: narrativeStageRef.current,
          content: narrativeContentRef.current,
          title: narrativeTitleRef.current,
        };
      }
      return {
        shell: techShellRef.current,
        stage: techStageRef.current,
        content: techContentRef.current,
        title: techTitleRef.current,
      };
    };

    gsap.set(frameEl, { opacity: 0 });
    gsap.set(layoutEl, { opacity: 0 });
    gsap.set(toggleEl, { opacity: 0, scale: 0.84 });
    setPanelStaticFlags(DEFAULT_PANEL_FLAGS);
    setPanelStaticModes(DEFAULT_PANEL_MODES);
    setPanelLabelFlags(DEFAULT_PANEL_FLAGS);

    panelOrder.forEach((panel) => {
      const nodes = getNodes(panel);
      if (!nodes.shell || !nodes.stage || !nodes.content || !nodes.title) return;
      gsap.set(nodes.shell, { opacity: 1 });
      gsap.set(nodes.stage, {
        left: 0,
        top: 0,
        width: "100%",
        height: "100%",
        xPercent: 0,
        yPercent: 0,
        scale: 1,
        transformOrigin: "50% 50%",
        opacity: 1,
      });
      gsap.set(nodes.content, { opacity: 0 });
      gsap.set(nodes.title, { opacity: 0 });
    });

    const applyRandomEntrance = (
      tl: gsap.core.Timeline,
      stageEl: HTMLDivElement,
      duration: number,
    ) => {
      const variants = [
        "expandFromNothing",
        "expandHeight",
        "expandWidth",
        "expandFromLeft",
        "expandFromTop",
        "scaleUp",
      ] as const;
      const variant = variants[(Math.random() * variants.length) | 0];

      if (variant === "expandFromNothing") {
        tl.set(stageEl, {
          left: "50%",
          top: "50%",
          width: 0,
          height: 0,
          xPercent: -50,
          yPercent: -50,
          scale: 1,
        });
        tl.to(stageEl, {
          left: 0,
          top: 0,
          width: "100%",
          height: "100%",
          xPercent: 0,
          yPercent: 0,
          duration,
          ease: "power2.out",
        });
        return;
      }
      if (variant === "expandHeight") {
        tl.set(stageEl, {
          left: 0,
          top: "50%",
          width: "100%",
          height: 0,
          xPercent: 0,
          yPercent: -50,
          scale: 1,
        });
        tl.to(stageEl, {
          top: 0,
          height: "100%",
          yPercent: 0,
          duration,
          ease: "power2.out",
        });
        return;
      }
      if (variant === "expandWidth") {
        tl.set(stageEl, {
          left: "50%",
          top: 0,
          width: 0,
          height: "100%",
          xPercent: -50,
          yPercent: 0,
          scale: 1,
        });
        tl.to(stageEl, {
          left: 0,
          width: "100%",
          xPercent: 0,
          duration,
          ease: "power2.out",
        });
        return;
      }
      if (variant === "expandFromLeft") {
        tl.set(stageEl, {
          left: 0,
          top: 0,
          width: 0,
          height: "100%",
          xPercent: 0,
          yPercent: 0,
          scale: 1,
        });
        tl.to(stageEl, {
          width: "100%",
          duration,
          ease: "power2.out",
        });
        return;
      }
      if (variant === "expandFromTop") {
        tl.set(stageEl, {
          left: 0,
          top: 0,
          width: "100%",
          height: 0,
          xPercent: 0,
          yPercent: 0,
          scale: 1,
        });
        tl.to(stageEl, {
          height: "100%",
          duration,
          ease: "power2.out",
        });
        return;
      }
      tl.set(stageEl, {
        left: 0,
        top: 0,
        width: "100%",
        height: "100%",
        xPercent: 0,
        yPercent: 0,
        scale: 0.06,
      });
      tl.to(stageEl, {
        scale: 1,
        duration,
        ease: "power2.out",
      });
    };

    const buildPanelTimeline = (panel: PanelKey, weakSignal: boolean) => {
      const nodes = getNodes(panel);
      if (!nodes.stage || !nodes.content || !nodes.title) return null;

      const panelTl = gsap.timeline();
      const growDuration = randomBetween(0.46, 0.62);
      // For weak-signal panel, always force one bars burst so it's unmistakable.
      const barsBurstIndex = weakSignal ? ((Math.random() * 2) | 0) : -1;
      const chooseSignalMode = (burstIndex: number): OverlayMode =>
        burstIndex === barsBurstIndex ? "bars" : "static";
      const showSignal = (mode: OverlayMode = "static") => {
        setStaticModeForPanel(panel, mode);
        setStaticForPanel(panel, true);
      };

      panelTl.call(() => {
        showSignal("static");
        setLabelForPanel(panel, true);
      });
      panelTl.to(nodes.title, { opacity: 1, duration: 0.12, ease: "power1.out" });
      applyRandomEntrance(panelTl, nodes.stage, growDuration);

      if (weakSignal) {
        panelTl.call(
          () => setStaticForPanel(panel, false),
          [],
          `+=${randomBetween(0.1, 0.16)}`,
        );
        panelTl.to(nodes.content, {
          opacity: 1,
          duration: randomBetween(0.16, 0.24),
          ease: "power1.out",
        });
        const burstMode0 = chooseSignalMode(0);
        panelTl.call(
          () => showSignal(burstMode0),
          [],
          `+=${randomBetween(0.12, 0.2)}`,
        );
        panelTl.to(nodes.content, { opacity: 0, duration: 0.1 }, "<");

        panelTl.call(
          () => setStaticForPanel(panel, false),
          [],
          `+=${randomBetween(
            burstMode0 === "bars" ? 0.28 : 0.08,
            burstMode0 === "bars" ? 0.56 : 0.24,
          )}`,
        );
        panelTl.to(nodes.content, {
          opacity: 1,
          duration: randomBetween(0.2, 0.3),
          ease: "power1.out",
        });
        const burstMode1 = chooseSignalMode(1);
        panelTl.call(
          () => showSignal(burstMode1),
          [],
          `+=${randomBetween(0.12, 0.2)}`,
        );
        panelTl.to(nodes.content, { opacity: 0, duration: 0.1 }, "<");

        panelTl.call(
          () => setStaticForPanel(panel, false),
          [],
          `+=${randomBetween(
            burstMode1 === "bars" ? 0.28 : 0.08,
            burstMode1 === "bars" ? 0.56 : 0.28,
          )}`,
        );
        panelTl.to(nodes.content, {
          opacity: 1,
          duration: randomBetween(0.28, 0.4),
          ease: "power2.out",
        });
      } else {
        panelTl.call(
          () => setStaticForPanel(panel, false),
          [],
          `+=${randomBetween(0.3, 0.44)}`,
        );
        panelTl.to(nodes.content, {
          opacity: 1,
          duration: randomBetween(0.4, 0.56),
          ease: "power2.out",
        });
      }

      panelTl.to(nodes.title, {
        opacity: 0,
        duration: 0.4,
        ease: "power1.out",
      }, "<+0.06");
      panelTl.call(() => setLabelForPanel(panel, false));
      panelTl.set(nodes.stage, {
        clearProps: "left,top,width,height,xPercent,yPercent,scale,transformOrigin",
      });
      return panelTl;
    };

    const tl = gsap.timeline();
    entranceTlRef.current = tl;

    tl.to(frameEl, { opacity: 1, duration: 0.36, ease: "power2.out" }, 0);
    tl.to(layoutEl, { opacity: 1, duration: 0.28, ease: "power1.out" }, 0.08);

    // Let matrix/frame settle first, then begin panel stagger.
    let cursor = 1 + randomBetween(0.08, 0.2);
    panelOrder.forEach((panel, idx) => {
      const panelTl = buildPanelTimeline(panel, panel === weakPanel);
      if (panelTl) {
        tl.add(panelTl, cursor);
      }
      if (idx < panelOrder.length - 1) {
        if (idx === 0) cursor += randomBetween(0.2, 0.5);
        else cursor += randomBetween(0.15, 0.4);
      }
    });

    tl.to(
      toggleEl,
      { opacity: 1, scale: 1, duration: 0.26, ease: "back.out(1.6)" },
      cursor + randomBetween(0.2, 0.4),
    );

    return () => {
      tl.kill();
      entranceTlRef.current = null;
      setPanelStaticFlags(DEFAULT_PANEL_FLAGS);
      setPanelStaticModes(DEFAULT_PANEL_MODES);
      setPanelLabelFlags(DEFAULT_PANEL_FLAGS);
    };
  }, [
    content.title,
    hasPortfolio,
    replayTick,
    setLabelForPanel,
    setStaticForPanel,
    setStaticModeForPanel,
    visible,
  ]);

  const handleTechSelect = useCallback(
    (index: number) => {
      setLockedTechIndex((prev) => (prev === index ? null : index));
    },
    [],
  );

  const handleTechHover = useCallback((index: number | null) => {
    setHoveredTechIndex(index);
  }, []);

  const lockedHighlightTerms: string[] =
    lockedTechIndex !== null && techEntries[lockedTechIndex]
      ? techEntries[lockedTechIndex].highlightMatches
      : [];
  const previewHighlightTerms: string[] =
    hoveredTechIndex !== null &&
    hoveredTechIndex !== lockedTechIndex &&
    techEntries[hoveredTechIndex]
      ? techEntries[hoveredTechIndex].highlightMatches
      : [];

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === rootRef.current && lockedTechIndex !== null) {
        setLockedTechIndex(null);
      }
    },
    [lockedTechIndex],
  );

  if (!visible) return null;

  return (
    <div
      ref={rootRef}
      className="moon-html-layout-shell"
      onClick={handleBackdropClick}
    >
      <div
        ref={frameRef}
        className={`moon-html-layout-frame${panelsHidden ? " moon-html-layout-frame--hidden" : ""}${hasPortfolio ? "" : " moon-html-layout-frame--no-portfolio"}`}
      >
        <MatrixEffect visible={visible} color="#2a9968" className="moon-matrix-bg" />
        <button
          ref={toggleRef}
          className={`moon-html-layout__toggle${panelsHidden ? " moon-html-layout__toggle--hidden" : ""}`}
          onClick={() => setPanelsHidden((prev) => !prev)}
          aria-label={panelsHidden ? "Show moon orbit panels" : "Hide moon orbit panels"}
          title={panelsHidden ? "Show panels" : "Hide panels"}
        >
          <i
            className={`fa-solid ${panelsHidden ? "fa-chevron-left" : "fa-chevron-right"}`}
            aria-hidden="true"
          />
        </button>
        <button
          className="moon-html-layout__replay"
          onClick={() => setReplayTick((prev) => prev + 1)}
          aria-label="Replay panel signal sequence"
          title="Replay signal sequence"
        >
          <i className="fa-solid fa-rotate-right" aria-hidden="true" />
        </button>
      <div
        ref={layoutRef}
        className={`moon-html-layout${hasPortfolio ? "" : " moon-html-layout--no-portfolio"}${portfolioExpanded ? " moon-html-layout--portfolio-expanded" : ""}`}
        style={{ pointerEvents: panelsHidden ? "none" : undefined }}
      >
        {hasPortfolio && (
          <div ref={portfolioShellRef} className="moon-html-layout__portfolio moon-panel-shell">
            <div ref={portfolioStageRef} className="moon-panel-stage">
              <div ref={portfolioContentRef} className="moon-panel-content">
                <MoonOrbitHtmlPortfolio
                  portfolio={content.moonPortfolio!}
                  isExpanded={portfolioExpanded}
                  onToggleExpand={() => setPortfolioExpanded((prev) => !prev)}
                />
              </div>
              <TVStaticOverlay
                active={panelStaticFlags.portfolio}
                mode={panelStaticModes.portfolio}
                className="moon-panel-static"
                intensity={0.9}
                tint="rgba(42, 153, 104, 0.08)"
              />
              <div
                ref={portfolioTitleRef}
                className={`moon-panel-title${panelLabelFlags.portfolio ? " moon-panel-title--active" : ""}`}
              >
                PORTFOLIO FEED
              </div>
            </div>
          </div>
        )}

        <div ref={narrativeShellRef} className="moon-html-layout__narrative moon-panel-shell">
          <div ref={narrativeStageRef} className="moon-panel-stage">
            <div ref={narrativeContentRef} className="moon-panel-content">
              <MoonOrbitHtmlNarrative
                title={content.title}
                subtitle={content.subtitle}
                sections={content.sections}
                lockedHighlightTerms={lockedHighlightTerms}
                previewHighlightTerms={previewHighlightTerms}
              />
            </div>
            <TVStaticOverlay
              active={panelStaticFlags.narrative}
              mode={panelStaticModes.narrative}
              className="moon-panel-static"
              intensity={0.95}
              tint="rgba(42, 153, 104, 0.08)"
            />
            <div
              ref={narrativeTitleRef}
              className={`moon-panel-title${panelLabelFlags.narrative ? " moon-panel-title--active" : ""}`}
            >
              MISSION BRIEF
            </div>
          </div>
        </div>

        <div ref={techShellRef} className="moon-html-layout__tech moon-panel-shell">
          <div ref={techStageRef} className="moon-panel-stage">
            <div ref={techContentRef} className="moon-panel-content">
              <MoonOrbitHtmlTechChips
                techEntries={techEntries}
                hoveredIndex={hoveredTechIndex}
                lockedIndex={lockedTechIndex}
                onHover={handleTechHover}
                onSelect={handleTechSelect}
              />
            </div>
            <TVStaticOverlay
              active={panelStaticFlags.tech}
              mode={panelStaticModes.tech}
              className="moon-panel-static"
              intensity={1}
              tint="rgba(42, 153, 104, 0.08)"
            />
            <div
              ref={techTitleRef}
              className={`moon-panel-title${panelLabelFlags.tech ? " moon-panel-title--active" : ""}`}
            >
              TECH REGISTRY
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};

export default MoonOrbitHtmlLayout;
