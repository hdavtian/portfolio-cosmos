export type MoonPortfolioTabMapping = {
  id: string;
  title: string;
  includeEntryIds?: string[];
};

export type MoonPortfolioCompanyMapping = {
  companyId: string;
  coreTitles?: string[];
  includeEntryIds?: string[];
  excludeEntryIds?: string[];
  tabs?: MoonPortfolioTabMapping[];
};

export const moonPortfolioMapping: MoonPortfolioCompanyMapping[] = [
  {
    companyId: "investcloud",
    coreTitles: ["InvestCloud"],
    tabs: [{ id: "investcloud-projects", title: "InvestCloud Projects" }],
  },
  {
    companyId: "rpa",
    includeEntryIds: ["race-with-honda"],
    tabs: [
      {
        id: "agency-projects",
        title: "Agency Projects",
        includeEntryIds: ["race-with-honda"],
      },
    ],
  },
  {
    companyId: "murad",
    coreTitles: ["Murad"],
    tabs: [{ id: "murad-projects", title: "Murad Projects" }],
  },
  {
    companyId: "unitedlayer",
    includeEntryIds: ["unitedlayer-inc"],
    tabs: [
      {
        id: "unitedlayer-projects",
        title: "UnitedLayer Projects",
        includeEntryIds: ["unitedlayer-inc"],
      },
    ],
  },
  {
    companyId: "stormscape",
    coreTitles: ["StormScape"],
    excludeEntryIds: ["race-with-honda", "unitedlayer-inc"],
    tabs: [{ id: "stormscape-projects", title: "StormScape Projects" }],
  },
];

