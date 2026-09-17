import { createContext, useContext } from "react";

export interface BackdropTint {
  /** Tint the backdrop towards a colour; null returns to the neutral default. */
  setTint: (color: string | null) => void;
}

export const BackdropTintContext = createContext<BackdropTint>({ setTint: () => {} });

/** Lets a showcase page colour the shared WebGL backdrop (e.g. by project core). */
export const useBackdropTint = () => useContext(BackdropTintContext);
