import type { ClientVariant, GalleryItem, PortfolioEntry } from "@hd/content-schema";
import { mediaUrl, type Release } from "../../../lib/api/release";
import type { PortfolioItem, PortfolioMedia } from "../types";

/**
 * The published projects as the pages list them: one item per entry, or one
 * per client site where an entry groups several. Ordered as the portfolio is
 * laid out: by core, then plane, then ring, then the entry's own order.
 */
export function portfolioItemsFromRelease(release: Release): PortfolioItem[] {
  const { portfolioCores, portfolioEntries } = release.collections;
  const coreOrder = new Map(portfolioCores.map((core, index) => [core.slug, index]));
  const coreName = new Map(portfolioCores.map((core) => [core.slug, core.name]));

  const entries = portfolioEntries
    .filter((entry) => coreOrder.has(entry.coreSlug))
    .map((entry, index) => ({ entry, index }))
    .sort(
      (a, b) =>
        coreOrder.get(a.entry.coreSlug)! - coreOrder.get(b.entry.coreSlug)! ||
        a.entry.placement.plane - b.entry.placement.plane ||
        a.entry.placement.ring - b.entry.placement.ring ||
        a.index - b.index,
    )
    .map(({ entry }) => entry);

  const items = new Map<string, PortfolioItem>();
  entries.forEach((entry) => {
    const category = coreName.get(entry.coreSlug) ?? "";
    if (entry.clientVariants.length > 0) {
      entry.clientVariants.forEach((variant) => {
        if (!items.has(variant.slug)) items.set(variant.slug, variantItem(release, category, entry, variant));
      });
      return;
    }
    if (!items.has(entry.slug)) items.set(entry.slug, entryItem(release, category, entry));
  });
  return [...items.values()];
}

const gallery = (release: Release, media: GalleryItem[]): PortfolioMedia[] =>
  media.map((item) => ({
    id: item.slug,
    type: item.type,
    image: mediaUrl(release, item.mediaId),
    title: item.title,
    description: item.description,
    fit: item.fit,
  }));

function entryItem(release: Release, category: string, entry: PortfolioEntry): PortfolioItem {
  const image = mediaUrl(release, entry.mediaId);
  return {
    id: entry.slug,
    title: entry.title,
    description: entry.description,
    image,
    technologies: entry.technologies,
    technologySlugs: entry.technologySlugs ?? [],
    year: entry.year,
    category,
    subcategory: "General",
    detailMedia: withCover(entry.slug, entry.title, entry.description, image, gallery(release, entry.galleryMedia)),
    isClientVariation: false,
  };
}

function variantItem(
  release: Release,
  category: string,
  parent: PortfolioEntry,
  variant: ClientVariant,
): PortfolioItem {
  const image = mediaUrl(release, variant.mediaId) || mediaUrl(release, parent.mediaId);
  const media = variant.galleryMedia.length > 0 ? variant.galleryMedia : parent.galleryMedia;
  return {
    id: variant.slug,
    title: variant.title,
    description: variant.description,
    image,
    technologies: variant.technologies,
    // Every flattened item is tagged on its own; a variant never borrows the
    // parent's tags, because a client site and the platform it was built on
    // are different work.
    technologySlugs: variant.technologySlugs ?? [],
    year: typeof variant.year === "number" ? variant.year : parent.year,
    category,
    subcategory: parent.title,
    detailMedia: withCover(variant.slug, variant.title, variant.description, image, gallery(release, media)),
    isClientVariation: true,
  };
}

/** The cover image leads the detail gallery unless the gallery already has it. */
function withCover(
  itemId: string,
  title: string,
  description: string,
  cover: string,
  media: PortfolioMedia[],
): PortfolioMedia[] {
  if (!cover || media.some((entry) => entry.image === cover)) return media;
  return [{ id: `${itemId}-cover`, type: "image", image: cover, title, description }, ...media];
}
