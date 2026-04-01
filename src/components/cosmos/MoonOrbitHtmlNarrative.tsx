import React, { useRef, useEffect, useMemo } from "react";
import type { OverlaySection } from "../CosmicContentOverlay";

interface Props {
  title: string;
  subtitle?: string;
  sections: OverlaySection[];
  highlightTerms: string[];
  highlightMode: "none" | "preview" | "locked";
}

function highlightText(
  text: string,
  terms: string[],
  mode: "none" | "preview" | "locked",
): React.ReactNode[] {
  if (mode === "none" || terms.length === 0) return [text];

  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = text.split(pattern);

  return parts.map((part, i) => {
    const isMatch = terms.some(
      (t) => t.toLowerCase() === part.toLowerCase(),
    );
    if (isMatch) {
      return (
        <mark
          key={i}
          className={`moon-hl moon-hl--${mode}`}
        >
          {part}
        </mark>
      );
    }
    return part;
  });
}

const MoonOrbitHtmlNarrative: React.FC<Props> = ({
  title,
  subtitle,
  sections,
  highlightTerms,
  highlightMode,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [title]);

  const renderedSections = useMemo(() => {
    return sections.map((section) => {
      const lines = Array.isArray(section.content)
        ? section.content
        : section.content
            .split("\n\n• ")
            .filter(Boolean)
            .map((l) => l.replace(/^• /, ""));
      const dateStr = section.data?.startDate
        ? `${section.data.startDate} – ${section.data.endDate || "Present"}`
        : "";
      return { ...section, lines, dateStr };
    });
  }, [sections]);

  return (
    <div className="moon-narrative">
      <div className="moon-narrative__header">
        <h2 className="moon-narrative__title">{title}</h2>
        {subtitle && (
          <p className="moon-narrative__subtitle">{subtitle}</p>
        )}
      </div>
      <div className="moon-narrative__scroll" ref={scrollRef}>
        {renderedSections.map((section) => (
          <div key={section.id} className="moon-narrative__section">
            <h3 className="moon-narrative__section-title">
              {section.title}
              {section.dateStr && (
                <span className="moon-narrative__date">
                  {section.dateStr}
                </span>
              )}
            </h3>
            <ul className="moon-narrative__list">
              {section.lines.map((line, li) => (
                <li key={li} className="moon-narrative__item">
                  {highlightText(line, highlightTerms, highlightMode)}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MoonOrbitHtmlNarrative;
