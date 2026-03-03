import type { MutableRefObject } from "react";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { DiagramStyleOptions } from "../../DiagramSettings";
import type { SceneRef } from "../ResumeSpace3D.types";
import type { FrozenSystemState } from "../ResumeSpace3D.systemFreeze";

export const useCosmosOptions = (params: {
  options: DiagramStyleOptions;
  sceneRef: MutableRefObject<SceneRef>;
  frozenSystemStateRef: MutableRefObject<FrozenSystemState | null>;
}): MutableRefObject<DiagramStyleOptions> => {
  const { options, sceneRef, frozenSystemStateRef } = params;

  const optionsRef = useRef({
    spaceOrbitSpeed: 0,
    spaceMoonOrbitSpeed: 0,
    spaceMoonSpinSpeed: 0.1,
    ...options,
  });

  useEffect(() => {
    optionsRef.current = {
      spaceOrbitSpeed: 0,
      spaceMoonOrbitSpeed: 0,
      spaceMoonSpinSpeed: 0.1,
      ...options,
    };

    if (sceneRef.current.bloomPass && options.spaceSunIntensity !== undefined) {
      const bloomStrength = (options.spaceSunIntensity / 5) * 2;
      sceneRef.current.bloomPass.strength = bloomStrength;
    }

    if (sceneRef.current.sunLight && options.spaceSunIntensity !== undefined) {
      sceneRef.current.sunLight.intensity = options.spaceSunIntensity * 4;
      if (options.spaceSunColor) {
        sceneRef.current.sunLight.color = new THREE.Color(
          options.spaceSunColor,
        );
      }
      if (sceneRef.current.sunGlowMaterial) {
        const glowColor = new THREE.Color(options.spaceSunColor || 0xffaa00);
        sceneRef.current.sunGlowMaterial.color.copy(glowColor);
        sceneRef.current.sunGlowMaterial.opacity = Math.min(
          0.4 + (options.spaceSunIntensity || 2.5) * 0.1,
          0.9,
        );
      }
    }

    if (sceneRef.current.sunMaterial) {
      const sunMaterial = sceneRef.current.sunMaterial;
      const targetColor = new THREE.Color(options.spaceSunColor || "#ffdd99");

      if ("uniforms" in sunMaterial && sunMaterial.uniforms?.tintColor) {
        sunMaterial.uniforms.tintColor.value = targetColor;
        sunMaterial.uniforms.tintStrength.value =
          options.spaceTintSunMesh === false ? 0.0 : 1.0;
        sunMaterial.needsUpdate = true;
      } else if ("color" in sunMaterial) {
        if (options.spaceTintSunMesh && options.spaceSunColor) {
          sunMaterial.color.set(options.spaceSunColor);
        } else {
          sunMaterial.color.set(0xffffff);
        }
        sunMaterial.needsUpdate = true;
      }
    }

    if (sceneRef.current.labelRendererDom) {
      sceneRef.current.labelRendererDom.style.display =
        options.spaceShowLabels === false ? "none" : "block";
    }

    // RULES
    // -----
    // - spaceShowOrbits toggles ALL ellipse visibility globally.
    // - When a system is frozen for moon focus, its orbit lines must stay
    //   hidden regardless of global visibility, and only be restored on exit.
    if (sceneRef.current.scene) {
      const showOrbits = options.spaceShowOrbits !== false;
      sceneRef.current.scene.traverse((object) => {
        if (object.userData.isOrbitLine) {
          // Apply global orbit ellipse visibility toggle
          object.visible = showOrbits;
        }
      });
      if (frozenSystemStateRef.current) {
        frozenSystemStateRef.current.orbitLines.forEach((line) => {
          // Keep frozen system ellipses hidden while focused
          line.visible = false;
        });
      }
    }
  }, [options, sceneRef, frozenSystemStateRef]);

  return optionsRef;
};
