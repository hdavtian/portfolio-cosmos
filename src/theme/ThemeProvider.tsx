import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { defaultThemeId, themeRegistry } from "./themeRegistry";
import { getThemeStorageKey } from "./themeInit";

interface ThemeContextValue {
  themeId: string;
  setThemeId: (nextThemeId: string) => void;
  themes: typeof themeRegistry;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: PropsWithChildren) {
  const [themeId, setThemeId] = useState<string>(
    document.documentElement.dataset.theme || defaultThemeId,
  );

  useEffect(() => {
    const isKnownTheme = themeRegistry.some((theme) => theme.id === themeId);
    const resolvedTheme = isKnownTheme ? themeId : defaultThemeId;

    document.documentElement.dataset.theme = resolvedTheme;
    window.localStorage.setItem(getThemeStorageKey(), resolvedTheme);
  }, [themeId]);

  const value = useMemo(
    () => ({
      themeId,
      setThemeId,
      themes: themeRegistry,
    }),
    [themeId],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
