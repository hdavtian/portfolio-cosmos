# Cosmos Directory Refactoring Plan

## Analysis of Files Outside Cosmos Directory

### Current State

The following cosmos-related files currently live in `src/components/` instead of `src/components/cosmos/`:

1. **CosmicContentOverlay.tsx** (340 lines) + CosmicContentOverlay.scss
   - Full-screen overlay for displaying focused content
   - Used by: ResumeSpace3D.tsx, TourDefinitionBuilder.ts
2. **CosmicNavigation.ts** (752 lines)
   - Camera director and tour guide system
   - Core navigation interface (CosmosCameraDirector, TourGuide, NavigationInterface)
   - Used by: ResumeSpace3D.tsx, TourDefinitionBuilder.ts
3. **CosmosLoader.tsx** (85 lines) + CosmosLoader.scss
   - Loading screen with animated planets/orbits
   - Used by: ResumeSpace3D.tsx
4. **OrbitalPositionEmitter.ts** (305 lines)
   - Observer pattern for tracking moving celestial objects
   - Real-time position updates for orbiting objects
   - Used by: ResumeSpace3D.tsx, SpaceshipNavigationSystem.ts
5. **SpaceshipNavigationSystem.ts** (653 lines)
   - Intelligent navigation to moving targets
   - Predictive algorithms, deceleration, orbit pausing
   - Used by: ResumeSpace3D.tsx
6. **SpaceshipHUD.tsx** (1 line - re-export)
   - Simple re-export of SpaceshipHUDClean
7. **SpaceshipHUDClean.tsx** (1913 lines!) + SpaceshipHUDClean.scss
   - Massive component with multiple concerns
   - HUD display, console, tour controls, navigation, ship controls, settings
8. **TourDefinitionBuilder.ts** (654 lines)
   - Builds tour definitions using cosmic data
   - Creates career journey tours

### Issues Identified

1. **Poor Organization**: Cosmos-related files scattered in root components directory
2. **Massive Component**: SpaceshipHUDClean.tsx is 1913 lines - needs decomposition
3. **Unclear Dependencies**: Hard to understand relationships between files
4. **Duplicate Logic**: Some navigation logic exists in multiple places
5. **No Clear Module Boundaries**: Everything lives at same level

### Dependency Analysis

```
ResumeSpace3D.tsx (MAIN ORCHESTRATOR)
├── CosmosLoader.tsx
├── CosmicNavigation.ts (CosmosCameraDirector, TourGuide, NavigationInterface)
├── CosmicContentOverlay.tsx
├── SpaceshipHUDClean.tsx
├── OrbitalPositionEmitter.ts
├── SpaceshipNavigationSystem.ts
└── TourDefinitionBuilder.ts
    ├── CosmicNavigation.ts (types)
    └── CosmicContentOverlay.tsx (types)

SpaceshipNavigationSystem.ts
└── OrbitalPositionEmitter.ts
```

## Refactoring Plan

### Phase 1: Create Subdirectories in Cosmos

```
src/components/cosmos/
├── components/          (existing - UI components)
├── context/            (existing - React contexts)
├── hooks/              (existing - custom hooks)
├── systems/            (existing - Three.js systems)
├── types/              (existing - TypeScript types)
├── utils/              (existing - utilities)
├── ui/                 (NEW - UI overlay components)
│   ├── CosmosLoader.tsx
│   ├── CosmosLoader.scss
│   ├── ContentOverlay.tsx
│   ├── ContentOverlay.scss
│   ├── SpaceshipHUD/
│   │   ├── SpaceshipHUD.tsx (main component)
│   │   ├── SpaceshipHUD.scss
│   │   ├── components/
│   │   │   ├── ConsolePanel.tsx
│   │   │   ├── ConsolePanel.scss
│   │   │   ├── TourControls.tsx
│   │   │   ├── TourControls.scss
│   │   │   ├── NavigationPanel.tsx
│   │   │   ├── NavigationPanel.scss
│   │   │   ├── FlightControls.tsx
│   │   │   ├── FlightControls.scss
│   │   │   ├── SettingsPanel.tsx
│   │   │   ├── SettingsPanel.scss
│   │   │   ├── ContentDisplay.tsx
│   │   │   └── ContentDisplay.scss
│   │   └── index.ts
│   └── index.ts
├── navigation/         (NEW - navigation systems)
│   ├── CameraDirector.ts
│   ├── TourGuide.ts
│   ├── NavigationInterface.ts
│   ├── TourDefinitionBuilder.ts
│   ├── OrbitalPositionEmitter.ts
│   ├── SpaceshipNavigationSystem.ts
│   └── index.ts
└── index.ts
```

### Phase 2: Decompose SpaceshipHUDClean.tsx

**Current Structure** (1913 lines in one file):

- User info display
- Console panel
- Tour controls
- Spaceship controls
- Navigation panel
- Settings panel
- Content overlay
- Mission control logs

**Proposed Structure**:

1. **SpaceshipHUD.tsx** (main orchestrator, ~150 lines)
   - Layout and panel management
   - State coordination
   - Props distribution

2. **ConsolePanel.tsx** (~200 lines)
   - Console display
   - Log management
   - Copy/clear functionality

3. **TourControls.tsx** (~150 lines)
   - Tour progress display
   - Next/previous waypoint
   - Tour start/end controls

4. **NavigationPanel.tsx** (~250 lines)
   - Navigation targets list
   - Current destination display
   - Distance/ETA display
   - Navigation actions

5. **FlightControls.tsx** (~200 lines)
   - Manual flight controls
   - Keyboard input display
   - Speed indicators
   - Ship view mode toggles

6. **SettingsPanel.tsx** (~200 lines)
   - Cosmos visualization settings
   - Control settings
   - Light controls

