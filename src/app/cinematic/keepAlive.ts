/** The address of the cinematic experience. */
export const CINEMATIC_PATH = "/cinematic";

/**
 * Keeping the 3D experience (and the portfolio's scenes behind it) alive costs
 * their memory for the rest of the visit, so only desktops with a mouse and at
 * least 8 GB of RAM do it. Browsers that don't report memory (Firefox, Safari)
 * unload whichever side isn't showing.
 */
export const canKeepAlive = () => {
  if (typeof window === "undefined") return false;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 0;
  return window.matchMedia("(min-width: 900px) and (pointer: fine)").matches && memory >= 8;
};
