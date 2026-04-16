import type {
  PortfolioCoreSeed,
  PortfolioEntrySeed,
  PortfolioItem,
} from "../types";

export function flattenPortfolioCores(cores: PortfolioCoreSeed[]): PortfolioItem[] {
  const deduped = new Map<string, PortfolioItem>();

  cores.forEach((core) => {
    core.plains?.forEach((plain, plainIndex) => {
      plain.items?.forEach((ring, ringIndex) => {
        ring.items?.forEach((entry) => {
          if (!isPublished(entry)) return;
          if (deduped.has(entry.id)) return;
          deduped.set(entry.id, toPortfolioItem(core.core, plainIndex, ringIndex, entry));
        });
      });
    });
  });

  return Array.from(deduped.values());
}

function isPublished(entry: PortfolioEntrySeed) {
  return entry.published !== false;
}

function toPortfolioItem(
  coreName: string,
  plainIndex: number,
  ringIndex: number,
  entry: PortfolioEntrySeed,
): PortfolioItem {
  return {
    id: entry.id,
    title: entry.title,
    description: entry.description ?? "No description provided.",
    image: entry.image ?? "",
    technologies: entry.technologies ?? [],
    year: entry.year ?? null,
    category: coreName,
    subcategory: `Plane ${plainIndex + 1} / Ring ${ringIndex + 1}`,
    detailMedia: entry.galleryMedia ?? [],
  };
}
