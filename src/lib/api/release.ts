import type { ContentBundle } from "@hd/content-schema";

/** One media file, as the release describes it. */
export interface ReleaseMedia {
  url: string;
  altText: string;
  width?: number;
  height?: number;
}

/** What `GET /api/v2/content/release` returns. */
export interface ReleaseResponse {
  etag: string;
  draft: boolean;
  content: ContentBundle;
  media: Record<string, ReleaseMedia>;
}

/**
 * The published content in the shapes it is stored in: the one shape every
 * site reads. Nothing is renamed or regrouped; the only work done here is what
 * any reader needs anyway: lists put in their saved order, and media ids
 * turned into addresses.
 */
export interface Release {
  etag: string;
  profile: ContentBundle["singletons"]["profile"];
  cosmosIntroduction: ContentBundle["singletons"]["cosmosIntroduction"];
  collections: ContentBundle["collections"];
  media: Record<string, ReleaseMedia>;
}

/**
 * The address of a media file, or "" when the id is unknown. A plain function
 * over the release's data, not a method on it: the query cache is saved to
 * localStorage between visits, and only data survives that.
 */
export const mediaUrl = (release: Pick<Release, "media">, mediaId: string | null | undefined): string =>
  mediaId ? (release.media[mediaId]?.url ?? "") : "";

const bySortOrder = <T extends { sortOrder: number }>(items: readonly T[]): T[] =>
  [...items].sort((a, b) => a.sortOrder - b.sortOrder);

export const toRelease = (response: ReleaseResponse): Release => {
  const { singletons, collections } = response.content;
  const ordered = Object.fromEntries(
    Object.entries(collections).map(([name, items]) => [
      name,
      bySortOrder((items ?? []) as Array<{ sortOrder: number }>),
    ]),
  ) as ContentBundle["collections"];

  return {
    etag: response.etag,
    profile: singletons.profile,
    cosmosIntroduction: singletons.cosmosIntroduction,
    collections: ordered,
    media: response.media,
  };
};
