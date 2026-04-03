import React, { useState, useCallback, useEffect, useRef } from "react";
import gsap from "gsap";
import type { OverlayContent, JobTechEntry } from "../CosmicContentOverlay";
import MoonOrbitHtmlNarrative from "./MoonOrbitHtmlNarrative";
import MoonOrbitHtmlTechChips from "./MoonOrbitHtmlTechChips";
import MoonOrbitHtmlPortfolio from "./MoonOrbitHtmlPortfolio";
import "./MoonOrbitHtmlLayout.scss";

interface Props {
  content: OverlayContent;
  visible: boolean;
}

const MoonOrbitHtmlLayout: React.FC<Props> = ({ content, visible }) => {
  const [hoveredTechIndex, setHoveredTechIndex] = useState<number | null>(null);
  const [lockedTechIndex, setLockedTechIndex] = useState<number | null>(null);
  const [portfolioExpanded, setPortfolioExpanded] = useState(false);
  const [panelsHidden, setPanelsHidden] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  const techEntries: JobTechEntry[] = content.jobTech ?? [];

  useEffect(() => {
    setHoveredTechIndex(null);
    setLockedTechIndex(null);
    setPortfolioExpanded(false);
    setPanelsHidden(false);
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

  const hasPortfolio =
    !!content.moonPortfolio &&
    content.moonPortfolio.tabs.length > 0 &&
    content.moonPortfolio.tabs.some((t) => t.cards.length > 0);

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
        <button
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
      <div
        className={`moon-html-layout${hasPortfolio ? "" : " moon-html-layout--no-portfolio"}${portfolioExpanded ? " moon-html-layout--portfolio-expanded" : ""}`}
        style={{ pointerEvents: panelsHidden ? "none" : undefined }}
      >
        {hasPortfolio && (
          <div className="moon-html-layout__portfolio">
            <MoonOrbitHtmlPortfolio
              portfolio={content.moonPortfolio!}
              isExpanded={portfolioExpanded}
              onToggleExpand={() => setPortfolioExpanded((prev) => !prev)}
            />
          </div>
        )}

        <div className="moon-html-layout__narrative">
          <MoonOrbitHtmlNarrative
            title={content.title}
            subtitle={content.subtitle}
            sections={content.sections}
            lockedHighlightTerms={lockedHighlightTerms}
            previewHighlightTerms={previewHighlightTerms}
          />
        </div>

        <div className="moon-html-layout__tech">
          <MoonOrbitHtmlTechChips
            techEntries={techEntries}
            hoveredIndex={hoveredTechIndex}
            lockedIndex={lockedTechIndex}
            onHover={handleTechHover}
            onSelect={handleTechSelect}
          />
        </div>
      </div>
      </div>
    </div>
  );
};

export default MoonOrbitHtmlLayout;