7. **ContentDisplay.tsx** (~300 lines)
   - Content sections rendering
   - Media display
   - Actions handling

8. **Shared Styles**
   - Extract common HUD styling into mixins
   - Panel base styles
   - Animation styles
   - Glassmorphism effects

### Phase 3: Rename and Reorganize

**Renames for Clarity**:

- `CosmicContentOverlay.tsx` → `ContentOverlay.tsx` (in cosmos/ui/)
- `CosmicNavigation.ts` → Split into 3 files in cosmos/navigation/:
  - `CameraDirector.ts` (camera movement)
  - `TourGuide.ts` (tour management)
  - `NavigationInterface.ts` (navigation state/actions)

**File Moves**:

```
src/components/ → src/components/cosmos/ui/
├── CosmosLoader.tsx
├── CosmosLoader.scss
├── ContentOverlay.tsx
├── ContentOverlay.scss
└── SpaceshipHUD/ (decomposed)

src/components/ → src/components/cosmos/navigation/
├── CameraDirector.ts
├── TourGuide.ts
├── NavigationInterface.ts
├── TourDefinitionBuilder.ts
├── OrbitalPositionEmitter.ts
└── SpaceshipNavigationSystem.ts
```

### Phase 4: Update Imports and Exports

1. Create barrel exports (`index.ts`) for each subdirectory
2. Update all imports in `ResumeSpace3D.tsx` to use new paths
3. Update imports in `cosmos/` modules to use relative paths within cosmos
4. Remove old files from `src/components/`

### Phase 5: Extract CSS to SCSS

**Files needing CSS extraction**:

- None identified - SpaceshipHUDClean already has separate SCSS file ✓
- CosmicContentOverlay already has separate SCSS file ✓
- CosmosLoader already has separate SCSS file ✓

**However, when decomposing SpaceshipHUD**:

- Extract relevant SCSS sections for each subcomponent
- Create shared `_hud-mixins.scss` for common patterns
- Create `_hud-variables.scss` for HUD-specific variables

## Benefits of This Refactoring

1. **Better Organization**: All cosmos-related code in one directory
2. **Clearer Boundaries**:
   - `ui/` for display components
   - `navigation/` for navigation logic
   - `systems/` for Three.js systems
   - `hooks/` for React hooks
3. **Maintainability**: Smaller files, focused responsibilities
4. **Discoverability**: Easier to find related code
5. **Testability**: Smaller units easier to test
6. **Reusability**: Decomposed HUD components can be used independently
7. **Performance**: Potentially better code splitting opportunities

## Implementation Steps

### Step 1: Create New Directory Structure

```bash
mkdir src/components/cosmos/ui
mkdir src/components/cosmos/ui/SpaceshipHUD
mkdir src/components/cosmos/ui/SpaceshipHUD/components
mkdir src/components/cosmos/navigation
```

### Step 2: Decompose SpaceshipHUDClean.tsx

- Extract ConsolePanel component
- Extract TourControls component
- Extract NavigationPanel component
- Extract FlightControls component
- Extract SettingsPanel component
- Extract ContentDisplay component
- Create main SpaceshipHUD orchestrator
- Extract corresponding SCSS sections

### Step 3: Move and Refactor Navigation Files

- Split CosmicNavigation.ts into 3 files
- Move to cosmos/navigation/
- Update imports

### Step 4: Move UI Files

- Move CosmosLoader to cosmos/ui/
- Move CosmicContentOverlay to cosmos/ui/ (rename to ContentOverlay)
- Move OrbitalPositionEmitter to cosmos/navigation/
- Move SpaceshipNavigationSystem to cosmos/navigation/
- Move TourDefinitionBuilder to cosmos/navigation/

### Step 5: Create Barrel Exports

- cosmos/ui/index.ts
- cosmos/navigation/index.ts
- cosmos/ui/SpaceshipHUD/index.ts
- cosmos/ui/SpaceshipHUD/components/index.ts

### Step 6: Update All Imports

- Update ResumeSpace3D.tsx imports
- Update any other files importing these modules
- Test that everything still works

### Step 7: Remove Old Files

- Delete files from src/components/ after verifying imports work

## Risk Assessment

**Low Risk**:

- Moving files to new directories (TypeScript will catch import errors)
- Creating barrel exports
- Extracting SCSS (already separated)

**Medium Risk**:

- Splitting CosmicNavigation.ts (needs careful interface preservation)
- Moving TourDefinitionBuilder.ts (check for circular dependencies)

**High Risk**:

- Decomposing SpaceshipHUDClean.tsx (1913 lines, complex state management)
  - Need to preserve all functionality
  - Need to ensure state lifting works correctly
  - Many props and callbacks to manage

## Testing Strategy

1. After each file move, run `npm run build` to check for errors
2. After decomposing HUD, test in browser:
   - All panels render correctly
   - All interactions work
   - All state updates properly
   - No visual regressions
3. Test tour navigation
4. Test spaceship controls
5. Test content overlay display

## Timeline Estimate

- **Phase 1 (Directory Structure)**: 15 minutes
- **Phase 2 (Decompose HUD)**: 3-4 hours
- **Phase 3 (Move/Rename Files)**: 1 hour
- **Phase 4 (Update Imports)**: 30 minutes
- **Phase 5 (Extract SCSS)**: 1 hour
- **Testing**: 1-2 hours

**Total**: ~7-9 hours of work

## Decision: Proceed?

**Recommendation**: YES - This refactoring will significantly improve code organization and maintainability.

**Suggested Approach**:

1. Start with low-risk moves (CosmosLoader, OrbitalPositionEmitter, etc.)
2. Test thoroughly after each move
3. Save HUD decomposition for last (most complex)
4. Consider doing HUD decomposition in a separate branch

Would you like to proceed with this refactoring plan?
