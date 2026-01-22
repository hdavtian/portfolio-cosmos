import * as THREE from "three";
import { gsap } from "gsap";

export interface CameraTarget {
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
  duration?: number;
  ease?: string;
  onComplete?: () => void;
}

export interface NavigationWaypoint {
  id: string;
  name: string;
  target: CameraTarget;
  content?: any;
  narration?: string;
  effects?: string[];
}

export class CosmosCameraDirector {
  private camera: THREE.PerspectiveCamera;
  private controls: any; // OrbitControls
  private isAnimating = false;
  private currentTween?: gsap.core.Tween;

  constructor(camera: THREE.PerspectiveCamera, controls: any) {
    this.camera = camera;
    this.controls = controls;
  }

  // Smooth camera movement to target
  public flyTo(target: CameraTarget): Promise<void> {
    return new Promise((resolve) => {
      if (this.isAnimating) {
        this.currentTween?.kill();
      }

      this.isAnimating = true;
      this.controls.enabled = false;

      const startPosition = this.camera.position.clone();
      const startTarget = this.controls.target.clone();

      this.currentTween = gsap.to(
        {},
        {
          duration: target.duration || 2,
          ease: target.ease || "power2.inOut",
          onUpdate: () => {
            const progress = this.currentTween?.progress() || 0;

            // Interpolate camera position
            const currentPosition = new THREE.Vector3().lerpVectors(
              startPosition,
              target.position,
              progress,
            );

            // Interpolate look-at target
            const currentLookAt = new THREE.Vector3().lerpVectors(
              startTarget,
              target.lookAt,
              progress,
            );

            this.camera.position.copy(currentPosition);
            this.controls.target.copy(currentLookAt);
            this.controls.update();
          },
          onComplete: () => {
            this.isAnimating = false;
            this.controls.enabled = true;
            target.onComplete?.();
            resolve();
          },
        },
      );
    });
  }

  // Orbital camera movement around target
  public orbitAround(
    center: THREE.Vector3,
    radius: number,
    duration: number = 5,
  ): Promise<void> {
    return new Promise((resolve) => {
      if (this.isAnimating) {
        this.currentTween?.kill();
      }

      this.isAnimating = true;
      this.controls.enabled = false;

      const startAngle = Math.atan2(
        this.camera.position.z - center.z,
        this.camera.position.x - center.x,
      );

      this.currentTween = gsap.to(
        {},
        {
          duration,
          ease: "none",
          onUpdate: () => {
            const progress = this.currentTween?.progress() || 0;
            const angle = startAngle + Math.PI * 2 * progress;

            const x = center.x + Math.cos(angle) * radius;
            const z = center.z + Math.sin(angle) * radius;

            this.camera.position.set(x, this.camera.position.y, z);
            this.camera.lookAt(center);
            this.controls.target.copy(center);
            this.controls.update();
          },
          onComplete: () => {
            this.isAnimating = false;
            this.controls.enabled = true;
            resolve();
          },
        },
      );
    });
  }

  // Cinematic approach to object
  public cinematicApproach(
    target: THREE.Object3D,
    finalDistance: number,
    approachHeight: number = 200,
  ): Promise<void> {
    const targetPosition = target.position.clone();

    // Phase 1: High approach
    const highApproach = new THREE.Vector3(
      targetPosition.x,
      targetPosition.y + approachHeight,
      targetPosition.z + finalDistance * 2,
    );

    // Phase 2: Descending orbit
    const orbitPosition = new THREE.Vector3(
      targetPosition.x + finalDistance,
      targetPosition.y + 50,
      targetPosition.z,
    );

    // Phase 3: Final position
    const finalPosition = new THREE.Vector3(
      targetPosition.x + finalDistance * 0.7,
      targetPosition.y + 30,
      targetPosition.z + finalDistance * 0.7,
    );

    return this.flyTo({
      position: highApproach,
      lookAt: targetPosition,
      duration: 1.5,
      ease: "power2.out",
    })
      .then(() =>
        this.flyTo({
          position: orbitPosition,
          lookAt: targetPosition,
          duration: 1.0,
          ease: "power2.inOut",
        }),
      )
      .then(() =>
        this.flyTo({
          position: finalPosition,
          lookAt: targetPosition,
          duration: 1.0,
          ease: "power2.in",
        }),
      );
  }

