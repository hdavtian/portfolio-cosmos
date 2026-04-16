import { useMemo } from "react";
import { usePersistentState } from "./usePersistentState";

const COMPARE_KEY = "fast-experience:portfolio:compare";
const COMPARE_LIMIT = 3;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function useCompareSelection() {
  const [compareIds, setCompareIds] = usePersistentState<string[]>(
    COMPARE_KEY,
    [],
    isStringArray,
  );

  const compareSet = useMemo(() => new Set(compareIds), [compareIds]);

  const toggleCompare = (id: string) => {
    setCompareIds((current) => {
      if (current.includes(id)) {
        return current.filter((item) => item !== id);
      }
      if (current.length >= COMPARE_LIMIT) {
        return current;
      }
      return [...current, id];
    });
  };

  const clearCompare = () => setCompareIds([]);
  const canAddMore = compareIds.length < COMPARE_LIMIT;

  return {
    compareIds,
    compareSet,
    toggleCompare,
    clearCompare,
    canAddMore,
    compareLimit: COMPARE_LIMIT,
  };
}
