# Orbital Position Emitter & Spaceship Navigation System

## Overview

This solution addresses the "moving target" problem in your 3D space scene where the spaceship needs to navigate to moons that are orbiting planets. The previous approach of stopping orbits before navigation was fragile. This new system uses the **Observer pattern** to continuously emit position updates that the spaceship can subscribe to.

## Architecture

### 1. **OrbitalPositionEmitter** (`OrbitalPositionEmitter.ts`)

- **Purpose**: Tracks moving objects and emits their positions in real-time
- **Pattern**: Observer/PubSub pattern
- **Features**:
  - Register any Three.js mesh for tracking
  - Multiple subscribers per object
  - Configurable update intervals
  - Automatic velocity calculation
  - Pause/resume orbit capability
  - Performance optimized (only emits if subscribers exist)

### 2. **SpaceshipNavigationSystem** (`SpaceshipNavigationSystem.ts`)

- **Purpose**: Handles spaceship navigation to moving targets
- **Features**:
  - Subscribes to position updates automatically
  - Predictive intercept algorithm (aims ahead of moving target)
  - Smooth acceleration/deceleration
  - Automatic orbit freezing when approaching
  - Status callbacks for UI updates
  - Configurable speeds, distances, behaviors

## Integration Guide

### Step 1: Initialize the Emitter

In your `ResumeSpace3D.tsx`, add the emitter reference:

```typescript
import { getOrbitalPositionEmitter } from "./OrbitalPositionEmitter";
import { SpaceshipNavigationSystem } from "./SpaceshipNavigationSystem";

// Inside your component
const emitterRef = useRef(getOrbitalPositionEmitter());
const navigationSystemRef = useRef<SpaceshipNavigationSystem | null>(null);
```

### Step 2: Register Moons for Tracking

When you create moons in your scene, register them with the emitter:

```typescript
// In your moon creation code (around line 1400-1500)
const createExperienceMoons = () => {
  resumeData.experience.forEach((company, idx) => {
    // ... existing moon creation code ...
    const moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
    moonMesh.userData.planetName = company.company;
    moonMesh.userData.companyId = company.id;

    // Register with emitter for position tracking
    const moonId = `moon-${company.id}`;
    emitterRef.current.registerObject(moonId, moonMesh, 16); // 60fps updates

    // ... rest of moon setup ...
  });
};
```

### Step 3: Start the Emitter

In your useEffect where the scene initializes, start the emitter:

```typescript
useEffect(() => {
  // ... scene setup code ...

  // Start position emitter
  emitterRef.current.start();

  return () => {
    // Cleanup
    emitterRef.current.stop();
  };
}, []);
```

### Step 4: Initialize Navigation System

After loading the spaceship, create the navigation system:

```typescript
// Where you load the spaceship (around line 1650)
loader.load("/models/spaceship/scene.gltf", (gltf) => {
  const spaceship = gltf.scene;
  // ... existing spaceship setup ...

  spaceshipRef.current = spaceship;
  scene.add(spaceship);

  // Create navigation system
  navigationSystemRef.current = new SpaceshipNavigationSystem(spaceship, {
    maxSpeed: 2.0,
    turboSpeed: 4.0,
    accelerationRate: 0.05,
    decelerationDistance: 100,
    arrivalDistance: 20,
    usePredictiveIntercept: true,
    freezeOrbitOnApproach: true,
    freezeDistance: 50,
  });

  // Set up callbacks
  navigationSystemRef.current.setOnStatusChange((status) => {
    setNavigationDistance(status.distance);
    setNavigationETA(status.eta);
    // Update any other UI state
  });

  navigationSystemRef.current.setOnArrival((targetId) => {
    console.log(`✅ Arrived at ${targetId}`);
    // Show overlay, trigger effects, etc.
    handleArrivalAtMoon(targetId);
  });
});
```

### Step 5: Replace Navigation Logic

Replace your existing `handleAutopilotNavigation` function:

```typescript
const handleAutopilotNavigation = (
  targetId: string,
  targetType: "section" | "moon",
) => {
  if (!followingSpaceshipRef.current || manualFlightModeRef.current) {
    console.warn("⚠️ Navigation only available in autopilot mode");
    return;
  }

  if (targetType === "moon") {
    // Use new navigation system
    const moonId = `moon-${targetId}`;

    if (!emitterRef.current.isTracking(moonId)) {
      console.error(`Moon ${targetId} is not being tracked`);
      return;
    }

    const useTurbo = true; // or based on user preference
    const success = navigationSystemRef.current?.navigateToObject(
      moonId,
      useTurbo,
    );

    if (success) {
      setCurrentNavigationTarget(targetId);
      console.log(`🚀 Navigation started to moon: ${targetId}`);
    }
  } else {
    // Handle section navigation (planets) - existing code
    // ...
  }
};
```

### Step 6: Update Animation Loop

In your animation loop (where you update spaceship position), replace the movement logic:

```typescript
// In your animation/render loop
const animate = () => {
  // ... existing animation code ...

  // Update navigation system (replaces old manual position updates)
  if (navigationSystemRef.current) {
    const deltaTime = clock.getDelta();
    navigationSystemRef.current.update(deltaTime);
  }

  // Camera follows spaceship if enabled
  if (followingSpaceshipRef.current && spaceshipRef.current) {
    updateCameraFollowShip();
  }

  // ... rest of animation loop ...
};
```

