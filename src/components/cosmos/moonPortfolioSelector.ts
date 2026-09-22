import type {
  PortfolioCoreSeed,
  PortfolioEntry,
  PortfolioResolvedMediaItem,
} from "./portfolioData";
import { entryFromSeed, resolvePortfolioMediaItems } from "./portfolioData";
import type { MoonPortfolioMapping as MoonPortfolioCompanyMapping } from "@hd/content-schema";

type MoonPortfolioTabMapping = MoonPortfolioCompanyMapping["tabs"][number];

export type MoonPortfolioSubcategory = {
  id: string;
  title: string;
  description?: string;
  technologies: string[];
  mediaItems: PortfolioResolvedMediaItem[];
};

export type MoonPortfolioCard = {
  id: string;
  title: string;
  description?: string;
  technologies: string[];
  mediaItems: PortfolioResolvedMediaItem[];
  subcategories?: MoonPortfolioSubcategory[];
};

export type MoonPortfolioTab = {
  id: string;
  title: string;
  cards: MoonPortfolioCard[];
};

export type MoonPortfolioPayload = {
  companyId: string;
  companyName: string;
  tabs: MoonPortfolioTab[];
};

const normalize = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "");

const collectCoreEntries = (
  coreSeeds: PortfolioCoreSeed[],
  mapping: MoonPortfolioCompanyMapping,
): PortfolioEntry[] => {
  // The cores this job draws from; none listed means all of them.
  const includeCores = new Set(mapping.coreSlugs);
  const includeIds = new Set(mapping.includeEntrySlugs);
  const excludeIds = new Set(mapping.excludeEntrySlugs);
  const dedupe = new Set<string>();
  const entries: PortfolioEntry[] = [];
  coreSeeds.forEach((coreSeed) => {
    const coreAllowed = includeCores.size === 0 || includeCores.has(coreSeed.slug);
    coreSeed.planes.forEach((plane) => {
      plane.rings.forEach((ring) => {
        ring.entries.forEach((item) => {
          const entry = entryFromSeed(item);
          if (excludeIds.has(entry.id)) return;
          if (includeIds.size > 0 && !includeIds.has(entry.id)) return;
          if (!coreAllowed && includeIds.size === 0) return;
          if (dedupe.has(entry.id)) return;
          dedupe.add(entry.id);
          entries.push(entry);
        });
      });
    });
  });
  return entries;
};

const toCards = (entries: PortfolioEntry[]): MoonPortfolioCard[] =>
  entries.map((entry) => {
    const variants = (entry.clientVariants ?? []).filter((v) => Boolean(v?.title));
    const subcategories: MoonPortfolioSubcategory[] | undefined =
      variants.length > 0
        ? variants.map((variant, vi) => ({
            id: variant.id,
            title: variant.title,
            description: variant.description,
            technologies: variant.technologies ?? entry.technologies ?? [],
            mediaItems: resolvePortfolioMediaItems(entry, {
              variant,
              variantIndex: vi,
            }),
          }))
        : undefined;
    return {
      id: entry.id,
      title: entry.title,
      description: entry.description,
      technologies: entry.technologies ?? [],
      mediaItems: resolvePortfolioMediaItems(entry),
      subcategories,
    };
  });

const resolveTabEntries = (
  tab: MoonPortfolioTabMapping,
  allEntries: PortfolioEntry[],
): PortfolioEntry[] => {
  const includeIds = new Set(tab.includeEntrySlugs);
  if (includeIds.size === 0) return allEntries;
  return allEntries.filter((entry) => includeIds.has(entry.id));
};

export const buildMoonPortfolioPayload = (args: {
  companyId: string;
  companyName: string;
  coreSeeds: PortfolioCoreSeed[];
  mappings: MoonPortfolioCompanyMapping[];
}): MoonPortfolioPayload | null => {
  const { companyId, companyName, coreSeeds, mappings } = args;
  const mapping = mappings.find(
    (item) => normalize(item.experienceSlug) === normalize(companyId),
  );
  if (!mapping) return null;
  const allEntries = collectCoreEntries(coreSeeds, mapping);
  if (allEntries.length === 0) return null;

  const tabs: MoonPortfolioTab[] =
    mapping.tabs && mapping.tabs.length > 0
      ? mapping.tabs
          .map((tab) => ({
            id: tab.slug,
            title: tab.title,
            cards: toCards(resolveTabEntries(tab, allEntries)),
          }))
          .filter((tab) => tab.cards.length > 0)
      : [
          {
            id: `${companyId}-projects`,
            title: "Projects",
            cards: toCards(allEntries),
          },
        ];
  if (tabs.length === 0) return null;
  return { companyId, companyName, tabs };
};

