export interface JsonDifference {
  path: string;
  expected: unknown;
  actual: unknown;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const matchesPrefix = (path: string, pattern: string): boolean => {
  const p = path.split(".");
  const q = pattern.split(".");
  return q.length <= p.length && q.every((segment, i) => segment === "*" || segment === p[i]);
};

// Structural JSON diff. Paths use dots with [index] for arrays, e.g.
// "resume.experience[0].positions[1].title". Excluded prefixes are skipped.
export const diffJson = (
  expected: unknown,
  actual: unknown,
  excluded: readonly string[] = [],
  path = "",
  out: JsonDifference[] = [],
): JsonDifference[] => {
  const normalized = path.replace(/\[\d+\]/g, "");
  if (path && excluded.some((pattern) => matchesPrefix(normalized, pattern))) return out;

  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) {
      out.push({ path: `${path}.length`, expected: expected.length, actual: actual.length });
    }
    const n = Math.min(expected.length, actual.length);
    for (let i = 0; i < n; i += 1) diffJson(expected[i], actual[i], excluded, `${path}[${i}]`, out);
    return out;
  }

  if (isObject(expected) && isObject(actual)) {
    for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
      const child = path ? `${path}.${key}` : key;
      if (!(key in actual)) {
        if (!excluded.some((pattern) => matchesPrefix(child.replace(/\[\d+\]/g, ""), pattern))) {
          out.push({ path: child, expected: expected[key], actual: undefined });
        }
      } else if (!(key in expected)) {
        out.push({ path: child, expected: undefined, actual: actual[key] });
      } else {
        diffJson(expected[key], actual[key], excluded, child, out);
      }
    }
    return out;
  }

  if (!Object.is(expected, actual)) out.push({ path, expected, actual });
  return out;
};
