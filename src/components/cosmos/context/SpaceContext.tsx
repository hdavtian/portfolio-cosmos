/**
 * SpaceContext.tsx
 *
 * Context provider for scene state, visibility options, and configuration.
 * Provides global access to scene settings, bloom effects, and visual toggles.
 */

import React, { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";

export interface SpaceSceneOptions {
  // Visibility toggles
  labelsVisible: boolean;
  orbitsVisible: boolean;
  haloVisible: boolean;
  overlaysVisible: boolean;

  // Bloom settings
  bloomEnabled: boolean;
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;

  // Sun settings
  sunIntensity: number;
  sunColor: string;

  // Performance settings
  orbitSpeed: number;
  autoRotate: boolean;

  // Debug settings
  debugMode: boolean;
  showStats: boolean;
}

export interface SpaceContextValue {
  // Scene options
  sceneOptions: SpaceSceneOptions;
  setSceneOptions: (options: Partial<SpaceSceneOptions>) => void;

  // Individual setters for convenience
  setLabelsVisible: (visible: boolean) => void;
  setOrbitsVisible: (visible: boolean) => void;
  setHaloVisible: (visible: boolean) => void;
  setOverlaysVisible: (visible: boolean) => void;
  setBloomEnabled: (enabled: boolean) => void;
  setBloomStrength: (strength: number) => void;
  setSunIntensity: (intensity: number) => void;
  setSunColor: (color: string) => void;
  setOrbitSpeed: (speed: number) => void;
  setAutoRotate: (enabled: boolean) => void;
  setDebugMode: (enabled: boolean) => void;

  // Reset to defaults
  resetOptions: () => void;
}

const defaultOptions: SpaceSceneOptions = {
  // Visibility
  labelsVisible: true,
  orbitsVisible: true,
  haloVisible: true,
  overlaysVisible: true,

  // Bloom
  bloomEnabled: true,
  bloomStrength: 0.8,
  bloomRadius: 0.8,
  bloomThreshold: 0.0,

  // Sun
  sunIntensity: 2.0,
  sunColor: "#FDB813",

  // Performance
  orbitSpeed: 1.0,
  autoRotate: false,

  // Debug
  debugMode: false,
  showStats: false,
};

const SpaceContext = createContext<SpaceContextValue | undefined>(undefined);

export interface SpaceContextProviderProps {
  children: ReactNode;
  initialOptions?: Partial<SpaceSceneOptions>;
}

export const SpaceContextProvider: React.FC<SpaceContextProviderProps> = ({
  children,
  initialOptions = {},
}) => {
  const [sceneOptions, setSceneOptionsState] = useState<SpaceSceneOptions>({
    ...defaultOptions,
    ...initialOptions,
  });

  const setSceneOptions = (options: Partial<SpaceSceneOptions>) => {
    setSceneOptionsState((prev) => ({ ...prev, ...options }));
  };

  const setLabelsVisible = (visible: boolean) => {
    setSceneOptions({ labelsVisible: visible });
  };

  const setOrbitsVisible = (visible: boolean) => {
    setSceneOptions({ orbitsVisible: visible });
  };

  const setHaloVisible = (visible: boolean) => {
    setSceneOptions({ haloVisible: visible });
  };

  const setOverlaysVisible = (visible: boolean) => {
    setSceneOptions({ overlaysVisible: visible });
  };

  const setBloomEnabled = (enabled: boolean) => {
    setSceneOptions({ bloomEnabled: enabled });
  };

  const setBloomStrength = (strength: number) => {
    setSceneOptions({ bloomStrength: strength });
  };

  const setSunIntensity = (intensity: number) => {
    setSceneOptions({ sunIntensity: intensity });
  };

  const setSunColor = (color: string) => {
    setSceneOptions({ sunColor: color });
  };

  const setOrbitSpeed = (speed: number) => {
    setSceneOptions({ orbitSpeed: speed });
  };

  const setAutoRotate = (enabled: boolean) => {
    setSceneOptions({ autoRotate: enabled });
  };

  const setDebugMode = (enabled: boolean) => {
    setSceneOptions({ debugMode: enabled });
  };

  const resetOptions = () => {
    setSceneOptionsState(defaultOptions);
  };

  const value: SpaceContextValue = {
    sceneOptions,
    setSceneOptions,
    setLabelsVisible,
    setOrbitsVisible,
    setHaloVisible,
    setOverlaysVisible,
    setBloomEnabled,
    setBloomStrength,
    setSunIntensity,
    setSunColor,
    setOrbitSpeed,
    setAutoRotate,
    setDebugMode,
    resetOptions,
  };

  return (
    <SpaceContext.Provider value={value}>{children}</SpaceContext.Provider>
  );
};

// Custom hook for consuming context
export const useSpaceContext = (): SpaceContextValue => {
  const context = useContext(SpaceContext);
  if (!context) {
    throw new Error("useSpaceContext must be used within SpaceContextProvider");
  }
  return context;
};
