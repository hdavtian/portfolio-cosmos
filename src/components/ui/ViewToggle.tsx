import React, { useEffect, useCallback } from "react";
import "./ViewToggle.scss";

type ViewMode = "exterior" | "interior" | "cockpit";

interface Props {
  followingSpaceship: boolean;
  insideShip: boolean;
  shipViewMode: ViewMode;
  onStartFollowing?: () => void;
  onEnterShip?: () => void;
  onExitShip?: () => void;
  onGoToCockpit?: () => void;
  onGoToInterior?: () => void;
}

const VIEW_LABELS: Record<string, { label: string; icon: string }> = {
  none: { label: "Follow Ship", icon: "🚀" },
  exterior: { label: "3rd Person", icon: "🎥" },
  interior: { label: "Cabin", icon: "🪟" },
  cockpit: { label: "Cockpit", icon: "✈" },
};

const ViewToggle: React.FC<Props> = ({
  followingSpaceship,
  insideShip,
  shipViewMode,
  onStartFollowing,
  onEnterShip,
  onExitShip,
  onGoToCockpit,
  onGoToInterior,
}) => {
  // Determine the current effective view
  const currentView = !followingSpaceship
    ? "none"
    : insideShip
      ? shipViewMode
      : "exterior";

  // Cycle to the next view
  const cycleView = useCallback(() => {
    switch (currentView) {
      case "none":
        // Not following → start following (3rd person)
        onStartFollowing?.();
        break;
      case "exterior":
        // 3rd person → enter ship (cabin)
        onEnterShip?.();
        break;
      case "interior":
        // Cabin → cockpit
        onGoToCockpit?.();
        break;
      case "cockpit":
        // Cockpit → exit back to 3rd person
        onGoToInterior?.();   // first go back to interior
        setTimeout(() => {
          onExitShip?.();     // then exit
        }, 100);
        break;
    }
  }, [
    currentView,
    onStartFollowing,
    onEnterShip,
    onExitShip,
    onGoToCockpit,
    onGoToInterior,
  ]);

  // V key hotkey
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Don't capture if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.key === "v" || e.key === "V") {
        e.preventDefault();
        cycleView();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cycleView]);

  const { label, icon } = VIEW_LABELS[currentView] || VIEW_LABELS.none;

  // Determine what the NEXT view will be (for the button tooltip)
  const nextView =
    currentView === "none"
      ? "exterior"
      : currentView === "exterior"
        ? "interior"
        : currentView === "interior"
          ? "cockpit"
          : "exterior";
  const nextLabel = VIEW_LABELS[nextView]?.label || "Next View";

  return (
    <button
      className="view-toggle"
      onClick={cycleView}
      title={`Switch to ${nextLabel} (V)`}
    >
      <span className="view-toggle__icon">{icon}</span>
      <span className="view-toggle__label">{label}</span>
      <span className="view-toggle__hint">V</span>
    </button>
  );
};

export default ViewToggle;
