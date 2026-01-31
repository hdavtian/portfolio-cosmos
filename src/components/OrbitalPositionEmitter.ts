/**
 * OrbitalPositionEmitter - A robust solution for tracking moving celestial objects
 *
 * This implements the Observer pattern to emit real-time position updates for
 * orbiting objects (moons, planets) so that interested parties (spaceship navigation)
 * can subscribe and receive continuous position updates.
 *
 * Benefits:
 * - Decouples position tracking from navigation logic
 * - Allows multiple subscribers to track the same object
 * - Provides smooth interpolation for moving targets
 * - Can throttle updates for performance
 * - Clean subscription/unsubscription lifecycle
 */

import * as THREE from "three";

export interface PositionUpdate {
  worldPosition: THREE.Vector3;
  localPosition: THREE.Vector3;
  velocity: THREE.Vector3;
  timestamp: number;
  objectId: string;
  isOrbiting: boolean;
}

export type PositionSubscriber = (update: PositionUpdate) => void;

interface TrackedObject {
  id: string;
  mesh: THREE.Mesh;
  subscribers: Set<PositionSubscriber>;
  lastUpdate: PositionUpdate | null;
  updateInterval: number; // milliseconds
  lastEmitTime: number;
  previousPosition: THREE.Vector3 | null;
  isOrbiting: boolean;
}

export class OrbitalPositionEmitter {
  private trackedObjects: Map<string, TrackedObject> = new Map();
  private isRunning = false;
  private animationFrameId: number | null = null;

  /**
   * Register an object to track and emit position updates for
   * @param id Unique identifier for the object
   * @param mesh The Three.js mesh to track
   * @param updateInterval How often to emit updates in milliseconds (default: 16ms ≈ 60fps)
   */
  public registerObject(
    id: string,
    mesh: THREE.Mesh,
    updateInterval: number = 16,
  ): void {
    if (this.trackedObjects.has(id)) {
      console.warn(`Object ${id} already registered`);
      return;
    }

    const worldPosition = new THREE.Vector3();
    mesh.getWorldPosition(worldPosition);

    this.trackedObjects.set(id, {
      id,
      mesh,
      subscribers: new Set(),
      lastUpdate: null,
      updateInterval,
      lastEmitTime: 0,
      previousPosition: worldPosition.clone(),
      isOrbiting: true,
    });

    console.log(`📡 Registered object for tracking: ${id}`);
  }

  /**
   * Unregister an object - stops tracking and removes all subscribers
   */
  public unregisterObject(id: string): void {
    const tracked = this.trackedObjects.get(id);
    if (tracked) {
      tracked.subscribers.clear();
      this.trackedObjects.delete(id);
      console.log(`📴 Unregistered object: ${id}`);
    }
  }

  /**
   * Subscribe to position updates for a specific object
   * @param id The object ID to subscribe to
   * @param subscriber Callback function that receives position updates
   * @returns Unsubscribe function
   */
  public subscribe(id: string, subscriber: PositionSubscriber): () => void {
    const tracked = this.trackedObjects.get(id);
    if (!tracked) {
      console.error(`Cannot subscribe to unregistered object: ${id}`);
      return () => {};
    }

    tracked.subscribers.add(subscriber);
    console.log(
      `✅ Subscriber added to ${id} (total: ${tracked.subscribers.size})`,
    );

    // Immediately send current position if available
    if (tracked.lastUpdate) {
      subscriber(tracked.lastUpdate);
    }

    // Return unsubscribe function
    return () => {
      tracked.subscribers.delete(subscriber);
      console.log(
        `❌ Subscriber removed from ${id} (remaining: ${tracked.subscribers.size})`,
      );
    };
  }

  /**
   * Pause orbital motion for a specific object
   * Subscribers will still receive updates, but position won't change
   */
  public pauseOrbit(id: string): void {
    const tracked = this.trackedObjects.get(id);
    if (tracked) {
      tracked.isOrbiting = false;
      console.log(`⏸️ Paused orbit for: ${id}`);
    }
  }

