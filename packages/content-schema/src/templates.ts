import type { z } from "zod";

// A template is a layout implemented in code. Content picks a template by key;
// the admin builds the item's form from the template's schema. Adding a
// template is a code change; adding content that uses one is not.
export interface TemplateDefinition<TSchema extends z.ZodType = z.ZodType> {
  key: string;
  label: string;
  description: string;
  schema: TSchema;
}

export const defineTemplate = <TSchema extends z.ZodType>(
  definition: TemplateDefinition<TSchema>,
): TemplateDefinition<TSchema> => definition;

export const templateKeys = <T extends Record<string, TemplateDefinition>>(registry: T) =>
  Object.keys(registry) as Array<keyof T & string>;
