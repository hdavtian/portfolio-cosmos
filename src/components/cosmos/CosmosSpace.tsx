/**
 * CosmosSpace.tsx
 *
 * Main entry point for the 3D cosmos visualization.
 * Orchestrates SpaceCanvas, SpaceScene, and context providers.
 */

import React, { useRef, useState } from "react";
import { SpaceProvider } from "./context/SpaceProvider";
import { SpaceCanvas } from "./components/SpaceCanvas";
import { SpaceScene } from "./components/SpaceScene";
import CosmosLoader from "../CosmosLoader";
import type { DiagramStyleOptions } from "../DiagramSettings";

export interface CosmosSpaceProps {
  onNavigate: (section: number) => void;
  options: DiagramStyleOptions;
  onOptionsChange?: (options: DiagramStyleOptions) => void;
}

export const CosmosSpace: React.FC<CosmosSpaceProps> = ({ options }) => {
  const containerRef = useRef<HTMLDivElement>(null!);
  const [isSceneReady, setIsSceneReady] = useState(false);

  const handleSceneReady = () => {
    setIsSceneReady(true);
  };

  return (
    <SpaceProvider initialOptions={options as any}>
      <div
        ref={containerRef}
        className="cosmos-space-container"
        style={{ width: "100%", height: "100vh", position: "relative" }}
      >
        <SpaceCanvas className="cosmos-space-canvas">
          {!isSceneReady && (
            <CosmosLoader onLoadingComplete={handleSceneReady} />
          )}
        </SpaceCanvas>
        <SpaceScene containerRef={containerRef} onReady={handleSceneReady} />
      </div>
    </SpaceProvider>
  );
};

export default CosmosSpace;
