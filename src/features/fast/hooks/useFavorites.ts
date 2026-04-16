import { useMemo } from "react";
import { usePersistentState } from "./usePersistentState";

const FAVORITES_KEY = "fast-experience:favorites";

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function useFavorites() {
  const [favoriteIds, setFavoriteIds] = usePersistentState<string[]>(
    FAVORITES_KEY,
    [],
    isStringArray,
  );

  const favoritesSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  const toggleFavorite = (id: string) => {
    setFavoriteIds((current) => {
      if (current.includes(id)) {
        return current.filter((itemId) => itemId !== id);
      }
      return [...current, id];
    });
  };

  return {
    favoriteIds,
    favoritesSet,
    toggleFavorite,
  };
}
