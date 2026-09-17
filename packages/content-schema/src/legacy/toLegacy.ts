import type { ContentBundle } from "../collections.js";
import type { ClientVariant, GalleryItem } from "../portfolio.js";
import type {
  LegacyClientVariant,
  LegacyContent,
  LegacyGalleryMedia,
  LegacyPortfolioEntry,
} from "./types.js";

export type MediaPathResolver = (mediaId: string) => string;

const bySortOrder = <T extends { sortOrder: number }>(items: T[]): T[] =>
  [...items].sort((a, b) => a.sortOrder - b.sortOrder);

// Projects the new model back into the original file shapes. Used to verify the
// import, and later as the compatibility layer while experiences still expect
// the legacy shapes. Empty optional arrays are omitted, as in the source files.
export const toLegacy = (bundle: ContentBundle, mediaPath: MediaPathResolver): LegacyContent => {
  const { singletons, collections: c } = bundle;

  const gallery = (items: GalleryItem[]): LegacyGalleryMedia[] =>
    items.map((g) => ({
      id: g.slug,
      type: g.type,
      image: mediaPath(g.mediaId),
      title: g.title,
      description: g.description,
      fit: g.fit,
    }));

  const withGallery = <T extends object>(base: T, items: GalleryItem[]) =>
    items.length > 0 ? { ...base, galleryMedia: gallery(items) } : base;

  const variant = (v: ClientVariant): LegacyClientVariant =>
    withGallery(
      {
        id: v.slug,
        title: v.title,
        image: mediaPath(v.mediaId),
        description: v.description,
        technologies: v.technologies,
        year: v.year,
        fit: v.fit,
      },
      v.galleryMedia,
    );

  const entries = bySortOrder(c.portfolioEntries);
  const coreNameBySlug = new Map(c.portfolioCores.map((core) => [core.slug, core.name]));

  const portfolioCores = bySortOrder(c.portfolioCores).map((core) => ({
    core: core.name,
    coreColor: core.color,
    plains: core.planes.map((plane, planeIndex) => ({
      angle: plane.angle,
      items: plane.rings.map((ring, ringIndex) => ({
        orbitColor: ring.orbitColor,
        items: entries
          .filter(
            (e) =>
              e.coreSlug === core.slug &&
              e.placement.plane === planeIndex &&
              e.placement.ring === ringIndex,
          )
          .map((e): LegacyPortfolioEntry => {
            const base = withGallery(
              {
                id: e.slug,
                title: e.title,
                image: mediaPath(e.mediaId),
                description: e.description,
                technologies: e.technologies,
                year: e.year,
                fit: e.fit,
              },
              e.galleryMedia,
            );
            return e.clientVariants.length > 0
              ? { ...base, clientVariants: e.clientVariants.map(variant) }
              : base;
          }),
      })),
    })),
  }));

  const skillsByCategory = Object.fromEntries(
    bySortOrder(c.skillCategories).map((category) => [
      category.name,
      bySortOrder(c.skills.filter((s) => s.categorySlug === category.slug)).map((s) => s.name),
    ]),
  );

  const [education] = bySortOrder(c.education);
  const { summary, ...personal } = singletons.profile;
  const nonEmpty = <K extends string, V>(key: K, value: V[]) =>
    value.length > 0 ? ({ [key]: value } as { [P in K]: V[] }) : {};

  return {
    resume: {
      personal,
      summary,
      skills: skillsByCategory,
      experience: bySortOrder(c.experiences).map((e) => ({
        id: e.slug,
        company: e.company,
        droneIntroText: e.droneIntroText,
        jobMemories: e.jobMemories,
        jobTech: e.jobTech,
        navLabel: e.navLabel,
        location: e.location,
        startDate: e.startDate,
        endDate: e.endDate,
        ...nonEmpty(
          "Projects",
          e.projects.map((p) => ({ id: p.slug, title: p.title, summary: p.summary })),
        ),
        positions: e.positions,
      })),
      education: {
        institution: education.institution,
        degree: education.degree,
        major: education.major,
        graduationDate: education.graduationDate,
      },
      links: bySortOrder(c.links).map((l) => ({ title: l.title, url: l.url })),
      certifications: bySortOrder(c.certifications).map((cert) => ({
        name: cert.name,
        date: cert.date,
      })),
    },
    portfolioCores,
    moonPortfolioMapping: bySortOrder(c.moonPortfolioMappings).map((m) => ({
      companyId: m.experienceSlug,
      ...nonEmpty(
        "coreTitles",
        m.coreSlugs.map((slug) => coreNameBySlug.get(slug) ?? slug),
      ),
      ...nonEmpty("includeEntryIds", m.includeEntrySlugs),
      ...nonEmpty("excludeEntryIds", m.excludeEntrySlugs),
      ...nonEmpty(
        "tabs",
        m.tabs.map((t) => ({
          id: t.slug,
          title: t.title,
          ...nonEmpty("includeEntryIds", t.includeEntrySlugs),
        })),
      ),
    })),
    aboutDeck: {
      aboutDeck: {
        slides: bySortOrder(c.aboutDeckSlides).map((s) => ({
          id: s.slug,
          holdMs: s.holdMs,
          explodeAfter: s.explodeAfter,
          reveal: s.reveal,
          blocks: s.blocks.map((b) =>
            b.type === "image"
              ? { type: b.type, title: b.title, src: mediaPath(b.mediaId) }
              : { type: b.type, title: b.title, body: b.body },
          ),
        })),
      },
    },
    aboutPathTravelMessages: bySortOrder(c.pathTravelMessages).map((m) => ({
      id: m.slug,
      textContent: m.textContent,
      fontFamily: m.fontFamily,
      fontSize: m.fontSize,
      fontColor: m.fontColor,
      fontShadow: m.fontShadow,
    })),
    cosmicNarrative: {
      cosmicNarrative: {
        introduction: singletons.cosmosIntroduction,
        guidedTours: bySortOrder(c.guidedTours).map((t) => ({
          id: t.slug,
          name: t.name,
          description: t.description,
          duration: t.duration,
          waypoints: t.waypoints,
        })),
        planets: Object.fromEntries(
          bySortOrder(c.cosmosPlanets).map((p) => [
            p.slug,
            { cosmicName: p.cosmicName, description: p.description, atmosphere: p.atmosphere },
          ]),
        ),
      },
    },
  };
};