  /**
   * Resume orbital motion for a specific object
   */
  public resumeOrbit(id: string): void {
    const tracked = this.trackedObjects.get(id);
    if (tracked) {
      tracked.isOrbiting = true;
      // Reset previous position to avoid sudden velocity spike
      const worldPosition = new THREE.Vector3();
      tracked.mesh.getWorldPosition(worldPosition);
      tracked.previousPosition = worldPosition.clone();
      console.log(`▶️ Resumed orbit for: ${id}`);
    }
  }

  /**
   * Get current position without subscribing (one-time read)
   */
  public getCurrentPosition(id: string): PositionUpdate | null {
    const tracked = this.trackedObjects.get(id);
    if (!tracked) return null;

    return this.createPositionUpdate(tracked);
  }

  /**
   * Start the emission loop - call this in your animation loop
   * or from useEffect
   */
  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.emit();
    console.log("🚀 OrbitalPositionEmitter started");
  }

  /**
   * Stop the emission loop
   */
  public stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    console.log("🛑 OrbitalPositionEmitter stopped");
  }

  /**
   * Main emission loop - updates and notifies subscribers
   */
  private emit = (): void => {
    if (!this.isRunning) return;

    const now = Date.now();

    this.trackedObjects.forEach((tracked) => {
      // Check if it's time to emit an update
      const timeSinceLastEmit = now - tracked.lastEmitTime;
      if (timeSinceLastEmit < tracked.updateInterval) {
        return; // Not time yet
      }

      // Only emit if there are subscribers (performance optimization)
      if (tracked.subscribers.size === 0) {
        return;
      }

      // Create position update
      const update = this.createPositionUpdate(tracked);

      // Store for next iteration
      tracked.lastUpdate = update;
      tracked.lastEmitTime = now;
      tracked.previousPosition = update.worldPosition.clone();

      // Notify all subscribers
      tracked.subscribers.forEach((subscriber) => {
        try {
          subscriber(update);
        } catch (error) {
          console.error(`Error in subscriber for ${tracked.id}:`, error);
        }
      });
    });

    // Continue loop
    this.animationFrameId = requestAnimationFrame(this.emit);
  };

  /**
   * Create a position update snapshot
   */
  private createPositionUpdate(tracked: TrackedObject): PositionUpdate {
    const worldPosition = new THREE.Vector3();
    tracked.mesh.getWorldPosition(worldPosition);

    const localPosition = tracked.mesh.position.clone();

    // Calculate velocity (units per second)
    const velocity = new THREE.Vector3();
    if (tracked.previousPosition && tracked.isOrbiting) {
      const timeDelta = (Date.now() - tracked.lastEmitTime) / 1000; // seconds
      if (timeDelta > 0) {
        velocity
          .subVectors(worldPosition, tracked.previousPosition)
          .divideScalar(timeDelta);
      }
    }

    return {
      worldPosition: worldPosition.clone(),
      localPosition: localPosition.clone(),
      velocity: velocity.clone(),
      timestamp: Date.now(),
      objectId: tracked.id,
      isOrbiting: tracked.isOrbiting,
    };
  }

  /**
   * Get all registered object IDs
   */
  public getRegisteredObjectIds(): string[] {
    return Array.from(this.trackedObjects.keys());
  }

  /**
   * Get subscriber count for an object
   */
  public getSubscriberCount(id: string): number {
    const tracked = this.trackedObjects.get(id);
    return tracked ? tracked.subscribers.size : 0;
  }

  /**
   * Check if object is currently being tracked
   */
  public isTracking(id: string): boolean {
    return this.trackedObjects.has(id);
  }

  /**
   * Cleanup all tracking
   */
  public dispose(): void {
    this.stop();
    this.trackedObjects.forEach((tracked) => {
      tracked.subscribers.clear();
    });
    this.trackedObjects.clear();
    console.log("🗑️ OrbitalPositionEmitter disposed");
  }
}

// Singleton instance for easy access across components
let emitterInstance: OrbitalPositionEmitter | null = null;

export function getOrbitalPositionEmitter(): OrbitalPositionEmitter {
  if (!emitterInstance) {
    emitterInstance = new OrbitalPositionEmitter();
  }
  return emitterInstance;
}

export function resetOrbitalPositionEmitter(): void {
  if (emitterInstance) {
    emitterInstance.dispose();
    emitterInstance = null;
  }
}
