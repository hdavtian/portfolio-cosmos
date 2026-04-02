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
    coreTitles: ["RPA"],
    tabs: [{ id: "rpa-projects", title: "RPA Projects" }],
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
    companyId: "boingo",
    coreTitles: ["Boingo"],
    tabs: [{ id: "boingo-projects", title: "Boingo Projects" }],
  },
  {
    companyId: "stormscape",
    coreTitles: ["StormScape"],
    excludeEntryIds: ["unitedlayer-inc"],
    tabs: [{ id: "stormscape-projects", title: "StormScape Projects" }],
  },
];

