export type PortfolioMediaEntry = {
  id: string;
  type?: "image" | "video" | "youtube";
  image?: string;
  videoUrl?: string;
  thumbnail?: string;
  youtubeUrl?: string;
  title?: string;
  description?: string;
  fit?: "contain" | "cover";
};

export type PortfolioClientVariant = {
  id: string;
  title: string;
  image?: string;
  description?: string;
  technologies?: string[];
  year?: number | null;
  fit?: "contain" | "cover";
  galleryMedia?: PortfolioMediaEntry[];
};

export type PortfolioEntry = {
  id: string;
  title: string;
  image: string;
  description?: string;
  technologies?: string[];
  year?: number | null;
  fit?: "contain" | "cover";
  galleryMedia?: PortfolioMediaEntry[];
  clientVariants?: PortfolioClientVariant[];
  published?: boolean;
};

export type PortfolioResolvedMediaItem = {
  id: string;
  type: "image" | "video" | "youtube";
  title: string;
  description?: string;
  fit: "contain" | "cover";
  textureUrl: string;
  videoUrl?: string;
  youtubeUrl?: string;
  youtubeEmbedUrl?: string;
  variantIndex?: number;
  variantTitle?: string;
  variantDescription?: string;
  variantTechnologies?: string[];
  variantYear?: number | null;
};

export type PortfolioVariantView = {
  id: string;
  title: string;
  description?: string;
  technologies: string[];
  year: number | null;
  mediaItems: PortfolioResolvedMediaItem[];
};

export type PortfolioGroupView = {
  id: string;
  title: string;
  description?: string;
  technologies: string[];
  year: number | null;
  image: string;
  fit: "contain" | "cover";
  /** Count of titled `clientVariants` on the source entry (matches registry totals). */
  clientVariantCount: number;
  variants: PortfolioVariantView[];
  coreId?: string;
  coreTitle?: string;
  plainIndex?: number;
  plainAngle?: number;
  ringIndex?: number;
  orbitColor?: string;
  /** Cloned source entry used to build this group instance. */
  sourceEntry?: PortfolioEntry;
};

/**
 * The published portfolio as the scene is handed it: stored field names, with
 * each core holding its planes, each plane its rings, each ring the entries
 * placed on it, and every media id already turned into an address (`image`).
 */
export type PortfolioSeedMedia = {
  slug: string;
  type: "image";
  image: string;
  title: string;
  description: string;
  fit: "contain" | "cover";
};

export type PortfolioSeedVariant = {
  slug: string;
  title: string;
  image: string;
  description: string;
  technologies: string[];
  year: number | null;
  fit: "contain" | "cover";
  galleryMedia: PortfolioSeedMedia[];
};

export type PortfolioSeedEntry = Omit<PortfolioSeedVariant, "galleryMedia"> & {
  galleryMedia: PortfolioSeedMedia[];
  clientVariants: PortfolioSeedVariant[];
};

export type PortfolioCoreRingSeed = {
  orbitColor: string;
  entries: PortfolioSeedEntry[];
};

export type PortfolioCorePlaneSeed = {
  angle: number;
  rings: PortfolioCoreRingSeed[];
};

export type PortfolioCoreSeed = {
  slug: string;
  name: string;
  color: string;
  planes: PortfolioCorePlaneSeed[];
};

const mediaFromSeed = (item: PortfolioSeedMedia): PortfolioMediaEntry => ({
  id: item.slug,
  type: item.type,
  image: item.image,
  title: item.title,
  description: item.description,
  fit: item.fit,
});

/**
 * A published entry as the scene's own entry record. The scene gives cards,
 * groups and instances ids of its own making, so `id` here is the scene's
 * name for the thing; it starts out as the entry's slug. Empty galleries and
 * variant lists are left off, which is how the scene tells "none" apart.
 */
export const entryFromSeed = (seed: PortfolioSeedEntry): PortfolioEntry => ({
  id: seed.slug,
  title: seed.title,
  image: seed.image,
  description: seed.description,
  technologies: seed.technologies,
  year: seed.year,
  fit: seed.fit,
  ...(seed.galleryMedia.length > 0 ? { galleryMedia: seed.galleryMedia.map(mediaFromSeed) } : {}),
  ...(seed.clientVariants.length > 0
    ? {
        clientVariants: seed.clientVariants.map((variant) => ({
          id: variant.slug,
          title: variant.title,
          image: variant.image,
          description: variant.description,
          technologies: variant.technologies,
          year: variant.year,
          fit: variant.fit,
          ...(variant.galleryMedia.length > 0 ? { galleryMedia: variant.galleryMedia.map(mediaFromSeed) } : {}),
        })),
      }
    : {}),
});

export type PortfolioCoreRingView = {
  orbitColor: string;
  groupIds: string[];
};

export type PortfolioCorePlainView = {
  angle: number;
  rings: PortfolioCoreRingView[];
};

export type PortfolioCoreView = {
  id: string;
  title: string;
  coreColor: string;
  groupIds: string[];
  plains: PortfolioCorePlainView[];
};

