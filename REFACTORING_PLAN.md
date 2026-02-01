# ResumeSpace3D Refactoring Plan

## Goal

Break down the monolithic ResumeSpace3D.tsx (~4600 lines) into maintainable, testable modules following React and Three.js best practices.

## Architecture Principles

### React Best Practices

- **Custom Hooks**: Extract stateful logic into reusable hooks
- **Single Responsibility**: Each component/module has one clear purpose
- **Separation of Concerns**: Separate Three.js logic from React rendering
- **Context for Shared State**: Use Context API for cross-component communication
- **Composition over Inheritance**: Build complex behavior from simple pieces

### Three.js Best Practices

- **Scene Graph Management**: Organize objects hierarchically
- **System Pattern**: Use manager classes for complex subsystems
- **Factory Pattern**: Pure functions to create reusable objects
- **Animation Loop Isolation**: Keep render loop separate from component lifecycle
- **Resource Management**: Proper cleanup and disposal of Three.js resources

## Directory Structure

```
src/components/cosmos/
├── hooks/
│   ├── useThreeScene.ts          # Scene, camera, renderer setup
│   ├── useSpaceshipControls.ts   # Manual flight + autopilot logic
│   ├── useOrbitalMechanics.ts    # Orbit calculations and freezing
│   ├── useInteraction.ts         # Raycasting, clicks, hovers
│   ├── useSpaceNavigation.ts     # Navigation state and targeting
│   └── useLogger.ts              # Logging utilities (vlog, shipLog)
│
├── systems/
│   ├── SceneManager.ts           # Scene setup, lighting, backgrounds
│   ├── SpaceshipSystem.ts        # Spaceship loading, movement, camera
│   ├── OrbitalSystem.ts          # Orbital mechanics calculations
│   ├── EffectsSystem.ts          # Visual effects (halos, bloom, glow)
│   ├── InteractionSystem.ts     # Raycasting and interaction handling
│   └── ContentSystem.ts          # Overlay content management
│
├── factories/
│   ├── createPlanet.ts           # Planet/moon mesh creation
│   ├── createLabel.ts            # CSS2D label generation
│   ├── createOverlay.ts          # Overlay meshes and animations
│   ├── createStarfield.ts        # Background starfield creation
│   ├── createOrbitPath.ts        # Orbital path visualization
│   └── createLighting.ts         # Lighting setup utilities
│
├── utils/
│   ├── textureGenerators.ts     # Procedural texture creation
│   ├── orbitalMath.ts           # Orbital calculations
│   ├── spaceConstants.ts        # Magic numbers and configuration
│   ├── colorUtils.ts            # Color generation and manipulation
│   └── geometryHelpers.ts       # Common geometry operations
│
├── components/
│   ├── SpaceScene.tsx            # Main orchestrator component
│   ├── SpaceCanvas.tsx           # Canvas wrapper with resize handling
│   └── SpaceOverlays.tsx         # UI overlays (HUD, console, etc.)
│
├── context/
│   ├── SpaceContext.tsx          # Global space scene state
│   └── NavigationContext.tsx     # Navigation and targeting state
│
└── types/
    ├── celestialBodies.ts        # Types for planets, moons, stars
    ├── navigation.ts             # Navigation and waypoint types
    ├── spaceship.ts              # Spaceship state types
    └── scene.ts                  # Scene configuration types
```

## Refactoring Phases

### Phase 1: Foundation (Low Risk)

**Goal**: Extract pure functions and utilities with no dependencies

1. **Create type definitions** (`types/`)
   - Extract all TypeScript interfaces and types
   - Define clear contracts between modules

2. **Extract constants** (`utils/spaceConstants.ts`)
   - Orbital speeds, distances, sizes
   - Color values, magic numbers
   - Configuration defaults

3. **Extract pure utility functions** (`utils/`)
   - `textureGenerators.ts`: Canvas texture creation functions
   - `orbitalMath.ts`: Orbital position calculations
   - `colorUtils.ts`: Halo color generation
   - `geometryHelpers.ts`: Common geometry operations

