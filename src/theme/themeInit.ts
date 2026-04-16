import { defaultThemeId, themeRegistry } from "./themeRegistry";

const THEME_STORAGE_KEY = "fast-experience:theme";

export function applyInitialTheme() {
  if (typeof document === "undefined") return;

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  const isKnownTheme = themeRegistry.some((theme) => theme.id === storedTheme);
  const nextTheme = isKnownTheme && storedTheme ? storedTheme : defaultThemeId;

  document.documentElement.dataset.theme = nextTheme;
}

export function getThemeStorageKey() {
  return THEME_STORAGE_KEY;
}