  // Quick system overview
  public systemOverview(): Promise<void> {
    const overviewPosition = new THREE.Vector3(0, 800, 1200);
    const centerLookAt = new THREE.Vector3(0, 0, 0);

    return this.flyTo({
      position: overviewPosition,
      lookAt: centerLookAt,
      duration: 2.5,
      ease: "power3.out",
    });
  }

  // Focus on specific planet
  public focusPlanet(
    planetMesh: THREE.Object3D,
    distance: number = 300,
  ): Promise<void> {
    const planetPos = planetMesh.position.clone();
    const focusPosition = new THREE.Vector3(
      planetPos.x + distance * 0.8,
      planetPos.y + distance * 0.5,
      planetPos.z + distance * 0.6,
    );

    return this.flyTo({
      position: focusPosition,
      lookAt: planetPos,
      duration: 2.0,
      ease: "power2.inOut",
    });
  }

  // Stop any current animation
  public stop(): void {
    if (this.currentTween) {
      this.currentTween.kill();
      this.isAnimating = false;
      this.controls.enabled = true;
    }
  }

  public get isCurrentlyAnimating(): boolean {
    return this.isAnimating;
  }
}

// Guided tour system
export class CosmicTourGuide {
  private cameraDirector: CosmosCameraDirector;
  private waypoints: NavigationWaypoint[] = [];
  private currentWaypointIndex = 0;
  private isActive = false;
  private onContentDisplay?: (waypoint: NavigationWaypoint) => void;

  constructor(
    cameraDirector: CosmosCameraDirector,
    onContentDisplay?: (waypoint: NavigationWaypoint) => void,
  ) {
    this.cameraDirector = cameraDirector;
    this.onContentDisplay = onContentDisplay;
  }

  public startTour(waypoints: NavigationWaypoint[]): void {
    this.waypoints = waypoints;
    this.currentWaypointIndex = 0;
    this.isActive = true;
    this.visitNextWaypoint();
  }

  public stopTour(): void {
    this.isActive = false;
    this.cameraDirector.stop();
  }

  public nextWaypoint(): void {
    if (
      !this.isActive ||
      this.currentWaypointIndex >= this.waypoints.length - 1
    )
      return;
    this.currentWaypointIndex++;
    this.visitNextWaypoint();
  }

  public previousWaypoint(): void {
    if (!this.isActive || this.currentWaypointIndex <= 0) return;
    this.currentWaypointIndex--;
    this.visitNextWaypoint();
  }

  private async visitNextWaypoint(): Promise<void> {
    if (!this.isActive) return;

    const waypoint = this.waypoints[this.currentWaypointIndex];
    if (!waypoint) return;

    // Animate to waypoint
    await this.cameraDirector.flyTo(waypoint.target);

    // Display content
    this.onContentDisplay?.(waypoint);

    // Auto-continue after delay (can be overridden)
    if (
      this.isActive &&
      this.currentWaypointIndex < this.waypoints.length - 1
    ) {
      setTimeout(() => {
        if (this.isActive) {
          this.nextWaypoint();
        }
      }, 5000); // 5 second delay between waypoints
    }
  }

  public get currentWaypoint(): NavigationWaypoint | undefined {
    return this.waypoints[this.currentWaypointIndex];
  }

  public get progress(): number {
    return this.waypoints.length > 0
      ? this.currentWaypointIndex / (this.waypoints.length - 1)
      : 0;
  }
}

// Audio System Controller
export class CosmicAudioSystem {
  private audioElement: HTMLAudioElement | null = null;
  private currentTrack: string = "";
  private volume: number = 0.3;
  private audioTracks: Record<string, string> = {
    "cosmic-journey": "/audio/cosmic-journey.mp3",
    "stellar-winds": "/audio/stellar-winds.mp3",
    "deep-space": "/audio/deep-space.mp3",
    "galactic-ambience": "/audio/galactic-ambience.mp3",
  };

