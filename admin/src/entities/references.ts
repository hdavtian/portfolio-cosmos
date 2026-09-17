import { useQueries } from "@tanstack/react-query";
import { api } from "../lib/apiClient";
import type { PagedResult } from "../lib/entityApi";
import type { EntityDefinition } from "./definitions";

// A type alias, not an interface: Syncfusion's dataSource expects objects with an
// index signature, which TypeScript grants to type aliases but not interfaces.
export type ReferenceOption = {
  slug: string;
  label: string;
  /** Present when the referenced entity is a tree (it has parentSlug). */
  parentSlug?: string;
};

/**
 * Loads the options for every reference field of a definition (e.g. skill
 * categories for skills). useQueries keeps hook order stable however many
 * reference fields a definition has.
 */
export function useReferenceOptions(definition: EntityDefinition) {
  const referenceFields = definition.fields.filter((field) => field.kind === "reference" && field.reference);

  const results = useQueries({
    queries: referenceFields.map((field) => ({
      queryKey: [field.reference!.entity, "options"],
      queryFn: () =>
        api.get<PagedResult<Record<string, unknown>>>(
          `/api/v2/admin/${field.reference!.entity}?pageSize=100&sort=sortOrder`,
        ),
    })),
  });

  const options: Record<string, ReferenceOption[]> = {};
  referenceFields.forEach((field, index) => {
    const items = results[index]?.data?.items ?? [];
    options[field.key] = items.map((item) => ({
      slug: String(item.slug),
      label: String(item[field.reference!.labelField] ?? item.slug),
      ...(typeof item.parentSlug === "string" ? { parentSlug: item.parentSlug } : {}),
    }));
  });

  return {
    options,
    isLoading: results.some((result) => result.isLoading),
    /** Display label for a stored slug, falling back to the slug itself. */
    labelFor: (fieldKey: string, slug: unknown) =>
      slug === "" ? "" : (options[fieldKey]?.find((option) => option.slug === slug)?.label ?? String(slug ?? "")),
  };
}
