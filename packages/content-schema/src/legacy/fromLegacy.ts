import { contentBundleSchema, type ContentBundle } from "../collections.js";
import { slugify } from "../primitives.js";
import type {
  LegacyClientVariant,
  LegacyContent,
  LegacyGalleryMedia,
  LegacyPortfolioEntry,
} from "./types.js";

export type MediaResolver = (sourcePath: string) => string;

// Every image path referenced by the legacy content, in first-seen order.
export const collectLegacyImagePaths = (content: LegacyContent): string[] => {
  const paths = new Set<string>();
  const add = (value: string | undefined) => {
    if (value) paths.add(value);
  };
  const gallery = (items: LegacyGalleryMedia[] | undefined) => items?.forEach((g) => add(g.image));
  const variant = (v: LegacyClientVariant) => {
    add(v.image);
    gallery(v.galleryMedia);
  };
  const entry = (e: LegacyPortfolioEntry) => {
    add(e.image);
    gallery(e.galleryMedia);
    e.clientVariants?.forEach(variant);
  };

  content.portfolioCores.forEach((core) =>
    core.plains.forEach((plane) => plane.items.forEach((ring) => ring.items.forEach(entry))),
  );
  content.aboutDeck.aboutDeck.slides.forEach((slide) => slide.blocks.forEach((b) => add(b.src)));
  return [...paths];
};

const uniqueSlug = (base: string, used: Set<string>): string => {
  let slug = base;
  for (let n = 2; used.has(slug); n += 1) slug = `${base}-${n}`;
  used.add(slug);
  return slug;
};