### Step 7: Handle Arrival

Create a handler for when the ship arrives at a moon:

```typescript
const handleArrivalAtMoon = (targetId: string) => {
  // Extract company ID from moon ID (remove "moon-" prefix)
  const companyId = targetId.replace("moon-", "");
  const company = resumeData.experience.find((exp) => exp.id === companyId);

  if (!company) return;

  // Find the moon mesh
  let moonMesh: THREE.Mesh | null = null;
  sceneRef.current.scene?.traverse((object) => {
    if (
      object instanceof THREE.Mesh &&
      object.userData.companyId === companyId
    ) {
      moonMesh = object;
    }
  });

  if (!moonMesh) return;

  // The orbit is already frozen by navigation system
  // Now show the overlay and set up the close-up view
  finalizeFocusOnMoon(moonMesh, company);
};
```

## Advantages of This Approach

### 1. **Decoupled Architecture**

- Position tracking is independent of navigation logic
- Easy to add new subscribers (e.g., camera system, UI elements)
- Clean separation of concerns

### 2. **Robust Moving Target Handling**

- Continuous position updates even while orbiting
- Predictive intercept algorithm aims ahead of moving targets
- Smooth transition from moving to stationary target

### 3. **Automatic Orbit Management**

- Automatically freezes orbit when ship gets close
- Resumes orbit if navigation is cancelled
- No manual freeze/unfreeze calls needed

### 4. **Performance Optimized**

- Configurable update intervals per object
- Only emits updates when subscribers exist
- Efficient velocity calculation

### 5. **Easy to Debug**

- Comprehensive logging
- Status callbacks for UI
- Can inspect subscription counts

### 6. **Flexible Configuration**

- Adjust speeds, distances, behaviors per use case
- Enable/disable features like predictive intercept
- Turbo mode support

## Configuration Options

### NavigationConfig

```typescript
{
  maxSpeed: 2.0,              // Normal maximum speed
  turboSpeed: 4.0,            // Speed when turbo is active
  accelerationRate: 0.05,     // How quickly speed changes (0-1)
  decelerationDistance: 100,  // Start slowing at this distance
  arrivalDistance: 20,        // Consider "arrived" at this distance
  usePredictiveIntercept: true, // Aim ahead of moving targets
  freezeOrbitOnApproach: true,  // Auto-freeze orbit when close
  freezeDistance: 50,         // Freeze orbit at this distance
}
```

## Cleanup

Don't forget to clean up in your component unmount:

```typescript
useEffect(() => {
  // ... initialization ...

  return () => {
    // Cleanup navigation system
    navigationSystemRef.current?.dispose();

    // Stop and cleanup emitter
    emitterRef.current.stop();
    // Note: Don't call dispose on emitter if using singleton pattern
    // It might be used by other components
  };
}, []);
```

## Testing the System

### 1. Test Position Emission

```typescript
// Subscribe to a moon and log positions
const unsubscribe = emitterRef.current.subscribe("moon-company1", (update) => {
  console.log("Position:", update.worldPosition);
  console.log("Velocity:", update.velocity);
  console.log("Is Orbiting:", update.isOrbiting);
});

// Later: unsubscribe();
```

### 2. Test Navigation

```typescript
// Navigate to a moon
navigationSystemRef.current?.navigateToObject("moon-company1", true);

// Monitor status
navigationSystemRef.current?.setOnStatusChange((status) => {
  console.log("Distance:", status.distance);
  console.log("ETA:", status.eta);
  console.log("Speed:", status.speed);
  console.log("Turbo:", status.isTurboActive);
});
```

### 3. Test Orbit Pause/Resume

```typescript
// Manually pause orbit
emitterRef.current.pauseOrbit("moon-company1");

// Resume later
emitterRef.current.resumeOrbit("moon-company1");
```

## Troubleshooting

### Issue: Ship doesn't move

- Check if navigation system is initialized
- Verify ship reference is valid
- Check if target is registered with emitter
- Ensure `update()` is called in animation loop

### Issue: Ship misses the target

- Increase `arrivalDistance`
- Disable predictive intercept
- Adjust `decelerationDistance`
- Check if moon position is being updated

### Issue: Orbit doesn't freeze

- Verify `freezeOrbitOnApproach` is true
- Check `freezeDistance` value
- Ensure emitter can pause the orbit (check if moon is registered)

### Issue: Performance problems

- Increase update interval (e.g., 32ms instead of 16ms)
- Reduce number of tracked objects
- Check subscriber counts

## Future Enhancements

1. **Obstacle Avoidance**: Add logic to navigate around planets
2. **Path Planning**: Calculate optimal routes through 3D space
3. **Formation Flying**: Multiple ships following same target
4. **Dynamic Speeds**: Adjust speed based on danger zones
5. **Energy System**: Consume fuel/energy during navigation
6. **Cinematic Approaches**: Special arrival animations

## Summary

This system provides a robust, maintainable solution for navigating to moving objects in your 3D space scene. The Observer pattern ensures clean decoupling, while the navigation system handles all the complexity of moving target intercept, deceleration, and orbit management.

The key insight is: **instead of stopping the moon and then navigating, we continuously track its position and navigate to where it is RIGHT NOW**, with the option to freeze it when we get close for a stable arrival.
