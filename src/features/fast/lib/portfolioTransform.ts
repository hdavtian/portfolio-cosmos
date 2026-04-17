import type {
  PortfolioCoreSeed,
  PortfolioEntrySeed,
  PortfolioItem,
  PortfolioClientVariantSeed,
  PortfolioMedia,
} from "../types";

export function flattenPortfolioCores(cores: PortfolioCoreSeed[]): PortfolioItem[] {
  const deduped = new Map<string, PortfolioItem>();

  cores.forEach((core) => {
    core.plains?.forEach((plain) => {
      plain.items?.forEach((ring) => {
        ring.items?.forEach((entry) => {
          if (!isPublished(entry)) return;

          const variants = entry.clientVariants?.filter((variant) => Boolean(variant.id));
          if (variants && variants.length > 0) {
            variants.forEach((variant) => {
              if (deduped.has(variant.id)) return;
              deduped.set(
                variant.id,
                toPortfolioVariantItem(core.core, entry.title, entry, variant),
              );
            });
            return;
          }

          if (deduped.has(entry.id)) return;
          deduped.set(entry.id, toPortfolioItem(core.core, entry));
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
  entry: PortfolioEntrySeed,
): PortfolioItem {
  const primaryImage = entry.image ?? "";
  return {
    id: entry.id,
    title: entry.title,
    description: entry.description ?? "No description provided.",
    image: primaryImage,
    technologies: entry.technologies ?? [],
    year: entry.year ?? null,
    category: coreName,
    subcategory: "General",
    detailMedia: buildDetailMedia({
      itemId: entry.id,
      title: entry.title,
      description: entry.description,
      primaryImage,
      galleryMedia: entry.galleryMedia,
    }),
    isClientVariation: false,
  };
}

function toPortfolioVariantItem(
  coreName: string,
  parentTitle: string,
  parentEntry: PortfolioEntrySeed,
  variant: PortfolioClientVariantSeed,
): PortfolioItem {
  const primaryImage = variant.image ?? parentEntry.image ?? "";
  const description =
    variant.description ??
    parentEntry.description ??
    "No description provided.";
  return {
    id: variant.id,
    title: variant.title,
    description,
    image: primaryImage,
    technologies: variant.technologies ?? parentEntry.technologies ?? [],
    year:
      typeof variant.year === "number"
        ? variant.year
        : (parentEntry.year ?? null),
    category: coreName,
    subcategory: parentTitle,
    detailMedia: buildDetailMedia({
      itemId: variant.id,
      title: variant.title,
      description,
      primaryImage,
      galleryMedia: variant.galleryMedia ?? parentEntry.galleryMedia,
    }),
    isClientVariation: true,
  };
}

interface BuildDetailMediaInput {
  itemId: string;
  title: string;
  description?: string;
  primaryImage: string;
  galleryMedia?: PortfolioMedia[];
}

function buildDetailMedia({
  itemId,
  title,
  description,
  primaryImage,
  galleryMedia,
}: BuildDetailMediaInput): PortfolioMedia[] {
  const media = [...(galleryMedia ?? [])];

  if (!primaryImage) {
    return media;
  }

  const alreadyIncluded = media.some((entry) => entry.image === primaryImage);
  if (alreadyIncluded) {
    return media;
  }

  return [
    {
      id: `${itemId}-cover`,
      type: "image",
      image: primaryImage,
      title,
      description: description ?? "",
    },
    ...media,
  ];
}
