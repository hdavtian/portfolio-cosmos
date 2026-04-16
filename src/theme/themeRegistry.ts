export interface ThemeDefinition {
  id: string;
  label: string;
}

export const themeRegistry: ThemeDefinition[] = [
  { id: "modern", label: "Modern" },
  { id: "light", label: "Light" },
  { id: "matrix", label: "Matrix" },
  { id: "star-wars", label: "Star Wars" },
  { id: "eighties", label: "80s" },
  { id: "film-noir", label: "Film Noir" },
];

export const defaultThemeId = "star-wars";
