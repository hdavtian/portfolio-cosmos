import { createHash } from "node:crypto";
import path from "node:path";
import { collectionSchemas, mediaAssetSchema, slugify, type CollectionName } from "@hd/content-schema";
import { Router } from "express";
import multer from "multer";
import sharp from "sharp";
import { z } from "zod";
import { getDb } from "./db.js";
import { EntityRepository } from "./entityRepository.js";
import { ApiError, asyncHandler, parseOrThrow } from "./http.js";
import { deleteMediaBlob, mediaUrl, uploadMediaBlob } from "./mediaStorage.js";

const APP_MEDIA_PREFIX = "scrolling-resume";
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

// Accepted uploads, checked by magic bytes rather than by the client's
// Content-Type or file extension.
const SIGNATURES: Array<{
  contentType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  extension: string;
  matches: (buffer: Buffer) => boolean;
}> = [
  {
    contentType: "image/jpeg",
    extension: ".jpg",
    matches: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    contentType: "image/png",
    extension: ".png",
    matches: (b) => b.length > 8 && b.subarray(0, 8).toString("hex") === "89504e470d0a1a0a",
  },
  {
    contentType: "image/gif",
    extension: ".gif",
    matches: (b) => b.length > 6 && ["GIF87a", "GIF89a"].includes(b.subarray(0, 6).toString("ascii")),
  },
  {
    contentType: "image/webp",
    extension: ".webp",
    matches: (b) =>
      b.length > 12 &&
      b.subarray(0, 4).toString("ascii") === "RIFF" &&
      b.subarray(8, 12).toString("ascii") === "WEBP",
  },
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});

const patchSchema = z.object({
  altText: z.string().max(300).optional(),
  version: z.coerce.number().int().min(1),
});

const editorOf = (req: { auth?: { subject: string } }): string => req.auth?.subject ?? "unknown";

const param = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

/** Entities that can reference media, so deletes can be blocked while in use. */
const REFERENCING_COLLECTIONS = Object.keys(collectionSchemas) as CollectionName[];

const countReferences = async (mediaId: string): Promise<number> => {
  const db = getDb();
  const { ObjectId } = await import("mongodb");
  const objectId = new ObjectId(mediaId);

  const counts = await Promise.all(
    REFERENCING_COLLECTIONS.map((name) =>
      db.collection(name).countDocuments({
        $or: [
          { mediaId: objectId },
          { "galleryMedia.mediaId": objectId },
          { "clientVariants.mediaId": objectId },
          { "clientVariants.galleryMedia.mediaId": objectId },
          { "blocks.mediaId": objectId },
        ],
      }),
    ),
  );

  return counts.reduce((total, count) => total + count, 0);
};

export function createMediaRouter(): Router {
  const router = Router();
  // Media has no slug; blobPath is its unique natural key.
  const repository = () =>
    new EntityRepository(getDb(), "media", ["blobPath", "sourcePath", "altText"], "blobPath");

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const { listQuerySchema } = await import("@hd/content-schema");
      const query = parseOrThrow(listQuerySchema, req.query, "Invalid list query");
      const page = await repository().list(query);

      res.json({
        ...page,
        items: page.items.map((item) => ({
          ...item,
          url: mediaUrl(String(item.blobPath)),
        })),
      });
    }),
  );

  router.post(
    "/",
    upload.single("file"),
    asyncHandler(async (req, res) => {
      const file = req.file;
      if (!file) throw ApiError.badRequest("No file uploaded", [{ path: "file", message: "Required" }]);

      const signature = SIGNATURES.find((candidate) => candidate.matches(file.buffer));
      if (!signature) {
        throw ApiError.badRequest("Unsupported image type", [
          { path: "file", message: "Must be a JPEG, PNG, GIF or WebP image" },
        ]);
      }

      // Re-encoding through sharp strips EXIF (including GPS) and rejects
      // anything that only looks like an image.
      let processed: Buffer;
      let width: number | undefined;
      let height: number | undefined;
      try {
        const pipeline = sharp(file.buffer, { animated: signature.contentType === "image/gif" });
        const metadata = await pipeline.metadata();
        width = metadata.width;
        height = metadata.height;
        processed = await pipeline.rotate().toBuffer();
      } catch {
        throw ApiError.badRequest("That file could not be read as an image", [
          { path: "file", message: "Invalid image data" },
        ]);
      }

      const baseName = slugify(path.parse(file.originalname).name) || "upload";
      const blobPath = `${APP_MEDIA_PREFIX}/uploads/${baseName}-${Date.now()}${signature.extension}`;
      const sha256 = createHash("sha256").update(processed).digest("hex");

      const asset = parseOrThrow(mediaAssetSchema, {
        blobPath,
        contentType: signature.contentType,
        bytes: processed.byteLength,
        width,
        height,
        sha256,
        altText: typeof req.body?.altText === "string" ? req.body.altText : "",
      });

      await uploadMediaBlob(blobPath, processed, signature.contentType, sha256);
      const created = await repository().create(asset, editorOf(req));

      res.status(201).json({ ...created, url: mediaUrl(blobPath) });
    }),
  );

  router.patch(
    "/:id",
    asyncHandler(async (req, res) => {
      const body = parseOrThrow(patchSchema, req.body);
      const current = await repository().findById(param(req.params.id));
      if (!current) throw ApiError.notFound("No such media");

      const updated = await repository().update(
        String(current.blobPath),
        { ...mediaAssetSchema.parse(current), altText: body.altText ?? "" },
        body.version,
        editorOf(req),
      );

      res.json({ ...updated, url: mediaUrl(String(updated.blobPath)) });
    }),
  );

  router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
      const current = await repository().findById(param(req.params.id));
      if (!current) throw ApiError.notFound("No such media");

      const references = await countReferences(String(current.id));
      if (references > 0) {
        throw ApiError.badRequest(
          `This image is used by ${references} record${references === 1 ? "" : "s"}. Replace it there first.`,
        );
      }

      await deleteMediaBlob(String(current.blobPath));
      await repository().deleteBySlug(String(current.blobPath));
      res.status(204).end();
    }),
  );

  return router;
}
