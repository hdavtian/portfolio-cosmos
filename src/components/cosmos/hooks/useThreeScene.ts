/**
 * useThreeScene - Hook for Three.js scene initialization and management
 * Wraps SceneManager system
 */

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { SceneManager } from "../systems/SceneManager";
import type { SceneRef } from "../types";

export interface ThreeSceneOptions {
  cameraFov?: number;
  cameraNear?: number;
  cameraFar?: number;
  cameraPosition?: [number, number, number];
  bloomStrength?: number;
  bloomThreshold?: number;
  bloomRadius?: number;
  sunIntensity?: number;
  ambientIntensity?: number;
  fillIntensity?: number;
}

export interface ThreeSceneResult {
  sceneRef: React.MutableRefObject<SceneRef | null>;
  isReady: boolean;
  updateSunIntensity: (intensity: number) => void;
  updateSunColor: (color: number) => void;
  setLabelsVisible: (visible: boolean) => void;
  setOrbitsVisible: (visible: boolean) => void;
}

/**
 * Initialize and manage Three.js scene with SceneManager
 */
export function useThreeScene(
  containerRef: React.RefObject<HTMLDivElement>,
  options: ThreeSceneOptions = {},
): ThreeSceneResult {
  const [isReady, setIsReady] = useState(false);
  const sceneRef = useRef<SceneRef | null>(null);
  const managerRef = useRef<SceneManager | null>(null);

  // Initialize scene
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;

    // Clear any existing content
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    try {
      // Create scene manager
      const manager = new SceneManager({
        container,
        cameraPosition: options.cameraPosition ? new THREE.Vector3(...options.cameraPosition) : undefined,
        bloomStrength: options.bloomStrength,
        bloomThreshold: options.bloomThreshold,
        bloomRadius: options.bloomRadius,
        sunIntensity: options.sunIntensity,
        ambientIntensity: options.ambientIntensity,
        fillIntensity: options.fillIntensity,
      });

      managerRef.current = manager;
      sceneRef.current = manager.getSceneRef();
      setIsReady(true);

      console.log("✅ Scene initialized successfully");
    } catch (error) {
      console.error("❌ Failed to initialize scene:", error);
    }

    // Cleanup
    return () => {
      if (managerRef.current) {
        managerRef.current.dispose();
        managerRef.current = null;
      }
      sceneRef.current = null;
      setIsReady(false);
    };
  }, [containerRef]);

  // Handle resize
  useEffect(() => {
    if (!managerRef.current || !isReady) return;

    const handleResize = () => {
      managerRef.current?.handleResize();
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isReady]);

  // Methods
  const updateSunIntensity = (intensity: number) => {
    managerRef.current?.updateSunIntensity(intensity);
  };

  const updateSunColor = (color: number) => {
    managerRef.current?.updateSunColor(typeof color === 'number' ? `#${color.toString(16).padStart(6, '0')}` : color);
  };

  const setLabelsVisible = (visible: boolean) => {
    managerRef.current?.setLabelsVisible(visible);
  };

  const setOrbitsVisible = (visible: boolean) => {
    managerRef.current?.setOrbitsVisible(visible);
  };

  return {
    sceneRef,
    isReady,
    updateSunIntensity,
    updateSunColor,
    setLabelsVisible,
    setOrbitsVisible,
  };
}