4. **Create factory functions** (`factories/`)
   - `createLabel.ts`: CSS2D label creation (pure function)
   - `createStarfield.ts`: Starfield generation
   - `createOrbitPath.ts`: Orbit line creation

### Phase 2: Systems (Medium Risk)

**Goal**: Extract manager classes that handle complex subsystems

5. **Scene Management** (`systems/SceneManager.ts`)

   ```typescript
   class SceneManager {
     constructor(container: HTMLElement);
     initScene(): { scene; camera; renderer; controls; composer };
     setupLighting(options: LightingOptions): void;
     addBackgrounds(): void;
     dispose(): void;
   }
   ```

6. **Effects System** (`systems/EffectsSystem.ts`)

   ```typescript
   class EffectsSystem {
     setupBloom(intensity: number): UnrealBloomPass;
     createHaloLayers(planet: THREE.Mesh): void;
     animateHover(planet: THREE.Mesh, hovered: boolean): void;
     updateEffects(delta: number): void;
   }
   ```

7. **Orbital System** (`systems/OrbitalSystem.ts`)

   ```typescript
   class OrbitalSystem {
     registerObject(item: OrbitalItem): void;
     updateOrbits(delta: number): void;
     freezeOrbits(moonId: string): FrozenState;
     restoreOrbits(state: FrozenState): void;
   }
   ```

8. **Spaceship System** (`systems/SpaceshipSystem.ts`)
   ```typescript
   class SpaceshipSystem {
     loadSpaceship(url: string): Promise<THREE.Group>;
     updateAutopilot(delta: number): void;
     updateManualFlight(keyState: KeyboardState, delta: number): void;
     updateCameraFollow(camera: THREE.Camera): void;
   }
   ```

### Phase 3: Hooks (Medium Risk)

**Goal**: Extract React state logic into custom hooks

9. **Scene Hook** (`hooks/useThreeScene.ts`)

   ```typescript
   function useThreeScene(containerRef: RefObject<HTMLElement>) {
     // Returns: { scene, camera, renderer, controls, isReady }
     // Handles initialization, resize, cleanup
   }
   ```

10. **Interaction Hook** (`hooks/useInteraction.ts`)

    ```typescript
    function useInteraction(scene: THREE.Scene, camera: THREE.Camera) {
      // Returns: { hoveredObject, clickedObject, focusedObject }
      // Handles raycasting, hover effects, click detection
    }
    ```

11. **Spaceship Controls Hook** (`hooks/useSpaceshipControls.ts`)

    ```typescript
    function useSpaceshipControls(spaceship: THREE.Group) {
      // Returns: { mode, keyState, autopilot, manual }
      // Handles keyboard input, flight modes
    }
    ```

12. **Navigation Hook** (`hooks/useSpaceNavigation.ts`)

    ```typescript
    function useSpaceNavigation() {
      // Returns: { currentTarget, navigationState, navigateTo }
      // Handles navigation targets and state
    }
    ```

13. **Logger Hook** (`hooks/useLogger.ts`)
    ```typescript
    function useLogger() {
      // Returns: { vlog, shipLog, consoleLogs, shipLogs }
      // Handles on-screen logging system
    }
    ```

### Phase 4: Context & Components (Higher Risk)

**Goal**: Create clean component structure with shared state

14. **Create Context Providers** (`context/`)
    - `SpaceContext.tsx`: Scene state, options, visibility flags
    - `NavigationContext.tsx`: Navigation targets, tour state

15. **Refactor Main Component** (`components/SpaceScene.tsx`)
    - Orchestrate hooks and systems
    - Keep under 300 lines
    - Focus on composition and coordination

16. **Extract UI Layer** (`components/SpaceOverlays.tsx`)
    - Separate HUD, console, and overlay components
    - Keep Three.js logic separate from UI

### Phase 5: Planet/Moon Creation (Medium Risk)

