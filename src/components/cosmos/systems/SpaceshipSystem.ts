/**
 * Spaceship System - Manages spaceship model, flight controls, and camera following
 * Extracted from ResumeSpace3D.tsx
 */

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { ManualFlightState, KeyboardState } from "../types";

export interface SpaceshipConfig {
  modelPath: string;
  initialPosition?: THREE.Vector3;
  maxSpeed?: number;
}

export interface CameraFollowOptions {
  distance: number;
  height: number;
  lerpFactor: number;
}

/**
 * Manages spaceship loading, manual flight controls, and camera following
 */
export class SpaceshipSystem {
  private ship: THREE.Group | null = null;
  private engineLight: THREE.PointLight | null = null;
  private manualFlight: ManualFlightState;
  private keyboard: KeyboardState;
  private isManualMode: boolean = false;

  constructor() {
    this.manualFlight = {
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
      direction: { forward: 0, right: 0, up: 0 },
      turboStartTime: 0,
      isTurboActive: false,
    };

    this.keyboard = {
      ArrowUp: false,
      ArrowDown: false,
      ArrowLeft: false,
      ArrowRight: false,
      KeyZ: false,
      KeyC: false,
      KeyQ: false,
      KeyE: false,
      ShiftLeft: false,
    };
  }

  /**
   * Load spaceship GLTF model
   */
  async loadSpaceship(config: SpaceshipConfig): Promise<THREE.Group> {
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.load(
        config.modelPath,
        (gltf) => {
          this.ship = gltf.scene;

          if (config.initialPosition) {
            this.ship.position.copy(config.initialPosition);
          }

          if (config.maxSpeed) {
            this.manualFlight.maxSpeed = config.maxSpeed;
          }

          // Add engine light
          this.engineLight = new THREE.PointLight(0x6699ff, 0.5, 100);
          this.engineLight.position.set(0, 0, -5);
          this.ship.add(this.engineLight);

          // Store base emissive for materials (for boost effect)
          this.ship.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material) {
              const materials = Array.isArray(child.material)
                ? child.material
                : [child.material];
              materials.forEach((mat) => {
                if (mat.emissive && mat.emissive.getHex() > 0) {
                  mat.userData.baseEmissive = mat.emissive.clone();
                }
              });
            }
          });

