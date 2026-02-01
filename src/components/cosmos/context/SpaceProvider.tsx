/**
 * SpaceProvider.tsx
 *
 * Combined provider that wraps both SpaceContext and NavigationContext.
 * Simplifies setup by providing both contexts in a single component.
 */

import React from "react";
import type { ReactNode } from "react";
import type { SpaceSceneOptions } from "./SpaceContext";
import { SpaceContextProvider } from "./SpaceContext";
import { NavigationContextProvider } from "./NavigationContext";

export interface SpaceProviderProps {
  children: ReactNode;
  initialOptions?: Partial<SpaceSceneOptions>;
}

export const SpaceProvider: React.FC<SpaceProviderProps> = ({
  children,
  initialOptions,
}) => {
  return (
    <SpaceContextProvider initialOptions={initialOptions}>
      <NavigationContextProvider>{children}</NavigationContextProvider>
    </SpaceContextProvider>
  );
};
