/**
 * SpaceCanvas.tsx
 *
 * Canvas wrapper component handling DOM events, resize, touch gestures,
 * and fullscreen management. Provides a clean container for the Three.js scene.
 */

import React, { useEffect, useRef, useCallback, useState } from "react";
import "./SpaceCanvas.scss";

export interface SpaceCanvasProps {
  children?: React.ReactNode;
  onResize?: (width: number, height: number) => void;
  onPointerMove?: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp?: (event: React.PointerEvent<HTMLDivElement>) => void;
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  enablePointerLock?: boolean;
  enableFullscreen?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

export const SpaceCanvas: React.FC<SpaceCanvasProps> = ({
  children,
  onResize,
  onPointerMove,
  onPointerDown,
  onPointerUp,
  onClick,
  enablePointerLock = false,
  enableFullscreen = false,
  style,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPointerLocked, setIsPointerLocked] = useState(false);

  // Handle window resize
  useEffect(() => {
    if (!onResize) return;

    const handleResize = () => {
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        onResize(clientWidth, clientHeight);
      }
    };

    // Initial size
    handleResize();

    // Listen for resize events
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [onResize]);

  // Handle touch gestures (prevent default browser behaviors)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const preventDefaultTouch = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        e.preventDefault(); // Prevent pinch-zoom
      }
    };

    container.addEventListener("touchstart", preventDefaultTouch, {
      passive: false,
    });
    container.addEventListener("touchmove", preventDefaultTouch, {
      passive: false,
    });

    return () => {
      container.removeEventListener("touchstart", preventDefaultTouch);
      container.removeEventListener("touchmove", preventDefaultTouch);
    };
  }, []);

  // Handle pointer lock
  useEffect(() => {
    if (!enablePointerLock) return;

    const handlePointerLockChange = () => {
      setIsPointerLocked(document.pointerLockElement === containerRef.current);
    };

    document.addEventListener("pointerlockchange", handlePointerLockChange);

    return () => {
      document.removeEventListener(
        "pointerlockchange",
        handlePointerLockChange,
      );
      if (document.pointerLockElement === containerRef.current) {
        document.exitPointerLock();
      }
    };
  }, [enablePointerLock]);

  // Handle fullscreen
  useEffect(() => {
    if (!enableFullscreen) return;

    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      if (document.fullscreenElement === containerRef.current) {
        document.exitFullscreen();
      }
    };
  }, [enableFullscreen]);

  // Request pointer lock
  const requestPointerLock = useCallback(() => {
    if (enablePointerLock && containerRef.current && !isPointerLocked) {
      containerRef.current.requestPointerLock();
    }
  }, [enablePointerLock, isPointerLocked]);

  // Exit pointer lock
  const exitPointerLock = useCallback(() => {
    if (isPointerLocked) {
      document.exitPointerLock();
    }
  }, [isPointerLocked]);

  // Toggle fullscreen
  const toggleFullscreen = useCallback(() => {
    if (!enableFullscreen || !containerRef.current) return;

    if (isFullscreen) {
      document.exitFullscreen();
    } else {
      containerRef.current.requestFullscreen();
    }
  }, [enableFullscreen, isFullscreen]);

  // Style merging: allow parent to override defaults
  const combinedClassName = `space-canvas ${className || ""}`.trim();
  const combinedStyle: React.CSSProperties = {
    ...style,
  };

  return (
    <div
      ref={containerRef}
      className={combinedClassName}
      style={combinedStyle}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onClick={onClick}
      tabIndex={0} // Make focusable for keyboard events
    >
      {children}

      {/* Hidden controls for pointer lock (if needed programmatically) */}
      {enablePointerLock && (
        <div style={{ display: "none" }}>
          <button onClick={requestPointerLock}>Lock Pointer</button>
          <button onClick={exitPointerLock}>Exit Pointer Lock</button>
        </div>
      )}

      {enableFullscreen && (
        <button
          onClick={toggleFullscreen}
          className="space-canvas__fullscreen-button"
        >
          {isFullscreen ? "⤓ Exit Fullscreen" : "⤢ Fullscreen"}
        </button>
      )}
    </div>
  );
};

// Hook to access canvas controls from anywhere
export const useCanvasControls = () => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPointerLocked, setIsPointerLocked] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    const handlePointerLockChange = () => {
      setIsPointerLocked(!!document.pointerLockElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("pointerlockchange", handlePointerLockChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener(
        "pointerlockchange",
        handlePointerLockChange,
      );
    };
  }, []);

  return {
    isFullscreen,
    isPointerLocked,
  };
};
