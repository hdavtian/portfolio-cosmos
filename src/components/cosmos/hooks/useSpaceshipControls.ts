/**
 * useSpaceshipControls - Hook for spaceship loading and flight controls
 * Wraps SpaceshipSystem
 */

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { SpaceshipSystem } from "../systems/SpaceshipSystem";
import type {
  SpaceshipConfig,
  CameraFollowOptions,
} from "../systems/SpaceshipSystem";
import type { ManualFlightState, KeyboardState } from "../types";

export interface SpaceshipControlsOptions {
  modelPath: string;
  initialPosition?: THREE.Vector3;
  maxSpeed?: number;
  autoLoad?: boolean;
}

export interface SpaceshipControlsResult {
  ship: THREE.Group | null;
  isLoaded: boolean;
  isManualMode: boolean;
  keyboard: KeyboardState;
  flightState: ManualFlightState;
  setManualMode: (enabled: boolean) => void;
  updateManualFlight: (
    sensitivity: number,
    invert: boolean,
    vlog?: (msg: string) => void,
  ) => void;
  updateCamera: (
    camera: THREE.Camera,
    controls: any,
    options: CameraFollowOptions,
  ) => void;
  loadSpaceship: () => Promise<void>;
}

/**
 * Manage spaceship loading and flight controls
 */
export function useSpaceshipControls(
  options: SpaceshipControlsOptions,
): SpaceshipControlsResult {
  const [ship, setShip] = useState<THREE.Group | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isManualMode, setIsManualMode] = useState(false);
  const [_keyboardTrigger, setKeyboardTrigger] = useState(0);
  const systemRef = useRef<SpaceshipSystem | null>(null);

  // Initialize system
  if (!systemRef.current) {
    systemRef.current = new SpaceshipSystem();
  }

  // Load spaceship
  const loadSpaceship = useCallback(async () => {
    if (!systemRef.current || isLoaded) return;

    try {
      const config: SpaceshipConfig = {
        modelPath: options.modelPath,
        initialPosition: options.initialPosition,
        maxSpeed: options.maxSpeed,
      };

      const loadedShip = await systemRef.current.loadSpaceship(config);
      setShip(loadedShip);
      setIsLoaded(true);
      console.log("🚀 Spaceship loaded successfully");
    } catch (error) {
      console.error("❌ Failed to load spaceship:", error);
    }
  }, [options.modelPath, options.initialPosition, options.maxSpeed, isLoaded]);

  // Auto-load if enabled
  useEffect(() => {
    if (options.autoLoad && !isLoaded) {
      loadSpaceship();
    }
  }, [options.autoLoad, isLoaded, loadSpaceship]);

  // Keyboard event handlers
  useEffect(() => {
    if (!isManualMode || !systemRef.current) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.code as keyof KeyboardState;
      if (key in systemRef.current!.getKeyboard()) {
        e.preventDefault();
        e.stopPropagation();
        systemRef.current!.updateKeyboard(key, true);
        setKeyboardTrigger((prev) => prev + 1);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.code as keyof KeyboardState;
      if (key in systemRef.current!.getKeyboard()) {
        e.preventDefault();
        e.stopPropagation();
        systemRef.current!.updateKeyboard(key, false);
        setKeyboardTrigger((prev) => prev + 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    window.addEventListener("keyup", handleKeyUp, { capture: true });

    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      window.removeEventListener("keyup", handleKeyUp, { capture: true });
      systemRef.current?.resetKeyboard();
    };
  }, [isManualMode]);

  // Set manual mode
  const setManualMode = useCallback((enabled: boolean) => {
    systemRef.current?.setManualMode(enabled);
    setIsManualMode(enabled);
  }, []);

  // Update manual flight
  const updateManualFlight = useCallback(
    (sensitivity: number, invert: boolean, vlog?: (msg: string) => void) => {
      systemRef.current?.updateManualFlight(sensitivity, invert, vlog);
    },
    [],
  );

  // Update camera
  const updateCamera = useCallback(
    (camera: THREE.Camera, controls: any, options: CameraFollowOptions) => {
      systemRef.current?.updateCamera(camera, controls, options);
    },
    [],
  );

  // Cleanup
  useEffect(() => {
    return () => {
      systemRef.current?.dispose();
    };
  }, []);

  return {
    ship,
    isLoaded,
    isManualMode,
    keyboard: systemRef.current?.getKeyboard() || {
      ArrowUp: false,
      ArrowDown: false,
      ArrowLeft: false,
      ArrowRight: false,
      KeyZ: false,
      KeyC: false,
      ShiftLeft: false,
    },
    flightState: systemRef.current?.getManualFlightState() || {
      velocity: new THREE.Vector3(),
      acceleration: 0,
      maxSpeed: 0.8,
      currentSpeed: 0,
      pitch: 0,
      yaw: 0,
      roll: 0,
      targetPitch: 0,
      targetYaw: 0,
      targetRoll: 0,
      isAccelerating: false,
      turboStartTime: 0,
      isTurboActive: false,
    },
    setManualMode,
    updateManualFlight,
    updateCamera,
    loadSpaceship,
  };
}
