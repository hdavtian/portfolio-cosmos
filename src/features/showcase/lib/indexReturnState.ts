// Where the visitor was on the work index when they opened a project, so coming
// back (browser Back or "Return to index") lands on the same filters, open
// preview and scroll position. Per tab, via sessionStorage.
const KEY = "showcase:index-return";

export interface IndexReturnState {
  search: string;
  scrollY: number;
}

export function saveIndexReturnState(state: IndexReturnState): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage can be unavailable (private mode); returning just starts at the top.
  }
}

export function readIndexReturnState(): IndexReturnState | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<IndexReturnState>;
    return typeof parsed.search === "string" && typeof parsed.scrollY === "number"
      ? { search: parsed.search, scrollY: parsed.scrollY }
      : null;
  } catch {
    return null;
  }
}

export function clearIndexReturnState(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
