import { resumeSkillLines } from "@hd/content-schema/technology-tree";

/**
 * The resume as a document, built once from the published release and
 * written three ways (Word, PDF, plain text). The web page at /resume is a
 * fourth reading of the same data; nothing here is typed by hand, so every
 * download is the current truth.
 *
 * The input is the shape the release carries (see the site's Release and the
 * API's ContentBundle); only the fields the document needs are named, so both
 * can pass what they have.
 */
export interface ResumeSource {
  profile: { name: string; title: string; email: string; phone: string; location: string; summary: string };
  resumeSkills?: { headingOrder?: string[] };
  collections: {
    technologies: Array<{
      slug: string;
      sortOrder: number;
      name: string;
      parentSlug: string;
      isGrouping?: boolean;
      surfaces?: readonly string[];
    }>;
    experiences: Array<{
      sortOrder: number;
      company: string;
      location: string;
      startDate: string;
      endDate?: string;
      positions: Array<{ title: string; startDate?: string; endDate?: string; responsibilities: string[] }>;
    }>;
    education: Array<{ sortOrder: number; institution: string; degree: string; major: string; graduationDate: string }>;
    certifications: Array<{ sortOrder: number; name: string; date: string }>;
    links: Array<{ sortOrder: number; title: string; url: string }>;
  };
}

export interface ResumePosition {
  title: string;
  /** "Jul 2025 - Present" */
  dates: string;
  bullets: string[];
}

export interface ResumeJob {
  company: string;
  location: string;
  positions: ResumePosition[];
}

export interface ResumeModel {
  name: string;
  title: string;
  /** "email | phone | location" */
  contact: string;
  summary: string;
  /** "Frontend: HTML, JavaScript, TypeScript" */
  skills: Array<{ heading: string; skills: string }>;
  experience: ResumeJob[];
  education: Array<{ institution: string; degree: string; date: string }>;
  links: Array<{ title: string; url: string }>;
  certifications: Array<{ name: string; date: string }>;
  /** "Harma Davtian - Full Stack Engineer", for the file name. */
  fileStem: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "07/2025" as "Jul 2025"; anything else as it is. */
export const monthYear = (value: string | undefined): string => {
  if (!value) return "";
  const match = /^(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return value;
  return `${MONTHS[Number(match[1]) - 1] ?? match[1]} ${match[2]}`;
};

const bySortOrder = <T extends { sortOrder: number }>(items: readonly T[]) => [...items].sort((a, b) => a.sortOrder - b.sortOrder);

/**
 * A position's dates: its own, or the job's when it has none; no end anywhere
 * means the role is still held. The same rule the web page uses.
 */
const positionDates = (
  position: { startDate?: string; endDate?: string },
  job: { startDate: string; endDate?: string },
): string => {
  const start = position.startDate ?? job.startDate;
  const end = position.endDate ?? (position.startDate ? undefined : job.endDate) ?? job.endDate;
  return `${monthYear(start)} - ${end ? monthYear(end) : "Present"}`;
};

const safeStem = (text: string) => text.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();

export function resumeModel(source: ResumeSource): ResumeModel {
  const { profile } = source;
  const jobs = bySortOrder(source.collections.experiences);
  return {
    name: profile.name,
    title: profile.title,
    contact: [profile.email, profile.phone, profile.location].filter(Boolean).join(" | "),
    summary: profile.summary,
    skills: resumeSkillLines(source.collections.technologies, source.resumeSkills?.headingOrder ?? []).map((line) => ({
      heading: line.name,
      skills: line.skills.join(", "),
    })),
    experience: jobs.map((job) => ({
      company: job.company,
      location: job.location,
      positions: job.positions.map((position) => ({
        title: position.title,
        dates: positionDates(position, job),
        bullets: position.responsibilities.map((line) => line.trim()).filter(Boolean),
      })),
    })),
    education: bySortOrder(source.collections.education).map((entry) => ({
      institution: entry.institution,
      degree: [entry.degree, entry.major].filter(Boolean).join(", "),
      date: monthYear(entry.graduationDate),
    })),
    links: bySortOrder(source.collections.links).map((link) => ({ title: link.title, url: link.url })),
    certifications: bySortOrder(source.collections.certifications).map((cert) => ({ name: cert.name, date: monthYear(cert.date) })),
    fileStem: safeStem(`${profile.name} - ${profile.title}`),
  };
}