export type PortfolioCoreBuildResult = {
  groups: PortfolioGroupView[];
  cores: PortfolioCoreView[];
};

const extractYouTubeVideoId = (input?: string): string | null => {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
};

const toYouTubeEmbedUrl = (videoId: string) =>
  `https://www.youtube.com/embed/${videoId}`;

const toYouTubeThumbnailUrl = (videoId: string) =>
  `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

export const resolvePortfolioMediaItems = (
  entry: PortfolioEntry,
  opts?: {
    variant?: PortfolioClientVariant;
    variantIndex?: number;
    maxMediaItems?: number;
  },
): PortfolioResolvedMediaItem[] => {
  const variant = opts?.variant;
  const variantIndex = opts?.variantIndex;
  // No cap by default: the card's thumbnail row pages 6 at a time, and every
  // gallery image is already downloaded during loading. (The old cap of 12
  // predated the thumbnail slider and hid images without saving anything.)
  const maxMediaItems = Math.max(1, opts?.maxMediaItems ?? Number.POSITIVE_INFINITY);
  const baseId = variant?.id || entry.id;
  const baseTitle = variant?.title || entry.title;
  const baseDescription = variant?.description || entry.description;
  const baseFit = variant?.fit ?? entry.fit;
  const baseImage = variant?.image || entry.image;
  const sourceGalleryMedia = variant?.galleryMedia ?? entry.galleryMedia ?? [];
  const primary: PortfolioMediaEntry = {
    id: `${baseId}-main`,
    type: "image",
    image: baseImage,
    title: baseTitle,
    description: baseDescription,
    fit: baseFit,
  };
  const candidates = [primary, ...sourceGalleryMedia].slice(0, maxMediaItems);
  const resolved: PortfolioResolvedMediaItem[] = [];
  candidates.forEach((item, index) => {
    const itemType =
      item.type === "youtube" || item.youtubeUrl
        ? "youtube"
        : item.type === "video" || item.videoUrl
          ? "video"
          : "image";
    if (itemType === "youtube") {
      const videoId = extractYouTubeVideoId(item.youtubeUrl);
      if (!videoId) return;
      const textureUrl = item.thumbnail || toYouTubeThumbnailUrl(videoId);
      resolved.push({
        id: item.id || `${baseId}-youtube-${index}`,
        type: "youtube",
        title: item.title || "YouTube Video",
        description: item.description,
        fit: item.fit ?? "cover",
        textureUrl,
        youtubeUrl: item.youtubeUrl,
        youtubeEmbedUrl: toYouTubeEmbedUrl(videoId),
        variantIndex,
        variantTitle: variant?.title,
        variantDescription: variant?.description,
        variantTechnologies: variant?.technologies,
        variantYear: variant?.year,
      });
      return;
    }
    if (itemType === "video") {
      if (!item.videoUrl) return;
      resolved.push({
        id: item.id || `${baseId}-video-${index}`,
        type: "video",
        title: item.title || "Video",
        description: item.description,
        fit: item.fit ?? "cover",
        textureUrl: item.thumbnail || baseImage,
        videoUrl: item.videoUrl,
        variantIndex,
        variantTitle: variant?.title,
        variantDescription: variant?.description,
        variantTechnologies: variant?.technologies,
        variantYear: variant?.year,
      });
      return;
    }
    if (!item.image) return;
    resolved.push({
      id: item.id || `${baseId}-image-${index}`,
      type: "image",
      title: item.title || baseTitle,
      description: item.description || baseDescription,
      fit: item.fit ?? baseFit ?? "contain",
      textureUrl: item.image,
      variantIndex,
      variantTitle: variant?.title,
      variantDescription: variant?.description,
      variantTechnologies: variant?.technologies,
      variantYear: variant?.year,
    });
  });

  if (resolved.length === 0) {
    resolved.push({
      id: `${baseId}-fallback`,
      type: "image",
      title: baseTitle,
      description: baseDescription,
      fit: baseFit ?? "contain",
      textureUrl: baseImage,
      variantIndex,
      variantTitle: variant?.title,
      variantDescription: variant?.description,
      variantTechnologies: variant?.technologies,
      variantYear: variant?.year,
    });
  }
  return resolved;
};

export const buildPortfolioGroups = (
  entries: PortfolioEntry[],
  maxMediaItems = Number.POSITIVE_INFINITY,
): PortfolioGroupView[] =>
  entries
    .filter((entry) => (entry as { published?: boolean }).published !== false)
    .map((entry) => {
      const variants = (entry.clientVariants ?? []).filter((variant) =>
        Boolean(variant?.title),
      );
      const clientVariantCount = variants.length;
      const fallbackVariant: PortfolioVariantView = {
        id: `${entry.id}-default`,
        title: entry.title,
        description: entry.description,
        technologies: entry.technologies ?? [],
        year: entry.year ?? null,
        mediaItems: resolvePortfolioMediaItems(entry, { maxMediaItems }),
      };
      return {
        id: entry.id,
        title: entry.title,
        description: entry.description,
        technologies: entry.technologies ?? [],
        year: entry.year ?? null,
        image: entry.image,
        fit: entry.fit ?? "cover",
        clientVariantCount,
        sourceEntry: entry,
        variants:
          variants.length > 0
            ? variants.map((variant, variantIndex) => ({
                id: variant.id,
                title: variant.title,
                description: variant.description ?? entry.description,
                technologies: variant.technologies ?? entry.technologies ?? [],
                year: variant.year ?? entry.year ?? null,
                mediaItems: resolvePortfolioMediaItems(entry, {
                  variant,
                  variantIndex,
                  maxMediaItems,
                }),
              }))
            : [fallbackVariant],
      };
    });

const slugify = (input: string): string =>
  input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "core";

const ensureHexColor = (raw: string | undefined, fallbackHex: number): string => {
  const trimmed = String(raw ?? "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toUpperCase();
  return `#${fallbackHex.toString(16).padStart(6, "0").toUpperCase()}`;
};