**Goal**: Modularize celestial body creation

17. **Planet Factory** (`factories/createPlanet.ts`)

    ```typescript
    function createPlanet(config: PlanetConfig): PlanetMesh {
      // Creates planet with orbit, texture, label, hover effects
    }
    ```

18. **Overlay Factory** (`factories/createOverlay.ts`)
    ```typescript
    function createOverlay(
      parent: THREE.Mesh,
      content: string[],
    ): THREE.Mesh[] {
      // Creates detail overlays with animations
    }
    ```

## Migration Strategy

### Incremental Approach

1. **No Big Bang**: Refactor one system at a time
2. **Keep Both Working**: New modules coexist with old code initially
3. **Test After Each Phase**: Ensure functionality after each extraction
4. **Progressive Enhancement**: Gradually migrate from old to new

### Testing Strategy

1. **Visual Regression**: Take screenshots before/after each phase
2. **Interaction Testing**: Test clicks, hovers, navigation after changes
3. **Performance Monitoring**: Check frame rates remain stable
4. **Console Error Tracking**: No new errors introduced

### Risk Mitigation

1. **Git Branches**: Each phase in separate branch
2. **Rollback Ready**: Can revert any phase if issues arise
3. **Documentation**: Comment all new modules thoroughly
4. **Code Reviews**: Review each phase before merging

## Expected Benefits

### Maintainability

- **Smaller Files**: Each file under 300 lines
- **Clear Purpose**: Each module has single responsibility
- **Easy Navigation**: Find code by feature, not by scrolling

### Testability

- **Unit Tests**: Test pure functions in isolation
- **Mock Systems**: Test components without full scene
- **Integration Tests**: Test system interactions

### Reusability

- **Portable Hooks**: Use hooks in other projects
- **Factory Functions**: Reuse planet/moon creation
- **System Classes**: Drop into other Three.js projects

### Performance

- **Better Tree Shaking**: Import only what's needed
- **Lazy Loading**: Load systems on demand
- **Memory Management**: Easier to track and dispose resources

### Developer Experience

- **Type Safety**: Better TypeScript inference
- **IntelliSense**: Better autocomplete
- **Debugging**: Easier to isolate issues

## Open Questions

1. **Backward Compatibility**: Do we need to support the old API during transition?
2. **Breaking Changes**: Are we okay with changing prop interfaces?
3. **Performance Budget**: What's acceptable frame rate impact during refactor?
4. **Testing Requirements**: Do we need automated tests for each phase?
5. **Timeline**: Aggressive (1-2 weeks) or conservative (1 month)?

## Next Steps

1. Review and approve this plan
2. Create `src/components/cosmos/` directory structure
3. Start with Phase 1 (Foundation) - lowest risk, highest value
4. Proceed phase by phase with testing between each

---

## Progress Update (January 31, 2026)

### Completed Phases

✅ **Phase 1**: Foundation (types, constants, utilities) - 12 files  
✅ **Phase 2**: Systems (manager classes) - 7 files  
✅ **Phase 3**: Hooks (React wrappers) - 7 files  
✅ **Phase 4**: Factories (object creation) - 6 files  
✅ **Phase 5.1**: Context providers - 4 files  
✅ **Phase 5.2**: SpaceScene component - 2 files

**Total**: 38 files created from 4625-line monolith

### Current Task

🔄 **Phase 5.5**: Update ResumeSpace3D.tsx to use new architecture

### Post-Phase 5 Additional Work

After completing Phase 5.5, the following optional refactoring tasks remain:

- **Phase 5.3**: Create SpaceCanvas component (canvas wrapper with resize handling)
- **Phase 5.4**: Create SpaceOverlays component (HUD, console, content overlay components)

**Note**: Phases 5.3 and 5.4 can be done incrementally after verifying Phase 5.5 works correctly.
They are optional optimizations to further reduce complexity but not required for functional completion.

---

**Note**: This is a living document. Update as we discover new requirements or constraints during refactoring.
