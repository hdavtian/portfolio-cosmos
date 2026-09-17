import { createContext, useContext } from "react";

export interface BackdropTint {
  /** Tint the backdrop towards a colour; null returns to the neutral default. */
  setTint: (color: string | null) => void;
  /** Technologies of the project open on the page; 3D scenes may light them. */
  setHighlights: (technologies: string[]) => void;
  /** Project whose preview is open; 3D scenes may bring it into view. */
  setFocusProject: (projectId: string | null) => void;
  /** True while a cinematic 3D scene is on screen behind the page. */
  sceneShowing: boolean;
}

export const BackdropTintContext = createContext<BackdropTint>({
  setTint: () => {},
  setHighlights: () => {},
  setFocusProject: () => {},
  sceneShowing: false,
});

/** Lets a showcase page colour and inform the shared backdrop. */
export const useBackdropTint = () => useContext(BackdropTintContext);
