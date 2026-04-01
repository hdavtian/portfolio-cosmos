import React, { useCallback, useRef, useEffect } from "react";
import gsap from "gsap";
import type { JobTechEntry } from "../CosmicContentOverlay";

interface Props {
  techEntries: JobTechEntry[];
  hoveredIndex: number | null;
  lockedIndex: number | null;
  onHover: (index: number | null) => void;
  onSelect: (index: number) => void;
}

const MoonOrbitHtmlTechChips: React.FC<Props> = ({
  techEntries,
  hoveredIndex,
  lockedIndex,
  onHover,
  onSelect,
}) => {
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleClick = useCallback(
    (index: number) => {
      onSelect(index);
      const el = chipRefs.current[index];
      if (el) {
        gsap.fromTo(el, { scale: 0.93 }, { scale: 1, duration: 0.25, ease: "back.out(2)" });
      }
    },
    [onSelect],
  );

  const handleEnter = useCallback(
    (index: number) => {
      onHover(index);
      const el = chipRefs.current[index];
      if (el) {
        gsap.to(el, { x: 3, duration: 0.18, ease: "power2.out" });
      }
    },
    [onHover],
  );

  const handleLeave = useCallback(
    (index: number) => {
      onHover(null);
      const el = chipRefs.current[index];
      if (el) {
        gsap.to(el, { x: 0, duration: 0.18, ease: "power2.out" });
      }
    },
    [onHover],
  );

  useEffect(() => {
    chipRefs.current = chipRefs.current.slice(0, techEntries.length);
  }, [techEntries.length]);

  return (
    <div className="moon-tech">
      <div className="moon-tech__label">TECHNOLOGIES</div>
      <div className="moon-tech__list">
        {techEntries.map((entry, i) => {
          const isHovered = hoveredIndex === i;
          const isLocked = lockedIndex === i;
          const isActive = isHovered || isLocked;
          return (
            <button
              key={i}
              ref={(el) => { chipRefs.current[i] = el; }}
              className={[
                "moon-tech__chip",
                isActive ? "moon-tech__chip--active" : "",
                isLocked ? "moon-tech__chip--locked" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onPointerEnter={() => handleEnter(i)}
              onPointerLeave={() => handleLeave(i)}
              onClick={() => handleClick(i)}
            >
              <span className="moon-tech__chip-dot" />
              {entry.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default MoonOrbitHtmlTechChips;
