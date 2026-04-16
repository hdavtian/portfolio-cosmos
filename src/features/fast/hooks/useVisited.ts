import { useCallback, useMemo } from "react";
import { usePersistentState } from "./usePersistentState";

const VISITED_KEY = "fast-experience:visited-portfolio";

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function useVisited() {
  const [visitedIds, setVisitedIds] = usePersistentState<string[]>(
    VISITED_KEY,
    [],
    isStringArray,
  );

  const visitedSet = useMemo(() => new Set(visitedIds), [visitedIds]);

  const markVisited = useCallback(
    (id: string) => {
      setVisitedIds((current) => (current.includes(id) ? current : [...current, id]));
    },
    [setVisitedIds],
  );

  const clearVisited = useCallback(() => {
    setVisitedIds([]);
  }, [setVisitedIds]);

  return {
    visitedIds,
    visitedSet,
    markVisited,
    clearVisited,
  };
}