export const fromLegacy = (content: LegacyContent, resolveMedia: MediaResolver): ContentBundle => {
  const { resume, portfolioCores, moonPortfolioMapping, aboutDeck, aboutPathTravelMessages } =
    content;
  const narrative = content.cosmicNarrative.cosmicNarrative;

  const gallery = (items: LegacyGalleryMedia[] | undefined) =>
    (items ?? []).map((g) => ({
      slug: g.id,
      type: g.type,
      mediaId: resolveMedia(g.image),
      title: g.title,
      description: g.description,
      fit: g.fit,
    }));

  const coreSlugByName = new Map<string, string>();
  const usedCoreSlugs = new Set<string>();
  const cores = portfolioCores.map((core, index) => {
    const slug = uniqueSlug(slugify(core.core), usedCoreSlugs);
    coreSlugByName.set(core.core, slug);
    return {
      slug,
      sortOrder: index,
      name: core.core,
      color: core.coreColor,
      planes: core.plains.map((plane) => ({
        angle: plane.angle,
        rings: plane.items.map((ring) => ({ orbitColor: ring.orbitColor })),
      })),
    };
  });

  let entryOrder = 0;
  const entries = portfolioCores.flatMap((core) =>
    core.plains.flatMap((plane, planeIndex) =>
      plane.items.flatMap((ring, ringIndex) =>
        ring.items.map((entry) => ({
          slug: entry.id,
          sortOrder: entryOrder++,
          coreSlug: coreSlugByName.get(core.core),
          placement: { plane: planeIndex, ring: ringIndex },
          title: entry.title,
          mediaId: resolveMedia(entry.image),
          description: entry.description,
          technologies: entry.technologies,
          year: entry.year,
          fit: entry.fit,
          galleryMedia: gallery(entry.galleryMedia),
          clientVariants: (entry.clientVariants ?? []).map((v) => ({
            slug: v.id,
            title: v.title,
            mediaId: resolveMedia(v.image),
            description: v.description,
            technologies: v.technologies,
            year: v.year,
            fit: v.fit,
            galleryMedia: gallery(v.galleryMedia),
          })),
        })),
      ),
    ),
  );

  const skillCategories = Object.keys(resume.skills).map((name, index) => ({
    slug: slugify(name),
    sortOrder: index,
    name,
  }));
  const usedSkillSlugs = new Set<string>();
  let skillOrder = 0;
  const skills = Object.entries(resume.skills).flatMap(([category, names]) =>
    names.map((name) => ({
      slug: uniqueSlug(slugify(name), usedSkillSlugs),
      sortOrder: skillOrder++,
      categorySlug: slugify(category),
      name,
    })),
  );

  // Tech stack starts as a copy of the resume skills, then diverges in the
  // admin (it may nest deeper; the resume skills never do).
  const usedNodeSlugs = new Set<string>();
  const techStackNodes: Array<{ slug: string; sortOrder: number; name: string; parentSlug: string }> = [];
  let nodeOrder = 0;
  for (const [category, names] of Object.entries(resume.skills)) {
    const categorySlug = uniqueSlug(slugify(category), usedNodeSlugs);
    techStackNodes.push({ slug: categorySlug, sortOrder: nodeOrder++, name: category, parentSlug: "" });
    for (const name of names) {
      techStackNodes.push({
        slug: uniqueSlug(slugify(name), usedNodeSlugs),
        sortOrder: nodeOrder++,
        name,
        parentSlug: categorySlug,
      });
    }
  }

  const bundle = {
    singletons: {
      profile: { ...resume.personal, summary: resume.summary },
      cosmosIntroduction: narrative.introduction,
    },
    collections: {
      education: [
        {
          slug: slugify(`${resume.education.institution} ${resume.education.degree}`),
          sortOrder: 0,
          ...resume.education,
        },
      ],
      certifications: resume.certifications.map((c, index) => ({
        slug: slugify(c.name),
        sortOrder: index,
        ...c,
      })),
      links: resume.links.map((l, index) => ({ slug: slugify(l.title), sortOrder: index, ...l })),
      skillCategories,
      skills,
      experiences: resume.experience.map((e, index) => ({
        slug: e.id,
        sortOrder: index,
        company: e.company,
        navLabel: e.navLabel,
        location: e.location,
        startDate: e.startDate,
        endDate: e.endDate,
        droneIntroText: e.droneIntroText,
        positions: e.positions,
        projects: (e.Projects ?? []).map((p) => ({ slug: p.id, title: p.title, summary: p.summary })),
        jobMemories: e.jobMemories,
        jobTech: e.jobTech,
      })),
      portfolioCores: cores,
      portfolioEntries: entries,
      moonPortfolioMappings: moonPortfolioMapping.map((m, index) => ({
        slug: m.companyId,
        sortOrder: index,
        experienceSlug: m.companyId,
        coreSlugs: (m.coreTitles ?? []).map((title) => {
          const slug = coreSlugByName.get(title);
          if (!slug) throw new Error(`Moon mapping ${m.companyId} references unknown core "${title}"`);
          return slug;
        }),
        includeEntrySlugs: m.includeEntryIds ?? [],
        excludeEntrySlugs: m.excludeEntryIds ?? [],
        tabs: (m.tabs ?? []).map((t) => ({
          slug: t.id,
          title: t.title,
          includeEntrySlugs: t.includeEntryIds ?? [],
        })),
      })),
      aboutDeckSlides: aboutDeck.aboutDeck.slides.map((s, index) => ({
        slug: s.id,
        sortOrder: index,
        holdMs: s.holdMs,
        explodeAfter: s.explodeAfter,
        reveal: s.reveal,
        blocks: s.blocks.map((b) =>
          b.type === "image"
            ? { type: "image", title: b.title, mediaId: resolveMedia(b.src ?? "") }
            : { type: b.type, title: b.title, body: b.body },
        ),
      })),
      techStackNodes,
      pathTravelMessages: aboutPathTravelMessages.map((m, index) => ({
        slug: m.id,
        sortOrder: index,
        textContent: m.textContent,
        fontFamily: m.fontFamily,
        fontSize: m.fontSize,
        fontColor: m.fontColor,
        fontShadow: m.fontShadow,
      })),
      guidedTours: narrative.guidedTours.map((t, index) => ({
        slug: t.id,
        sortOrder: index,
        name: t.name,
        description: t.description,
        duration: t.duration,
        waypoints: t.waypoints,
      })),
      cosmosPlanets: Object.entries(narrative.planets).map(([slug, p], index) => ({
        slug,
        sortOrder: index,
        cosmicName: p.cosmicName,
        description: p.description,
        atmosphere: p.atmosphere,
      })),
    },
  };

  // Validates every entity; throws a ZodError listing each problem path.
  return contentBundleSchema.parse(bundle);
};
