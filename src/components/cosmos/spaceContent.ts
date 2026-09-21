import type {
  AboutDeckSlide,
  ClientVariant,
  Experience,
  GalleryItem,
  MoonPortfolioMapping,
  PathTravelMessage,
} from "@hd/content-schema";
import { buildTechStackTree, techStackTreeFromSkills, type TechStackTreeNode } from "@hd/content-schema/tech-stack-tree";
import type { Release } from "../../lib/api/release";
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
    image: release.mediaUrl(item.mediaId),
    title: item.title,
    description: item.description,
    fit: item.fit,
  });

  const variant = (item: ClientVariant): PortfolioSeedVariant => ({
    slug: item.slug,
    title: item.title,
    image: release.mediaUrl(item.mediaId),
    description: item.description,
    technologies: item.technologies,
    year: item.year,
    fit: item.fit,
    galleryMedia: item.galleryMedia.map(media),
  });

  const skills = Object.fromEntries(
    c.skillCategories.map((category) => [
      category.name,
      c.skills.filter((skill) => skill.categorySlug === category.slug).map((skill) => skill.name),
    ]),
  );
  const [education] = c.education;

  return {
    resume: {
      personal,
      summary,
      skills,
      experience: c.experiences,
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
          ? { type: block.type, title: block.title, src: release.mediaUrl(block.mediaId) }
          : { type: block.type, title: block.title, body: block.body },
      ),
    })),
    techStack:
      c.techStackNodes.length > 0 ? buildTechStackTree(c.techStackNodes) : techStackTreeFromSkills(skills),
  };
}
