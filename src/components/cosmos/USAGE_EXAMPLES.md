# Using SpaceCanvas and SpaceOverlays

Quick integration examples for the new Phase 5.3 and 5.4 components.

## SpaceCanvas Component

Canvas wrapper providing responsive container with event management.

### Basic Usage

```typescript
import { SpaceCanvas } from './cosmos/components';

function MyApp() {
  const handleResize = (width: number, height: number) => {
    console.log(`Canvas resized to ${width}x${height}`);
  };

  return (
    <SpaceCanvas
      onResize={handleResize}
      enableFullscreen={true}
      enablePointerLock={false}
    >
      {/* Your 3D scene content */}
    </SpaceCanvas>
  );
}
```

### With Event Handlers

```typescript
<SpaceCanvas
  onPointerMove={(e) => handlePointerMove(e)}
  onPointerDown={(e) => handlePointerDown(e)}
  onClick={(e) => handleClick(e)}
  onResize={(w, h) => updateCamera(w, h)}
  enableFullscreen={true}
>
  <SpaceScene containerRef={containerRef} />
</SpaceCanvas>
```

### Using Canvas Controls Hook

```typescript
import { useCanvasControls } from './cosmos/components';

function MyComponent() {
  const { isFullscreen, isPointerLocked } = useCanvasControls();

  return (
    <div>
      {isFullscreen && <div>Fullscreen mode active</div>}
      {isPointerLocked && <div>Pointer locked</div>}
    </div>
  );
}
```

## SpaceOverlays Components

UI overlay system with logging, navigation status, and loading screens.

### Combined Overlays

```typescript
import { SpaceOverlays } from './cosmos/components';

function MyApp() {
  const [isLoading, setIsLoading] = useState(true);

  return (
    <>
      <SpaceCanvas>
        <SpaceScene onReady={() => setIsLoading(false)} />
      </SpaceCanvas>

      <SpaceOverlays
        showConsole={true}
        showMissionLog={true}
        showNavStatus={true}
        showLoading={isLoading}
        loadingMessage="Initializing galaxy..."
        loadingProgress={75}
      />
    </>
  );
}
```

### Individual Overlay Components

#### Console Log

```typescript
import { ConsoleLog } from './cosmos/components';

<ConsoleLog
  visible={true}
  maxLogs={10}
  position="top-right"
/>
```

#### Mission Log

```typescript
import { MissionLog } from './cosmos/components';

<MissionLog
  visible={true}
  maxLogs={5}
/>
```

#### Navigation Status

```typescript
import { NavigationStatus } from './cosmos/components';

<NavigationStatus visible={true} />
```

#### Loading Screen

```typescript
import { LoadingScreen } from './cosmos/components';

<LoadingScreen
  visible={isLoading}
  message="Loading assets..."
  progress={loadingProgress}
/>
```

## Complete Integration Example

```typescript
import React, { useRef, useState } from 'react';
import { SpaceProvider } from './cosmos/context';
import { SpaceCanvas, SpaceScene, SpaceOverlays } from './cosmos/components';

export default function MySpaceApp() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);

  const handleSceneReady = () => {
    setIsLoading(false);
  };

  const handleResize = (width: number, height: number) => {
    // Update camera aspect ratio
    console.log(`Resized to ${width}x${height}`);
  };

  return (
    <SpaceProvider
      initialOptions={{
        labelsVisible: true,
        orbitsVisible: true,
        bloomEnabled: true,
        bloomStrength: 0.8,
      }}
    >
      <SpaceCanvas
        ref={containerRef}
        onResize={handleResize}
        enableFullscreen={true}
      >
        <SpaceScene
          containerRef={containerRef}
          onReady={handleSceneReady}
        />
      </SpaceCanvas>

      <SpaceOverlays
        showConsole={true}
        showMissionLog={true}
        showNavStatus={true}
        showLoading={isLoading}
        loadingMessage="Initializing cosmos..."
        loadingProgress={loadingProgress}
      />
    </SpaceProvider>
  );
}
```

## Features

### SpaceCanvas Features

- ✅ Automatic resize handling
- ✅ Touch gesture prevention
- ✅ Pointer lock support
- ✅ Fullscreen toggle
- ✅ Clean event management
- ✅ Keyboard focus support

### SpaceOverlays Features

- ✅ Console logging with context integration
- ✅ Mission control logs
- ✅ Real-time navigation status
- ✅ Animated loading screen
- ✅ Customizable visibility
- ✅ Responsive styling

## Styling

All overlay components use inline styles for portability but can be customized:

```typescript
// Custom styled console
<ConsoleLog
  visible={true}
  position="bottom-left"
  // Add custom className for additional styling
/>
```

## Integration with Context

The overlay components automatically integrate with cosmos contexts:

```typescript
// ConsoleLog uses useLogger()
// NavigationStatus uses useNavigationContext()
// All respect SpaceContext settings
```

No additional wiring needed - just wrap with SpaceProvider!
