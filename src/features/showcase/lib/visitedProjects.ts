// Projects the visitor has opened, remembered in this browser so the list can
// mark them. A convenience only: without storage nothing is marked.
const STORAGE_KEY = "showcase:visited-projects";

export const readVisitedProjects = (): Set<string> => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
};

export const markProjectVisited = (id: string) => {
  try {
    const visited = readVisitedProjects();
    if (visited.has(id)) return;
    visited.add(id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...visited]));
  } catch {
    // Not remembered; nothing else depends on it.
  }
};
