export interface PortfolioMedia {
  id?: string;
  type?: string;
  image?: string;
  title?: string;
  description?: string;
}

export interface PortfolioEntrySeed {
  id: string;
  title: string;
  image?: string;
  description?: string;
  technologies?: string[];
  year?: number;
  published?: boolean;
  galleryMedia?: PortfolioMedia[];
  clientVariants?: PortfolioClientVariantSeed[];
}

export interface PortfolioClientVariantSeed {
  id: string;
  title: string;
  image?: string;
  description?: string;
  technologies?: string[];
  year?: number | null;
  galleryMedia?: PortfolioMedia[];
}

export interface PortfolioRingSeed {
  orbitColor?: string;
  items?: PortfolioEntrySeed[];
}

export interface PortfolioPlainSeed {
  angle?: number;
  items?: PortfolioRingSeed[];
}

export interface PortfolioCoreSeed {
  core: string;
  coreColor?: string;
  plains?: PortfolioPlainSeed[];
}

export interface PortfolioItem {
  id: string;
  title: string;
  description: string;
  image: string;
  technologies: string[];
  year: number | null;
  category: string;
  subcategory: string;
  detailMedia: PortfolioMedia[];
  isClientVariation: boolean;
}

export interface ResumePayload {
  personal: {
    name: string;
    title: string;
    email: string;
    location: string;
  };
  summary: string;
  experience: Array<{
    id: string;
    company: string;
    navLabel?: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    positions: Array<{
      title: string;
      startDate?: string;
      endDate?: string;
      responsibilities: string[];
    }>;
  }>;
  education: {
    institution: string;
    degree: string;
    major: string;
    graduationDate: string;
  };
  certifications: Array<{ name: string; date: string }>;
}
