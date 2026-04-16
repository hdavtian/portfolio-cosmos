import { useEffect, useState } from "react";

export function usePersistentState<T>(
  storageKey: string,
  fallbackValue: T,
  isValid: (value: unknown) => value is T = (_): _ is T => true,
) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return fallbackValue;
      const parsed = JSON.parse(raw) as unknown;
      return isValid(parsed) ? parsed : fallbackValue;
    } catch {
      return fallbackValue;
    }
  });

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
  }, [storageKey, value]);

  return [value, setValue] as const;
}
