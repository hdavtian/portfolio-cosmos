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
  variants: PortfolioVariantView[];
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
  const maxMediaItems = Math.max(1, opts?.maxMediaItems ?? 12);
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
  maxMediaItems = 12,
): PortfolioGroupView[] =>
  entries
    .filter((entry) => (entry as { published?: boolean }).published !== false)
    .map((entry) => {
      const variants = (entry.clientVariants ?? []).filter((variant) =>
        Boolean(variant?.title),
      );
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
