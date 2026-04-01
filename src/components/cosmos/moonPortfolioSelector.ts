import type {
  PortfolioCoreSeed,
  PortfolioEntry,
  PortfolioResolvedMediaItem,
} from "./portfolioData";
import { resolvePortfolioMediaItems } from "./portfolioData";
import type {
  MoonPortfolioCompanyMapping,
  MoonPortfolioTabMapping,
} from "../../data/moonPortfolioMapping";

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

const toEntry = (item: unknown): PortfolioEntry | null => {
  if (!item || typeof item !== "object") return null;
  const value = item as Partial<PortfolioEntry>;
  if (
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    typeof value.image !== "string"
  ) {
    return null;
  }
  return {
    id: value.id,
    title: value.title,
    image: value.image,
    description: value.description,
    technologies: value.technologies ?? [],
    year: value.year ?? null,
    fit: value.fit,
    galleryMedia: value.galleryMedia ?? [],
    clientVariants: value.clientVariants ?? [],
    published: value.published,
  };
};

const normalize = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "");

const matchesCore = (coreTitle: string, target: string): boolean => {
  const a = normalize(coreTitle);
  const b = normalize(target);
  return a.includes(b) || b.includes(a);
};

const collectCoreEntries = (
  coreSeeds: PortfolioCoreSeed[],
  mapping: MoonPortfolioCompanyMapping,
): PortfolioEntry[] => {
  const includeCoreTitles = mapping.coreTitles ?? [];
  const includeIds = new Set(mapping.includeEntryIds ?? []);
  const excludeIds = new Set(mapping.excludeEntryIds ?? []);
  const dedupe = new Set<string>();
  const entries: PortfolioEntry[] = [];
  coreSeeds.forEach((coreSeed) => {
    const coreAllowed =
      includeCoreTitles.length === 0 ||
      includeCoreTitles.some((title) => matchesCore(coreSeed.core ?? "", title));
    coreSeed.plains?.forEach((plain) => {
      plain.items?.forEach((ring) => {
        ring.items?.forEach((item) => {
          const entry = toEntry(item);
          if (!entry) return;
          if (entry.published === false) return;
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
              maxMediaItems: 12,
            }),
          }))
        : undefined;
    return {
      id: entry.id,
      title: entry.title,
      description: entry.description,
      technologies: entry.technologies ?? [],
      mediaItems: resolvePortfolioMediaItems(entry, { maxMediaItems: 12 }),
      subcategories,
    };
  });

const resolveTabEntries = (
  tab: MoonPortfolioTabMapping,
  allEntries: PortfolioEntry[],
): PortfolioEntry[] => {
  const includeIds = new Set(tab.includeEntryIds ?? []);
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
    (item) => normalize(item.companyId) === normalize(companyId),
  );
  if (!mapping) return null;
  const allEntries = collectCoreEntries(coreSeeds, mapping);
  if (allEntries.length === 0) return null;

  const tabs: MoonPortfolioTab[] =
    mapping.tabs && mapping.tabs.length > 0
      ? mapping.tabs
          .map((tab) => ({
            id: tab.id,
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

