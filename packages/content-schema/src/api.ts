import { z } from "zod";

// Error envelope shared with the other shared-login apps.
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z
      .array(z.object({ path: z.string(), message: z.string() }))
      .optional(),
    requestId: z.string(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 25;

// Server-side list query used by the admin grids.
export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  sort: z
    .string()
    .regex(/^-?[A-Za-z][A-Za-z0-9.]*$/, "Invalid sort field")
    .optional(),
  search: z.string().trim().max(200).optional(),
});

export type ListQuery = z.infer<typeof listQuerySchema>;

export const pagedResultSchema = <TItem extends z.ZodType>(item: TItem) =>
  z.object({
    items: z.array(item),
    total: z.number().int().min(0),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
  });
