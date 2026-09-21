import type { ClientVariant, GalleryItem } from "@hd/content-schema";
import { buildTechStackTree, techStackTreeFromSkills, type TechStackTreeNode } from "@hd/content-schema/tech-stack-tree";
import type { Release } from "../../../src/lib/api/release";
import type { PortfolioClientVariant, PortfolioCoreSeed, PortfolioEntry, PortfolioMediaEntry } from "./portfolioData";

/**
 * Everything the 3D site shows, taken from the published release. This is the
 * site's own view of the content, built at its door: every record in the
 * release is passed through, nothing is left out, and nothing here is a second
 * source. The scene code reads jobs, skills and cores in these groupings
 * (cores holding their planes, rings and entries; skills under category
 * names), so the grouping is done once here rather than throughout the scene.
 */
export interface SpaceJob {
  id: string;
  company: string;
  navLabel: string;
  location: string;
  startDate: string;
  /** Missing while the job is current. */
  endDate?: string;
  droneIntroText: string;
  jobMemories: Array<{ type: string; text: string }>;
  jobTech: Array<{ label: string; highlightMatches: string[] }>;
  Projects?: Array<{ id: string; title: string; summary: string }>;
  positions: Array<{ title: string; startDate?: string; endDate?: string; responsibilities: string[] }>;
}

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

export interface SpaceMoonMapping {
  companyId: string;
  coreTitles?: string[];
  includeEntryIds?: string[];
  excludeEntryIds?: string[];
  tabs?: Array<{ id: string; title: string; includeEntryIds?: string[] }>;
}

export interface SpaceTravelMessage {
  id: string;
  textContent: string;
  fontFamily?: string[];
  fontSize?: string;
  fontColor?: string;
  fontShadow?: string;
}

export interface SpaceAboutSlide {
  id: string;
  holdMs?: number;
  explodeAfter?: boolean;
  reveal?: {
    pattern?: "scanline" | "center-out" | "spiral" | "noise-cluster";
    blockStaggerMs?: number;
    cellRevealMs?: number;
  };
  blocks: Array<{ type: string; title: string; body?: string; src?: string }>;
}

export interface SpaceContent {
  resume: SpaceResume;
  portfolioCores: PortfolioCoreSeed[];
  moonPortfolioMapping: SpaceMoonMapping[];
  aboutPathTravelMessages: SpaceTravelMessage[];
  aboutSlides: SpaceAboutSlide[];
  techStack: TechStackTreeNode[];
}

const listed = <K extends string, V>(key: K, values: V[]) =>
  (values.length > 0 ? { [key]: values } : {}) as { [P in K]?: V[] };

export function spaceContentFromRelease(release: Release): SpaceContent {
  const c = release.collections;
  const { summary, ...personal } = release.profile;

  const gallery = (items: GalleryItem[]): PortfolioMediaEntry[] =>
    items.map((item) => ({
      id: item.slug,
      type: item.type,
      image: release.mediaUrl(item.mediaId),
      title: item.title,
      description: item.description,
      fit: item.fit,
    }));

  const variant = (item: ClientVariant): PortfolioClientVariant => ({
    id: item.slug,
    title: item.title,
    image: release.mediaUrl(item.mediaId),
    description: item.description,
    technologies: item.technologies,
    year: item.year,
    fit: item.fit,
    ...listed("galleryMedia", gallery(item.galleryMedia)),
  });

  const coreName = new Map(c.portfolioCores.map((core) => [core.slug, core.name]));
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
      experience: c.experiences.map((job) => ({
        id: job.slug,
        company: job.company,
        droneIntroText: job.droneIntroText,
        jobMemories: job.jobMemories,
        jobTech: job.jobTech,
        navLabel: job.navLabel,
        location: job.location,
        startDate: job.startDate,
        endDate: job.endDate,
        ...listed(
          "Projects",
          job.projects.map((project) => ({ id: project.slug, title: project.title, summary: project.summary })),
        ),
        positions: job.positions,
      })),
      education: {
        institution: education?.institution ?? "",
        degree: education?.degree ?? "",
        major: education?.major ?? "",
        graduationDate: education?.graduationDate ?? "",
      },
      links: c.links.map((link) => ({ title: link.title, url: link.url })),
      certifications: c.certifications.map((cert) => ({ name: cert.name, date: cert.date })),
    },
    portfolioCores: c.portfolioCores.map((core) => ({
      core: core.name,
      coreColor: core.color,
      plains: core.planes.map((plane, planeIndex) => ({
        angle: plane.angle,
        items: plane.rings.map((ring, ringIndex) => ({
          orbitColor: ring.orbitColor,
          items: c.portfolioEntries
            .filter(
              (entry) =>
                entry.coreSlug === core.slug &&
                entry.placement.plane === planeIndex &&
                entry.placement.ring === ringIndex,
            )
            .map(
              (entry): PortfolioEntry => ({
                id: entry.slug,
                title: entry.title,
                image: release.mediaUrl(entry.mediaId),
                description: entry.description,
                technologies: entry.technologies,
                year: entry.year,
                fit: entry.fit,
                ...listed("galleryMedia", gallery(entry.galleryMedia)),
                ...listed("clientVariants", entry.clientVariants.map(variant)),
              }),
            ),
        })),
      })),
    })),
    moonPortfolioMapping: c.moonPortfolioMappings.map((mapping) => ({
      companyId: mapping.experienceSlug,
      ...listed("coreTitles", mapping.coreSlugs.map((slug) => coreName.get(slug) ?? slug)),
      ...listed("includeEntryIds", mapping.includeEntrySlugs),
      ...listed("excludeEntryIds", mapping.excludeEntrySlugs),
      ...listed(
        "tabs",
        mapping.tabs.map((tab) => ({
          id: tab.slug,
          title: tab.title,
          ...listed("includeEntryIds", tab.includeEntrySlugs),
        })),
      ),
    })),
    aboutPathTravelMessages: c.pathTravelMessages.map((message) => ({
      id: message.slug,
      textContent: message.textContent,
      fontFamily: message.fontFamily,
      fontSize: message.fontSize,
      fontColor: message.fontColor,
      fontShadow: message.fontShadow,
    })),
    aboutSlides: c.aboutDeckSlides.map((slide) => ({
      id: slide.slug,
      holdMs: slide.holdMs,
      explodeAfter: slide.explodeAfter,
      reveal: slide.reveal,
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
