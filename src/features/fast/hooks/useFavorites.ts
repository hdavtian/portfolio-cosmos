import { useEffect, useMemo, useState } from "react";

const FAVORITES_KEY = "fast-experience:favorites";

export function useFavorites() {
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);

  useEffect(() => {
    const raw = window.localStorage.getItem(FAVORITES_KEY);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as string[];
      setFavoriteIds(Array.isArray(parsed) ? parsed : []);
    } catch {
      setFavoriteIds([]);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(favoriteIds));
  }, [favoriteIds]);

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