  constructor() {
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    window.addEventListener("cosmicAudioChange", (e) => {
      const event = e as CustomEvent;
      this.playTrack(event.detail.track);
    });

    window.addEventListener("cosmicVolumeChange", (e) => {
      const event = e as CustomEvent;
      this.setVolume(event.detail.volume);
    });
  }

  public playTrack(trackName: string): void {
    if (this.currentTrack === trackName) return;

    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement = null;
    }

    if (trackName && this.audioTracks[trackName]) {
      this.audioElement = new Audio(this.audioTracks[trackName]);
      this.audioElement.volume = this.volume;
      this.audioElement.loop = true;
      this.audioElement.play().catch((e) => {
        console.log("Audio play failed (user interaction required):", e);
      });
      this.currentTrack = trackName;
    } else {
      this.currentTrack = "";
    }
  }

  public setVolume(volume: number): void {
    this.volume = volume;
    if (this.audioElement) {
      this.audioElement.volume = volume;
    }
  }
}

// Navigation UI Controller
export class NavigationInterface {
  private container: HTMLElement;
  private onNavigate?: (target: string) => void;
  private audioSystem: CosmicAudioSystem;

  constructor(container: HTMLElement, onNavigate?: (target: string) => void) {
    this.container = container;
    this.onNavigate = onNavigate;
    this.audioSystem = new CosmicAudioSystem();
    this.createInterface();
  }

  private createInterface(): void {
    const navHTML = `
      <div class="cosmic-navigation" style="
        position: absolute;
        top: 20px;
        left: 20px;
        z-index: 1000;
        background: rgba(0, 0, 0, 0.8);
        border: 2px solid rgba(212, 175, 55, 0.6);
        border-radius: 12px;
        padding: 20px;
        backdrop-filter: blur(10px);
        font-family: 'Cinzel', serif;
        color: rgba(212, 175, 55, 0.9);
        min-width: 250px;
      ">
        <h3 style="margin: 0 0 15px 0; text-align: center;">Cosmic Navigator</h3>
        
        <div class="navigation-modes" style="margin-bottom: 20px;">
          <button class="nav-button active" data-mode="free">Free Flight</button>
          <button class="nav-button" data-mode="guided">Guided Tour</button>
          <button class="nav-button" data-mode="overview">Galaxy Map</button>
        </div>

        <div class="quick-nav" style="margin-bottom: 20px;">
          <h4 style="margin: 0 0 10px 0; font-size: 14px;">Quick Navigation</h4>
          <button class="target-button" data-target="home">🏠 Home</button>
          <button class="target-button" data-target="about">👨‍💻 About Harma</button>
          <button class="target-button experience-main" data-target="experience">🌍 Experience</button>
          <div class="experience-submenu" style="display: none; margin-left: 20px; margin-top: 5px;">
            <button class="target-button submenu-item" data-target="experience-investcloud" data-company="InvestCloud Inc.">🏢 InvestCloud</button>
            <button class="target-button submenu-item" data-target="experience-boingo" data-company="Boingo">📡 Boingo</button>
          </div>
          <button class="target-button" data-target="skills">⚡ Skills</button>
          <button class="target-button" data-target="projects">🚀 Projects</button>
        </div>
        
        <div class="audio-controls" style="margin-bottom: 20px;">
          <h4 style="margin: 0 0 10px 0; font-size: 14px;">Cosmic Audio</h4>
          <select class="audio-selector" style="width: 100%; margin-bottom: 10px; padding: 5px; background: rgba(0,0,0,0.8); color: rgba(212, 175, 55, 0.9); border: 1px solid rgba(212, 175, 55, 0.5); border-radius: 4px;">
            <option value="">🔇 Silence</option>
            <option value="cosmic-journey">🌌 Cosmic Journey</option>
            <option value="stellar-winds">⭐ Stellar Winds</option>
            <option value="deep-space">🌠 Deep Space</option>
            <option value="galactic-ambience">🌍 Galactic Ambience</option>
          </select>
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 12px;">🔊</span>
            <input type="range" class="volume-slider" min="0" max="100" value="30" style="flex: 1;">
            <span class="volume-display" style="font-size: 12px;">30%</span>
          </div>
        </div>


      </div>
    `;

    this.container.insertAdjacentHTML("beforeend", navHTML);
    this.attachEventListeners();
    this.addStyles();
  }

