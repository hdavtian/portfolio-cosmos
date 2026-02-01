/**
 * Scene Manager - Handles Three.js scene initialization and configuration
 * Extracted from ResumeSpace3D.tsx
 */

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import {
  CAMERA,
  LIGHTING,
  BLOOM,
  STARFIELD,
  SIZES,
} from "../utils/spaceConstants";
import type { SceneRef, LightingOptions } from "../types";

export interface SceneManagerConfig {
  container: HTMLElement;
  sunIntensity?: number;
  sunColor?: string;
  showLabels?: boolean;
  cameraPosition?: THREE.Vector3;
  bloomStrength?: number;
  bloomThreshold?: number;
  bloomRadius?: number;
  ambientIntensity?: number;
  fillIntensity?: number;
}

/**
 * Manages Three.js scene setup, lighting, backgrounds, and rendering
 */
export class SceneManager {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private labelRenderer: CSS2DRenderer;
  private controls: OrbitControls;
  private composer: EffectComposer;
  private bloomPass: UnrealBloomPass;

  // Light references
  private sunLight: THREE.PointLight;
  // @ts-expect-error - Used in initialization
  private ambientLight: THREE.AmbientLight;
  // @ts-expect-error - Used in initialization
  private fillLight: THREE.PointLight;

  // Sun mesh and materials
  private sunMesh: THREE.Mesh;
  private sunMaterial: THREE.MeshBasicMaterial;
  // @ts-expect-error - Used in initialization
  private sunGlowSprite: THREE.Sprite;
  private sunGlowMaterial: THREE.SpriteMaterial;

  // Background starfields
  private outerStarfield: THREE.Mesh;
  private innerStarfield: THREE.Mesh;
  private pointStarfield: THREE.Points;

  private textureLoader: THREE.TextureLoader;

  constructor(config: SceneManagerConfig) {
    this.container = config.container;
    this.textureLoader = new THREE.TextureLoader();

    // Initialize core components
    this.scene = new THREE.Scene();
    this.camera = this.createCamera();
    this.renderer = this.createRenderer();
    this.labelRenderer = this.createLabelRenderer();
    this.controls = this.createControls();

    // Setup post-processing
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(
        this.container.clientWidth,
        this.container.clientHeight,
      ),
      Math.min(
        (config.sunIntensity || LIGHTING.SUN_DEFAULT_INTENSITY) *
          BLOOM.STRENGTH_MULTIPLIER,
        BLOOM.MAX_STRENGTH,
      ),
      BLOOM.RADIUS,
      BLOOM.THRESHOLD,
    );
    this.composer.addPass(this.bloomPass);

    // Setup lighting
    const lightOptions: LightingOptions = {
      sunIntensity: config.sunIntensity || LIGHTING.SUN_DEFAULT_INTENSITY,
      sunColor: config.sunColor || "#ffffff",
      ambientColor: `#${LIGHTING.AMBIENT_COLOR.toString(16).padStart(6, "0")}`,
      ambientIntensity: LIGHTING.AMBIENT_INTENSITY,
    };

    this.ambientLight = this.createAmbientLight(lightOptions);
    this.sunLight = this.createSunLight(lightOptions);
    this.fillLight = this.createFillLight();

    // Create sun mesh and glow
    const sunResult = this.createSunMesh(config.sunColor);
    this.sunMesh = sunResult.mesh;
    this.sunMaterial = sunResult.material;
    this.sunGlowSprite = sunResult.glowSprite;
    this.sunGlowMaterial = sunResult.glowMaterial;

    // Add backgrounds
    this.outerStarfield = this.createOuterStarfield();
    this.innerStarfield = this.createInnerStarfield();
    this.pointStarfield = this.createPointStarfield();

    // Apply initial visibility
    if (config.showLabels === false) {
      this.labelRenderer.domElement.style.display = "none";
    }