const cloneEntryForInstance = (
  entry: PortfolioEntry,
  uniqueId: string,
  uniqueTitle: string,
): PortfolioEntry => ({
  ...entry,
  id: uniqueId,
  title: uniqueTitle,
  galleryMedia: (entry.galleryMedia ?? []).map((media, mediaIndex) => ({
    ...media,
    id: `${uniqueId}-gallery-${mediaIndex + 1}`,
  })),
  clientVariants: (entry.clientVariants ?? []).map((variant, variantIndex) => ({
    ...variant,
    id: `${uniqueId}-variant-${variantIndex + 1}`,
    title: `${variant.title} • ${uniqueTitle}`,
    galleryMedia: (variant.galleryMedia ?? []).map((media, mediaIndex) => ({
      ...media,
      id: `${uniqueId}-variant-${variantIndex + 1}-media-${mediaIndex + 1}`,
    })),
  })),
});

export const buildPortfolioCoreViews = (
  coreSeeds: PortfolioCoreSeed[],
  maxMediaItems = Number.POSITIVE_INFINITY,
): PortfolioCoreBuildResult => {
  const colorFallbacks = [
    0x7c3aed,
    0x14b8a6,
    0x2563eb,
    0xf97316,
    0xe11d48,
    0x22c55e,
    0x06b6d4,
    0xf59e0b,
  ];

  const groups: PortfolioGroupView[] = [];
  const cores: PortfolioCoreView[] = [];
  coreSeeds.forEach((coreSeed, coreIndex) => {
    const coreId = `core-${slugify(coreSeed.name)}-${coreIndex + 1}`;
    const coreTitle = coreSeed.name || `Core ${coreIndex + 1}`;
    const coreGroupIds: string[] = [];
    const plainViews: PortfolioCorePlainView[] = [];

    coreSeed.planes.forEach((plain, plainIndex) => {
      const ringViews: PortfolioCoreRingView[] = [];
      plain.rings.forEach((ring, ringIndex) => {
        const ringItems = ring.entries;
        const orbitColor = ensureHexColor(
          ring.orbitColor,
          colorFallbacks[(coreIndex + plainIndex + ringIndex) % colorFallbacks.length],
        );
        const ringGroupIds: string[] = [];

        ringItems.forEach((item, itemIndex) => {
          const source = entryFromSeed(item);
          const suffix = `c${coreIndex + 1}p${plainIndex + 1}r${ringIndex + 1}i${itemIndex + 1}`;
          const instanceId = `${source.id}-${suffix}`;
          const instanceTitle = `${source.title} • ${coreTitle} ${plainIndex + 1}.${ringIndex + 1}.${itemIndex + 1}`;
          const clonedEntry = cloneEntryForInstance(source, instanceId, instanceTitle);
          const group = buildPortfolioGroups([clonedEntry], maxMediaItems)[0];
          if (!group) return;
          group.coreId = coreId;
          group.coreTitle = coreTitle;
          group.plainIndex = plainIndex;
          group.plainAngle = plain.angle;
          group.ringIndex = ringIndex;
          group.orbitColor = orbitColor;
          groups.push(group);
          coreGroupIds.push(group.id);
          ringGroupIds.push(group.id);
        });

        ringViews.push({
          orbitColor,
          groupIds: ringGroupIds,
        });
      });

      plainViews.push({
        angle: plain.angle,
        rings: ringViews,
      });
    });

    // A core with nothing attached is only a name and a colour — it may exist
    // just to give a job its accent elsewhere — so there is nothing to draw.
    if (coreGroupIds.length === 0) return;

    cores.push({
      id: coreId,
      title: coreTitle,
      coreColor: ensureHexColor(coreSeed.color, 0x67d8ff),
      groupIds: coreGroupIds,
      plains: plainViews,
    });
  });

  return { groups, cores };
};

export const buildPortfolioRegistryModel = (
  coreSeeds: PortfolioCoreSeed[],
  maxMediaItems = Number.POSITIVE_INFINITY,
): PortfolioCoreBuildResult => buildPortfolioCoreViews(coreSeeds, maxMediaItems);