  private attachEventListeners(): void {
    // Navigation mode switching
    this.container.querySelectorAll(".nav-button").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const mode = (e.target as HTMLElement).dataset.mode;
        this.switchMode(mode);
      });
    });

    // Quick navigation
    this.container.querySelectorAll(".target-button").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const target = (e.target as HTMLElement).dataset.target;

        // Handle experience submenu toggle
        if (target === "experience") {
          const submenu = this.container.querySelector(
            ".experience-submenu",
          ) as HTMLElement;
          if (submenu) {
            const isVisible = submenu.style.display !== "none";
            submenu.style.display = isVisible ? "none" : "block";
            if (!isVisible) {
              // Also navigate to experience overview
              this.onNavigate?.(target || "");
            }
          }
          return;
        }

        this.onNavigate?.(target || "");
      });
    });

    // Audio controls
    const audioSelector = this.container.querySelector(
      ".audio-selector",
    ) as HTMLSelectElement;
    const volumeSlider = this.container.querySelector(
      ".volume-slider",
    ) as HTMLInputElement;
    const volumeDisplay = this.container.querySelector(
      ".volume-display",
    ) as HTMLElement;

    if (audioSelector) {
      audioSelector.addEventListener("change", (e) => {
        this.handleAudioChange((e.target as HTMLSelectElement).value);
      });
    }

    if (volumeSlider && volumeDisplay) {
      volumeSlider.addEventListener("input", (e) => {
        const volume = (e.target as HTMLInputElement).value;
        volumeDisplay.textContent = `${volume}%`;
        this.handleVolumeChange(parseFloat(volume) / 100);
      });
    }

    // Tour controls - removed for simplification
  }

  private switchMode(mode?: string): void {
    // Update active button
    this.container.querySelectorAll(".nav-button").forEach((btn) => {
      btn.classList.remove("active");
    });

    const activeBtn = this.container.querySelector(`[data-mode="${mode}"]`);
    activeBtn?.classList.add("active");
  }

  private handleAudioChange(audioTrack: string): void {
    // Use the audio system directly
    this.audioSystem.playTrack(audioTrack);
  }

  private handleVolumeChange(volume: number): void {
    // Use the audio system directly
    this.audioSystem.setVolume(volume);
  }

  private addStyles(): void {
    const styles = `
      <style>
        .nav-button, .target-button, .control-btn {
          background: rgba(212, 175, 55, 0.2);
          border: 1px solid rgba(212, 175, 55, 0.5);
          color: rgba(212, 175, 55, 0.9);
          padding: 8px 12px;
          margin: 2px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 12px;
          transition: all 0.2s ease;
          font-family: inherit;
        }
        
        .nav-button:hover, .target-button:hover, .control-btn:hover {
          background: rgba(212, 175, 55, 0.4);
          transform: scale(1.05);
        }
        
        .nav-button.active {
          background: rgba(212, 175, 55, 0.6);
          box-shadow: 0 0 10px rgba(212, 175, 55, 0.4);
        }
        
        .navigation-modes {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
        }
        
        .target-button {
          display: block;
          width: 100%;
          margin-bottom: 5px;
          text-align: left;
        }
        
        .submenu-item {
          font-size: 11px;
          padding: 6px 10px;
          opacity: 0.8;
        }
        
        .submenu-item:hover {
          opacity: 1;
          transform: scale(1.02);
        }
        
        .experience-main.active + .experience-submenu {
          display: block !important;
        }
        
        .tour-buttons {
          display: flex;
          justify-content: space-between;
        }
        
        .control-btn {
          flex: 1;
          margin: 0 2px;
        }
      </style>
    `;

    document.head.insertAdjacentHTML("beforeend", styles);
  }
}
