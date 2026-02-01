# Cosmos Architecture - Migration Guide

## Overview

The refactoring has created a clean, modular architecture in `src/components/cosmos/` with 38 well-organized files:

- **Types** (6 files): TypeScript interfaces for all domain entities
- **Utils** (6 files): Pure functions, constants, and helpers
- **Systems** (7 files): Manager classes for complex subsystems
- **Hooks** (7 files): React hooks wrapping systems
- **Factories** (6 files): Pure functions to create Three.js objects
- **Context** (4 files): React context providers for global state
- **Components** (2 files): SpaceScene orchestrator

## Current Status

### ✅ What's Complete

All foundational architecture is complete and ready to use:

1. **Type System**: Complete TypeScript coverage
2. **Constants**: All magic numbers extracted
3. **Utilities**: Pure helper functions ready
4. **Systems**: 6 manager classes (Scene, Orbital, Effects, Spaceship, Interaction, Content)
5. **Hooks**: 6 React hooks for easy system access
6. **Factories**: 5 object creation functions
7. **Context Providers**: Global state management

### ⚠️ What Needs Integration

The original `ResumeSpace3D.tsx` (4625 lines) still contains critical domain logic:

- Navigation system coordination
- Content overlay management
- Tour guide integration
- Resume data parsing
- Moon generation from JSON
- Complex interaction workflows
- Event handling and routing

## Using the Refactored Architecture

### Option 1: New Projects (Recommended)

Start fresh using the clean cosmos architecture:

```typescript
import { SpaceProvider } from './components/cosmos/context';
import { SpaceScene } from './components/cosmos/components';
import { useSpaceContext, useNavigationContext } from './components/cosmos/context';

function MySpaceApp() {
  return (
    <SpaceProvider>
      <SpaceScene containerRef={containerRef} onReady={() => console.log('Ready!')} />
      <MyCustomHUD />
    </SpaceProvider>
  );
}
```

### Option 2: Incremental Migration

Gradually replace parts of ResumeSpace3D.tsx:

1. Replace orbital calculations with `useOrbitalMechanics()`
2. Replace scene setup with `SceneManager`
3. Replace effects with `EffectsSystem`
4. Continue piece by piece...

### Option 3: Library Approach

Treat `cosmos/` as a reusable library while keeping the original working:

- Keep `ResumeSpace3D.tsx` functional
- Use cosmos modules for new features
- Extract common patterns to cosmos over time

## Key Components

### SpaceScene (Main Orchestrator)

```typescript
<SpaceScene
  containerRef={mountRef}
  onReady={() => setLoading(false)}
/>
```

**Responsibilities**:

- Initialize all systems
- Run animation loop
- Manage scene lifecycle
- Create celestial bodies

**Current Limitations**:

- Basic planet creation only (no moons yet)
- No navigation integration
- No content overlays
- No resume data parsing

### Context Providers

```typescript
const { sceneOptions, setLabelsVisible } = useSpaceContext();
const { navigateTo, startTour } = useNavigationContext();
```

**Features**:

- Global scene settings
- Navigation state
- Tour management
- Visibility toggles

### System Managers

```typescript
const sceneManager = new SceneManager(container, config);
const orbitalSystem = new OrbitalSystem();
const effectsSystem = new EffectsSystem();
```

**Usage**:

- Initialize once
- Call update methods in animation loop
- Dispose on cleanup

## Integration Examples

### Example 1: Using Orbital System

```typescript
import { useOrbitalMechanics } from "./cosmos/hooks";

function MyComponent() {
  const { registerItem, updateOrbits, freezeOrbits } = useOrbitalMechanics();

  // Register a planet
  registerItem({
    mesh: planetMesh,
    orbitalDistance: 500,
    orbitalSpeed: 0.1,
    currentAngle: 0,
    orbitPath: pathMesh,
  });

  // In animation loop
  useEffect(() => {
    const animate = () => {
      updateOrbits(1.0); // speed multiplier
      requestAnimationFrame(animate);
    };
    animate();
  }, []);
}
```

### Example 2: Using Scene Manager

```typescript
import { SceneManager } from "./cosmos/systems";

const sceneManager = new SceneManager(container, {
  enableBloom: true,
  bloomStrength: 0.8,
});

// Update settings
sceneManager.updateSunIntensity(2.5);
sceneManager.setLabelsVisible(true);

// Render
sceneManager.render();

// Cleanup
sceneManager.dispose();
```

### Example 3: Using Factories

```typescript
import {
  createLabel,
  createOrbitPath,
  createStarfield,
} from "./cosmos/factories";

// Create a label
const label = createLabel({
  text: "Mars",
  fontSize: 16,
  color: "#ff0000",
});

// Create orbit path
const orbit = createOrbitPath({
  distance: 500,
  ellipseRatio: 0.95,
  color: 0xff0000,
});

// Create starfield
const stars = createStarfield({
  radius: 8000,
  texture: "/textures/8k_stars.jpg",
});
```

## Migration Patterns

### Pattern 1: Extract Constants

**Before**:

```typescript
const PLANET_DISTANCE = 800;
const ORBIT_SPEED = 0.0015;
```

**After**:

```typescript
import { DISTANCES, ORBITAL_SPEEDS } from "./cosmos/utils/spaceConstants";

const distance = DISTANCES.EXPERIENCE;
const speed = ORBITAL_SPEEDS.EXPERIENCE;
```

### Pattern 2: Extract System Logic

**Before**:

```typescript
// 200 lines of orbital calculation code
function updatePlanetPositions() {
  // complex math...
}
```

**After**:

```typescript
const { updateOrbits } = useOrbitalMechanics();

function animate() {
  updateOrbits(orbitSpeed);
}
```

### Pattern 3: Use Context for State

**Before**:

```typescript
const [labelsVisible, setLabelsVisible] = useState(true);
// Pass through multiple components
<Child labelsVisible={labelsVisible} />
```

**After**:

```typescript
const { setLabelsVisible } = useSpaceContext();
// Available everywhere under SpaceProvider
```

## What's Next

### Phase 5.3: SpaceCanvas Component (Optional)

Create a canvas wrapper handling:

- Resize events
- Touch gestures
- Pointer lock
- Fullscreen toggle

### Phase 5.4: SpaceOverlays Component (Optional)

Create UI overlay helpers:

- HUD component
- Console component
- Content overlay
- Loading screen

### Future: Complete Integration

Eventually migrate all of ResumeSpace3D.tsx by:

1. Creating moon generation system
2. Integrating tour guide
3. Wiring navigation handlers
4. Connecting content overlays
5. Adding interaction workflows

## Benefits of Current Architecture

### Maintainability

- Each file < 300 lines
- Clear single responsibilities
- Easy to find code

### Testability

- Pure functions easily tested
- Systems can be mocked
- Integration tests possible

### Reusability

- Hooks work in any React app
- Systems work in any Three.js project
- Factories create reusable objects

### Performance

- Better tree shaking
- Lazy loading possible
- Easier optimization

## Conclusion

The refactored cosmos architecture provides a solid foundation for building or enhancing 3D space visualizations. While full integration with the original ResumeSpace3D.tsx is deferred, the 38 new files are production-ready and can be used immediately in new projects or incrementally adopted in existing ones.

The clean separation of concerns, TypeScript coverage, and modular design make this architecture a valuable asset for future development.
