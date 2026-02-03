import * as THREE from "three";

export type OrbitItem = {
  mesh: THREE.Mesh;
  orbitSpeed: number;
  angle: number;
  distance: number;
  parent?: THREE.Object3D;
  detached?: boolean;
  originalParent?: THREE.Object3D;
  overlayMeshes?: THREE.Mesh[];
  overlayOffsets?: number[];
  overlayHeights?: number[];
};

export type OrbitAnchor = { anchor: THREE.Object3D; parent: THREE.Object3D };

export const updateOrbit = (params: {
  items: OrbitItem[];
  orbitAnchors: OrbitAnchor[];
  options: {
    spaceOrbitSpeed?: number;
    spaceMoonOrbitSpeed?: number;
    spaceMoonSpinSpeed?: number;
  };
  focusedMoon: THREE.Mesh | null;
}) => {
  const { items, orbitAnchors, options, focusedMoon } = params;

  // Orbit logic (separate speeds for main planets vs. moons)
  const planetSpeedMultiplier = Math.max(
    0,
    Number(
      options.spaceOrbitSpeed !== undefined ? options.spaceOrbitSpeed : 0.1,
    ) || 0.1,
  );
  const moonSpeedMultiplier = Math.max(
    0,
    Number(
      options.spaceMoonOrbitSpeed !== undefined
        ? options.spaceMoonOrbitSpeed
        : (options.spaceOrbitSpeed ?? 0.01),
    ) || 0.01,
  );

  // Animate orbital positions only when speed is greater than zero
  items.forEach((item) => {
    const isMoon = item.mesh.userData?.isMoon === true;
    const sm = isMoon ? moonSpeedMultiplier : planetSpeedMultiplier;

    // Update orbital angle only when speed is greater than 0
    // Always re-project position to the orbit line so it can't drift off
    const isFocused = focusedMoon === item.mesh;
    if (!item.mesh.userData.pauseOrbit && !isFocused) {
      if (sm > 0) {
        item.angle += item.orbitSpeed * sm;
      }
      const usesAnchor = item.mesh.userData?.orbitUsesAnchor === true;
      const parentRotationY =
        !usesAnchor && isMoon && item.mesh.parent
          ? item.mesh.parent.rotation.y
          : 0;
      const orbitAngle = isMoon ? item.angle - parentRotationY : item.angle;
      const orbitRatio = item.mesh.userData?.orbitEllipseRatio ?? 1;
      item.mesh.position.x = Math.cos(orbitAngle) * item.distance;
      item.mesh.position.z = -Math.sin(orbitAngle) * item.distance * orbitRatio;
    }

    // Self rotation: use moon spin speed control for moons, base spin for planets
    const isMoonBody = item.mesh.userData?.isMoon === true;

    // Get moon spin speed multiplier from options (default to 0.1 if not set)
    const moonSpinMultiplier =
      options.spaceMoonSpinSpeed !== undefined
        ? options.spaceMoonSpinSpeed
        : 0.1;

    const baseSpin = isMoonBody ? 0.02 * moonSpinMultiplier : 0.008; // moons use multiplier

    // For planets that have moons as children, only apply rotation if moon orbit speed > 0
    // Otherwise the planet rotation causes moons to orbit even when speed is 0
    const isPlanetWithPotentialMoons =
      item.mesh.userData?.isMainPlanet === true;
    const shouldRotate = !isPlanetWithPotentialMoons || moonSpeedMultiplier > 0;

    // Only rotate if should rotate AND if it's not a moon with 0 spin speed
    const shouldApplySpin =
      shouldRotate && (!isMoonBody || moonSpinMultiplier > 0);

    if (shouldApplySpin) {
      item.mesh.rotation.y += baseSpin;
    }

    // Apply any residual spin velocity from user interaction (always applied)
    const spin = item.mesh.userData.spinVelocity as THREE.Vector3 | undefined;
    if (spin) {
      // approximate delta-time
      const dt = 1 / 60; // seconds
      item.mesh.rotation.x += spin.x * dt;
      item.mesh.rotation.y += spin.y * dt;

      // decay spin slowly
      spin.multiplyScalar(0.995);
    }
  });

  // Keep moon orbits stationary by canceling parent planet spin
  orbitAnchors.forEach(({ anchor, parent }) => {
    anchor.rotation.set(0, -parent.rotation.y, 0);
  });
};