    // Setup touch handling
    this.setupTouchHandling();
  }

  /**
   * Create perspective camera
   */
  private createCamera(): THREE.PerspectiveCamera {
    const camera = new THREE.PerspectiveCamera(
      CAMERA.FOV,
      this.container.clientWidth / this.container.clientHeight,
      CAMERA.NEAR,
      CAMERA.FAR,
    );
    camera.position.set(
      CAMERA.INITIAL_POSITION.x,
      CAMERA.INITIAL_POSITION.y,
      CAMERA.INITIAL_POSITION.z,
    );
    camera.lookAt(0, 0, 0);
    return camera;
  }

  /**
   * Create WebGL renderer
   */
  private createRenderer(): THREE.WebGLRenderer {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    renderer.domElement.style.position = "absolute";
    this.container.appendChild(renderer.domElement);
    return renderer;
  }

  /**
   * Create CSS2D label renderer
   */
  private createLabelRenderer(): CSS2DRenderer {
    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(
      this.container.clientWidth,
      this.container.clientHeight,
    );
    labelRenderer.domElement.style.position = "absolute";
    labelRenderer.domElement.style.top = "0px";
    labelRenderer.domElement.style.pointerEvents = "none";
    labelRenderer.domElement.style.zIndex = "100";
    this.container.appendChild(labelRenderer.domElement);
    return labelRenderer;
  }

  /**
   * Create orbit controls
   */
  private createControls(): OrbitControls {
    const controls = new OrbitControls(this.camera, this.renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = CAMERA.MIN_DISTANCE;
    controls.maxDistance = CAMERA.MAX_DISTANCE;
    controls.autoRotate = false;
    controls.autoRotateSpeed = 0.5;
    return controls;
  }

  /**
   * Create ambient light
   */
  private createAmbientLight(options: LightingOptions): THREE.AmbientLight {
    const light = new THREE.AmbientLight(
      new THREE.Color(LIGHTING.AMBIENT_COLOR),
      options.ambientIntensity,
    );
    this.scene.add(light);
    return light;
  }

  /**
   * Create sun point light
   */
  private createSunLight(options: LightingOptions): THREE.PointLight {
    const light = new THREE.PointLight(
      new THREE.Color(options.sunColor),
      options.sunIntensity * LIGHTING.SUN_INTENSITY_MULTIPLIER,
      LIGHTING.SUN_DISTANCE,
      LIGHTING.SUN_DECAY,
    );
    light.position.set(0, 0, 0);
    light.castShadow = false;
    this.scene.add(light);
    return light;
  }

  /**
   * Create fill light for ambient illumination
   */
  private createFillLight(): THREE.PointLight {
    const light = new THREE.PointLight(
      new THREE.Color(LIGHTING.FILL_LIGHT_COLOR),
      LIGHTING.FILL_LIGHT_INTENSITY,
      LIGHTING.FILL_LIGHT_DISTANCE,
      LIGHTING.FILL_LIGHT_DECAY,
    );
    light.position.set(
      LIGHTING.FILL_LIGHT_POSITION.x,
      LIGHTING.FILL_LIGHT_POSITION.y,
      LIGHTING.FILL_LIGHT_POSITION.z,
    );
    this.scene.add(light);
    return light;
  }

  /**
   * Create sun mesh with glow sprite
   */
  private createSunMesh(sunColor?: string): {
    mesh: THREE.Mesh;
    material: THREE.MeshBasicMaterial;
    glowSprite: THREE.Sprite;
    glowMaterial: THREE.SpriteMaterial;
  } {
    const sunGeometry = new THREE.SphereGeometry(SIZES.SUN, 32, 32);
    const sunMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      toneMapped: false,
    });
    const sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
    sunMesh.position.set(0, 0, 0);
    this.scene.add(sunMesh);

    // Load sun texture
    this.textureLoader.load("/textures/sun.jpg", (tex) => {
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      sunMaterial.map = tex;
      sunMaterial.needsUpdate = true;
    });

    // Create sun glow sprite
    const glowTexture = this.createSunGlowTexture();
    const spriteMaterial = new THREE.SpriteMaterial({
      map: glowTexture,
      color: sunColor ? new THREE.Color(sunColor) : 0xffaa00,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(180, 180, 1);
    sunMesh.add(sprite);

    return {
      mesh: sunMesh,
      material: sunMaterial,
      glowSprite: sprite,
      glowMaterial: spriteMaterial,
    };
  }

  /**
   * Create sun glow texture (procedural)
   */
  private createSunGlowTexture(): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");

    if (ctx) {
      const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      gradient.addColorStop(0, "rgba(255, 200, 100, 1)");
      gradient.addColorStop(0.2, "rgba(255, 150, 50, 0.8)");
      gradient.addColorStop(0.5, "rgba(255, 100, 0, 0.2)");
      gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 64, 64);
    }

    return new THREE.CanvasTexture(canvas);
  }

  /**
   * Create outer starfield background
   */
  private createOuterStarfield(): THREE.Mesh {
    const starTexture = this.textureLoader.load("/textures/8k_stars.jpg");
    const starGeo = new THREE.SphereGeometry(
      STARFIELD.OUTER_SPHERE_RADIUS,
      STARFIELD.SPHERE_SEGMENTS,
      STARFIELD.SPHERE_SEGMENTS,
    );
    const starMat = new THREE.MeshBasicMaterial({
      map: starTexture,
      side: THREE.BackSide,
      toneMapped: false,
      color: new THREE.Color(
        STARFIELD.BRIGHTNESS_MULTIPLIER,
        STARFIELD.BRIGHTNESS_MULTIPLIER,
        STARFIELD.BRIGHTNESS_MULTIPLIER,
      ),
    });
    const starfield = new THREE.Mesh(starGeo, starMat);
    this.scene.add(starfield);
    return starfield;
  }

  /**
   * Create inner starfield layer for depth
   */
  private createInnerStarfield(): THREE.Mesh {
    const skyTexture = this.textureLoader.load("/textures/stars.jpg");
    const skyGeo = new THREE.SphereGeometry(
      STARFIELD.INNER_SPHERE_RADIUS,
      STARFIELD.SPHERE_SEGMENTS,
      STARFIELD.SPHERE_SEGMENTS,
    );
    const skyMat = new THREE.MeshBasicMaterial({
      map: skyTexture,
      side: THREE.BackSide,
      toneMapped: false,
      transparent: true,
      opacity: STARFIELD.INNER_OPACITY,
      color: new THREE.Color(0.8, 0.9, 1.0),
    });
    const skyfield = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(skyfield);
    return skyfield;
  }

  /**
   * Create point-based starfield for deep space effect
   */
  private createPointStarfield(): THREE.Points {
    const starsGeometry = new THREE.BufferGeometry();
    const starsCount = STARFIELD.POINT_STARS_COUNT;
    const posArray = new Float32Array(starsCount * 3);

    for (let i = 0; i < starsCount * 3; i += 3) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const distance =
        STARFIELD.POINT_STAR_MIN_DISTANCE +
        Math.random() *
          (STARFIELD.POINT_STAR_MAX_DISTANCE -
            STARFIELD.POINT_STAR_MIN_DISTANCE);

      posArray[i] = distance * Math.sin(phi) * Math.cos(theta);
      posArray[i + 1] = distance * Math.sin(phi) * Math.sin(theta);
      posArray[i + 2] = distance * Math.cos(phi);
    }

    starsGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(posArray, 3),
    );

    const starsMaterial = new THREE.PointsMaterial({
      size: STARFIELD.POINT_STAR_SIZE,
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: false,
    });

    const starField = new THREE.Points(starsGeometry, starsMaterial);
    this.scene.add(starField);
    return starField;
  }

  /**
   * Setup touch event handling
   */
  private setupTouchHandling(): void {
    const preventDefaultTouch = (e: Event) => {
      if ((e as TouchEvent).touches && (e as TouchEvent).touches.length > 1) {
        e.preventDefault();
      }
    };

    this.renderer.domElement.addEventListener(
      "touchstart",
      preventDefaultTouch,
      { passive: false },
    );
    this.renderer.domElement.addEventListener(
      "touchmove",
      preventDefaultTouch,
      { passive: false },
    );
    this.renderer.domElement.style.touchAction = "none";
  }

  /**
   * Update sun light intensity
   */
  updateSunIntensity(intensity: number): void {
    this.sunLight.intensity = intensity * LIGHTING.SUN_INTENSITY_MULTIPLIER;

    // Update bloom strength
    this.bloomPass.strength = Math.min(
      intensity * BLOOM.STRENGTH_MULTIPLIER,
      BLOOM.MAX_STRENGTH,
    );

    // Update glow sprite opacity
    this.sunGlowMaterial.opacity = Math.min(0.4 + intensity * 0.1, 0.9);
  }

  /**
   * Update sun color
   */
  updateSunColor(color: string): void {
    const threeColor = new THREE.Color(color);
    this.sunLight.color = threeColor;
    this.sunGlowMaterial.color.copy(threeColor);
  }

  /**
   * Update sun mesh tint
   */
  updateSunMeshTint(color: string, enabled: boolean): void {
    if (enabled) {
      this.sunMaterial.color.set(color);
    } else {
      this.sunMaterial.color.set(0xffffff);
    }
    this.sunMaterial.needsUpdate = true;
  }

  /**
   * Toggle label visibility
   */
  setLabelsVisible(visible: boolean): void {
    this.labelRenderer.domElement.style.display = visible ? "block" : "none";
  }

  /**
   * Toggle orbit lines visibility
   */
  setOrbitsVisible(visible: boolean): void {
    this.scene.traverse((object) => {
      if (object.userData.isOrbitLine) {
        object.visible = visible;
      }
    });
  }

  /**
   * Handle window resize
   */
  handleResize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
    this.labelRenderer.setSize(width, height);
    this.composer.setSize(width, height);
  }

  /**
   * Render the scene
   */
  render(): void {
    this.controls.update();
    this.composer.render();
    this.labelRenderer.render(this.scene, this.camera);
  }

  /**
   * Get scene reference object for external access
   */
  getSceneRef(): SceneRef {
    return {
      scene: this.scene,
      camera: this.camera,
      controls: this.controls,
      sunLight: this.sunLight,
      labelRendererDom: this.labelRenderer.domElement,
      bloomPass: this.bloomPass,
      sunMaterial: this.sunMaterial,
      sunGlowMaterial: this.sunGlowMaterial,
    };
  }

  /**
   * Get scene for adding objects
   */
  getScene(): THREE.Scene {
    return this.scene;
  }

  /**
   * Get camera
   */
  getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  /**
   * Get controls
   */
  getControls(): OrbitControls {
    return this.controls;
  }

  /**
   * Get renderer
   */
  getRenderer(): THREE.WebGLRenderer {
    return this.renderer;
  }

  /**
   * Cleanup and dispose resources
   */
  dispose(): void {
    // Dispose geometries
    this.outerStarfield.geometry.dispose();
    this.innerStarfield.geometry.dispose();
    this.pointStarfield.geometry.dispose();
    this.sunMesh.geometry.dispose();

    // Dispose materials
    if (Array.isArray(this.outerStarfield.material)) {
      this.outerStarfield.material.forEach((mat) => mat.dispose());
    } else {
      this.outerStarfield.material.dispose();
    }

    if (Array.isArray(this.innerStarfield.material)) {
      this.innerStarfield.material.forEach((mat) => mat.dispose());
    } else {
      this.innerStarfield.material.dispose();
    }

    if (Array.isArray(this.pointStarfield.material)) {
      this.pointStarfield.material.forEach((mat) => mat.dispose());
    } else {
      this.pointStarfield.material.dispose();
    }

    this.sunMaterial.dispose();
    this.sunGlowMaterial.dispose();

    // Dispose renderer
    this.renderer.dispose();

    // Remove DOM elements
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(
        this.renderer.domElement,
      );
    }
    if (this.labelRenderer.domElement.parentElement) {
      this.labelRenderer.domElement.parentElement.removeChild(
        this.labelRenderer.domElement,
      );
    }

    // Dispose controls
    this.controls.dispose();
  }
}
