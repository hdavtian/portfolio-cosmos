import type {
  AboutDeckSlide,
  ClientVariant,
  Experience,
  GalleryItem,
  MoonPortfolioMapping,
  PathTravelMessage,
} from "@hd/content-schema";
import type { TechStackTreeNode } from "@hd/content-schema/tech-stack-tree";
import { latticeByHeading, latticeTree } from "@hd/content-schema/technology-tree";
import { mediaUrl, type Release } from "../../lib/api/release";
import type { PortfolioCoreSeed, PortfolioSeedMedia, PortfolioSeedVariant } from "./portfolioData";

/**
 * Everything the 3D site shows, taken from the published release. This is the
 * site's own view of the content, built at its door: every record in the
 * release is passed through, nothing is left out, and nothing here is a second
 * source. The scene code reads jobs, skills and cores in these groupings
 * (cores holding their planes, rings and entries; skills under category
 * names), so the grouping is done once here rather than throughout the scene.
 */
/** A job, exactly as stored: the Experience moons, their memories, tech and positions. */
export type SpaceJob = Experience;

export interface SpaceResume {
  personal: { name: string; title: string; email: string; phone: string; location: string };
  summary: string;
  /** Skill names under their category name, both in saved order. */
  skills: Record<string, string[]>;
  experience: SpaceJob[];
  education: { institution: string; degree: string; major: string; graduationDate: string };
  links: Array<{ title: string; url: string }>;
  certifications: Array<{ name: string; date: string }>;
}

/** Which projects each job moon shows, exactly as stored. */
export type SpaceMoonMapping = MoonPortfolioMapping;

/** A message of the About ride, exactly as stored. */
export type SpaceTravelMessage = PathTravelMessage;

/** An About deck slide as stored, with each picture block's address filled in as `src`. */
export type SpaceAboutSlide = Omit<AboutDeckSlide, "blocks"> & {
  blocks: Array<{ type: string; title: string; body?: string; src?: string }>;
};

export interface SpaceContent {
  resume: SpaceResume;
  portfolioCores: PortfolioCoreSeed[];
  moonPortfolioMapping: SpaceMoonMapping[];
  aboutPathTravelMessages: SpaceTravelMessage[];
  aboutSlides: SpaceAboutSlide[];
  techStack: TechStackTreeNode[];
}

export function spaceContentFromRelease(release: Release): SpaceContent {
  const c = release.collections;
  const { summary, ...personal } = release.profile;

  const media = (item: GalleryItem): PortfolioSeedMedia => ({
    slug: item.slug,
    type: item.type,
    image: mediaUrl(release, item.mediaId),
    title: item.title,
    description: item.description,
    fit: item.fit,
  });

  // The master list (D1): names by slug, for everything that points at it.
  const technologies = c.technologies;
  const nameBySlug = new Map(technologies.map((record) => [record.slug, record.name]));
  const names = (slugs: readonly string[] | undefined) =>
    (slugs ?? []).map((slug) => nameBySlug.get(slug)).filter((name): name is string => Boolean(name));

  // Project tags come from the project's own technologySlugs; a variant
  // never inherits its parent's (a client site and the platform it was built
  // on are different work).
  const variant = (item: ClientVariant): PortfolioSeedVariant => ({
    slug: item.slug,
    title: item.title,
    image: mediaUrl(release, item.mediaId),
    description: item.description,
    technologies: item.technologySlugs?.length ? names(item.technologySlugs) : item.technologies,
    year: item.year,
    fit: item.fit,
    galleryMedia: item.galleryMedia.map(media),
  });

  // The Skills planet's moons: one per top-level heading of the lattice.
  const skills = latticeByHeading(technologies);
  const [education] = c.education;

  // A job's moon labels and fly-by memories come from its skill uses (D20):
  // a use ticked moonLabel is a label; one ticked flyBy drifts past in orbit,
  // drawn in its style; prose memories keep flying too. The scene reads the
  // jobTech and jobMemories fields it always has, filled here from the uses,
  // so a job without uses yet still shows what it used to.
  const asMemoryType = (style?: string) => (style === "code" ? "code" : style === "handwritten" ? "memory" : "tech");
  const experiences: SpaceJob[] = c.experiences.map((entry) => {
    const uses = (entry.skillsUsed ?? [])
      .map((use) => ({ ...use, name: nameBySlug.get(use.technologySlug) }))
      .filter((use): use is typeof use & { name: string } => Boolean(use.name));
    if (uses.length === 0) return entry;
    return {
      ...entry,
      jobTech: uses
        .filter((use) => use.surfaces.includes("moonLabel"))
        .map((use) => ({ label: use.name, highlightMatches: use.highlightMatches })),
      jobMemories: [
        ...entry.jobMemories.map((memory) => ({
          ...memory,
          type: (memory.style ? asMemoryType(memory.style) : memory.type) as typeof memory.type,
        })),
        ...uses
          .filter((use) => use.surfaces.includes("flyBy"))
          .map((use) => ({ type: asMemoryType(use.style) as "tech" | "code" | "memory", text: use.name, style: use.style })),
      ],
    };
  });

  return {
    resume: {
      personal,
      summary,
      skills,
      experience: experiences,
      education: {
        institution: education?.institution ?? "",
        degree: education?.degree ?? "",
        major: education?.major ?? "",
        graduationDate: education?.graduationDate ?? "",
      },
      links: c.links.map((link) => ({ title: link.title, url: link.url })),
      certifications: c.certifications.map((cert) => ({ name: cert.name, date: cert.date })),
    },
    // Each core with its planes, each plane's rings, and the entries placed on each ring.
    portfolioCores: c.portfolioCores.map((core) => ({
      slug: core.slug,
      name: core.name,
      color: core.color,
      planes: core.planes.map((plane, planeIndex) => ({
        angle: plane.angle,
        rings: plane.rings.map((ring, ringIndex) => ({
          orbitColor: ring.orbitColor,
          entries: c.portfolioEntries
            .filter(
              (entry) =>
                entry.coreSlug === core.slug &&
                entry.placement.plane === planeIndex &&
                entry.placement.ring === ringIndex,
            )
            .map((entry) => ({ ...variant(entry), clientVariants: entry.clientVariants.map(variant) })),
        })),
      })),
    })),
    moonPortfolioMapping: c.moonPortfolioMappings,
    aboutPathTravelMessages: c.pathTravelMessages,
    aboutSlides: c.aboutDeckSlides.map((slide) => ({
      ...slide,
      blocks: slide.blocks.map((block) =>
        block.type === "image"
          ? { type: block.type, title: block.title, src: mediaUrl(release, block.mediaId) }
          : { type: block.type, title: block.title, body: block.body },
      ),
    })),
    // The Skills lattice: the master list's lattice ticks.
    techStack: latticeTree(technologies),
  };
}
