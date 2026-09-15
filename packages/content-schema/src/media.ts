import { z } from "zod";
import { documentMetaSchema } from "./primitives";

export const mediaContentTypeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

// A stored file. Entities reference it by id; the public URL is derived from
// `blobPath` and the environment's media base URL, never stored.
export const mediaAssetSchema = z.object({
  blobPath: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+\/[A-Za-z0-9._/-]+$/, "Invalid blob path"),
  // Original site path (e.g. "/images/investcloud/tcc/tcc-1.jpg") when imported.
  sourcePath: z.string().startsWith("/images/").optional(),
  contentType: mediaContentTypeSchema,
  bytes: z.number().int().positive(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  altText: z.string().max(300).default(""),
});

export type MediaAsset = z.infer<typeof mediaAssetSchema>;

export const mediaAssetDocumentSchema = mediaAssetSchema.extend(documentMetaSchema.shape);
