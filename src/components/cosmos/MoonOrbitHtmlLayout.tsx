import React, { useState, useCallback, useEffect, useRef } from "react";
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
  const rootRef = useRef<HTMLDivElement>(null);

  const techEntries: JobTechEntry[] = content.jobTech ?? [];

  useEffect(() => {
    setHoveredTechIndex(null);
    setLockedTechIndex(null);
  }, [content.title]);

  const handleTechSelect = useCallback(
    (index: number) => {
      setLockedTechIndex((prev) => (prev === index ? null : index));
    },
    [],
  );

  const handleTechHover = useCallback((index: number | null) => {
    setHoveredTechIndex(index);
  }, []);

  const activeIndex = lockedTechIndex ?? hoveredTechIndex;
  const highlightMode: "none" | "preview" | "locked" =
    lockedTechIndex !== null
      ? "locked"
      : hoveredTechIndex !== null
        ? "preview"
        : "none";
  const highlightTerms: string[] =
    activeIndex !== null && techEntries[activeIndex]
      ? techEntries[activeIndex].highlightMatches
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
      className={`moon-html-layout${hasPortfolio ? "" : " moon-html-layout--no-portfolio"}`}
      onClick={handleBackdropClick}
    >
      {hasPortfolio && (
        <div className="moon-html-layout__portfolio">
          <MoonOrbitHtmlPortfolio portfolio={content.moonPortfolio!} />
        </div>
      )}

      <div className="moon-html-layout__narrative">
        <MoonOrbitHtmlNarrative
          title={content.title}
          subtitle={content.subtitle}
          sections={content.sections}
          highlightTerms={highlightTerms}
          highlightMode={highlightMode}
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
  );
};

export default MoonOrbitHtmlLayout;