          resolve(this.ship);
        },
        undefined,
        reject,
      );
    });
  }

  /**
   * Get spaceship group
   */
  getShip(): THREE.Group | null {
    return this.ship;
  }

  /**
   * Get engine light
   */
  getEngineLight(): THREE.PointLight | null {
    return this.engineLight;
  }

  /**
   * Set manual flight mode
   */
  setManualMode(enabled: boolean): void {
    this.isManualMode = enabled;

    if (!enabled) {
      // Reset manual flight state when switching to autopilot
      this.manualFlight.acceleration = 0;
      this.manualFlight.currentSpeed = 0;
      this.manualFlight.isTurboActive = false;
      this.manualFlight.turboStartTime = 0;
      this.resetVisualTilt();
    }
  }

  /**
   * Check if in manual flight mode
   */
  isManual(): boolean {
    return this.isManualMode;
  }

  /**
   * Update keyboard state
   */
  updateKeyboard(key: keyof KeyboardState, pressed: boolean): void {
    this.keyboard[key] = pressed;
  }

  /**
   * Get current keyboard state
   */
  getKeyboard(): KeyboardState {
    return { ...this.keyboard };
  }

  /**
   * Reset all keyboard states
   */
  resetKeyboard(): void {
    Object.keys(this.keyboard).forEach((key) => {
      this.keyboard[key as keyof KeyboardState] = false;
    });
  }

  /**
   * Get manual flight state
   */
  getManualFlightState(): ManualFlightState {
    return this.manualFlight;
  }

  /**
   * Reset visual tilt (pitch/yaw/roll targets to zero)
   */
  private resetVisualTilt(): void {
    this.manualFlight.targetPitch = 0;
    this.manualFlight.targetYaw = 0;
    this.manualFlight.targetRoll = 0;
  }

  /**
   * Update spaceship manual flight controls
   */
  updateManualFlight(
    controlSensitivity: number,
    invertControls: boolean,
    vlog?: (message: string) => void,
  ): void {
    if (!this.ship || !this.isManualMode) {
      return;
    }

    const baseTurnRate = 0.003;
    const turnRate = baseTurnRate * controlSensitivity;
    const springBackRate = 0.08;
    const invertMultiplier = invertControls ? -1 : 1;

    // Apply rotation based on keyboard input
    if (this.keyboard.ArrowUp) {
      this.ship.rotation.x += turnRate * invertMultiplier;
      this.manualFlight.targetPitch = 0.03 * invertMultiplier;
    } else if (this.keyboard.ArrowDown) {
      this.ship.rotation.x -= turnRate * invertMultiplier;
      this.manualFlight.targetPitch = -0.03 * invertMultiplier;
    } else {
      this.manualFlight.targetPitch = 0;
    }

    if (this.keyboard.ArrowLeft) {
      this.ship.rotation.y += turnRate * invertMultiplier;
      this.manualFlight.targetYaw = 0.03 * invertMultiplier;
    } else if (this.keyboard.ArrowRight) {
      this.ship.rotation.y -= turnRate * invertMultiplier;
      this.manualFlight.targetYaw = -0.03 * invertMultiplier;
    } else {
      this.manualFlight.targetYaw = 0;
    }

    if (this.keyboard.KeyZ) {
      this.ship.rotation.z += turnRate * 0.5;
      this.manualFlight.targetRoll = 0.03;
    } else if (this.keyboard.KeyC) {
      this.ship.rotation.z -= turnRate * 0.5;
      this.manualFlight.targetRoll = -0.03;
    } else {
      this.manualFlight.targetRoll = 0;
    }

    // Smooth visual tilt
    this.manualFlight.pitch +=
      (this.manualFlight.targetPitch - this.manualFlight.pitch) *
      springBackRate;
    this.manualFlight.yaw +=
      (this.manualFlight.targetYaw - this.manualFlight.yaw) * springBackRate;
    this.manualFlight.roll +=
      (this.manualFlight.targetRoll - this.manualFlight.roll) * springBackRate;

    // Handle acceleration
    this.manualFlight.isAccelerating = this.keyboard.ShiftLeft;

    if (this.manualFlight.isAccelerating) {
      this.manualFlight.acceleration = Math.min(
        this.manualFlight.acceleration + 0.008,
        1.0,
      );

      // Check for turbo mode (at 100% for 3 seconds)
      if (this.manualFlight.acceleration >= 1.0) {
        if (this.manualFlight.turboStartTime === 0) {
          this.manualFlight.turboStartTime = Date.now();
        } else if (
          Date.now() - this.manualFlight.turboStartTime >= 3000 &&
          !this.manualFlight.isTurboActive
        ) {
          this.manualFlight.isTurboActive = true;
          if (vlog) vlog("🔥 TURBO MODE ACTIVATED!");
        }
      } else {
        this.manualFlight.turboStartTime = 0;
        this.manualFlight.isTurboActive = false;
      }
    } else {
      this.manualFlight.acceleration = Math.max(
        this.manualFlight.acceleration - 0.005,
        0,
      );
      this.manualFlight.turboStartTime = 0;
      this.manualFlight.isTurboActive = false;
    }

    // Update speed
    const turboMultiplier = this.manualFlight.isTurboActive ? 1.5 : 1.0;
    this.manualFlight.currentSpeed =
      this.manualFlight.acceleration *
      this.manualFlight.maxSpeed *
      turboMultiplier;

    // Calculate forward direction and apply velocity
    const direction = new THREE.Vector3(0, 0, 1);
    const rotationMatrix = new THREE.Matrix4();
    rotationMatrix.makeRotationFromEuler(
      new THREE.Euler(
        this.ship.rotation.x - this.manualFlight.pitch,
        this.ship.rotation.y - this.manualFlight.yaw,
        this.ship.rotation.z - this.manualFlight.roll,
      ),
    );
    direction.applyMatrix4(rotationMatrix);
    this.ship.position.add(
      direction.multiplyScalar(this.manualFlight.currentSpeed),
    );

    // Update engine light
    this.updateEngineEffects();
  }

  /**
   * Update engine light and material effects based on acceleration
   */
  private updateEngineEffects(): void {
    if (!this.engineLight || !this.ship) {
      return;
    }

    // Update light intensity
    const baseIntensity = 0.5;
    const turboBoost = this.manualFlight.isTurboActive ? 3 : 0;
    const boostIntensity = this.manualFlight.acceleration * 8 + turboBoost;
    this.engineLight.intensity = baseIntensity + boostIntensity;

    // Update light color
    if (this.manualFlight.acceleration > 0) {
      const blueAmount = 0.3 + this.manualFlight.acceleration * 0.7;
      const turboGlow = this.manualFlight.isTurboActive ? 1.5 : 1.0;
      this.engineLight.color.setRGB(
        blueAmount * 0.3 * turboGlow,
        blueAmount * 0.6 * turboGlow,
        blueAmount * 1.0 * turboGlow,
      );
    } else {
      this.engineLight.color.set(0x6699ff);
    }

    // Update emissive materials
    this.ship.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material];
        materials.forEach((mat) => {
          if (mat.emissive && mat.emissive.getHex() > 0) {
            const baseEmissive =
              mat.userData.baseEmissive || mat.emissive.clone();
            if (!mat.userData.baseEmissive) {
              mat.userData.baseEmissive = baseEmissive;
            }
            const turboBoost = this.manualFlight.isTurboActive ? 3 : 0;
            const boostFactor =
              1 + this.manualFlight.acceleration * 6 + turboBoost;
            mat.emissive.copy(baseEmissive).multiplyScalar(boostFactor);
            mat.emissiveIntensity =
              1 + this.manualFlight.acceleration * 4 + turboBoost;
          }
        });
      }
    });
  }

  /**
   * Update camera to follow spaceship
   */
  updateCamera(
    camera: THREE.Camera,
    controls: any,
    options: CameraFollowOptions,
  ): void {
    if (!this.ship || !this.isManualMode) {
      return;
    }

    // Calculate camera position behind and above ship
    const backwardDirection = new THREE.Vector3(0, 0, -1);
    backwardDirection.applyQuaternion(this.ship.quaternion);

    const cameraTargetPos = this.ship.position
      .clone()
      .add(backwardDirection.multiplyScalar(options.distance))
      .add(new THREE.Vector3(0, options.height, 0));

    // Smooth camera follow
    camera.position.lerp(cameraTargetPos, options.lerpFactor);

    // Camera looks at ship
    controls.target.lerp(this.ship.position, options.lerpFactor);
    controls.update();
  }

  /**
   * Set spaceship position
   */
  setPosition(position: THREE.Vector3): void {
    if (this.ship) {
      this.ship.position.copy(position);
    }
  }

  /**
   * Set spaceship rotation
   */
  setRotation(rotation: THREE.Euler): void {
    if (this.ship) {
      this.ship.rotation.copy(rotation);
    }
  }

  /**
   * Dispose spaceship resources
   */
  dispose(): void {
    if (this.ship) {
      this.ship.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
          if (child.material) {
            const materials = Array.isArray(child.material)
              ? child.material
              : [child.material];
            materials.forEach((mat) => mat.dispose());
          }
        }
      });
    }
    this.ship = null;
    this.engineLight = null;
  }
}
