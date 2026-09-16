import { Router } from "express";
import { z } from "zod";
import { getDb } from "./db.js";
import { asyncHandler, parseOrThrow } from "./http.js";
import { ReleaseService } from "./releaseService.js";

const publishSchema = z.object({
  notes: z.string().trim().max(500).default(""),
});

const rollbackParamsSchema = z.object({
  id: z.coerce.number().int().min(1),
});

const editorOf = (req: { auth?: { subject: string } }): string => req.auth?.subject ?? "unknown";

export function createReleaseRouter(): Router {
  const router = Router();
  const service = () => new ReleaseService(getDb());

  /** Publishes the current drafts as a new immutable release. */
  router.post(
    "/publish",
    asyncHandler(async (req, res) => {
      const { notes } = parseOrThrow(publishSchema, req.body ?? {});
      const release = await service().publish(notes, editorOf(req));
      res.status(201).json(release);
    }),
  );

  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      res.json({ items: await service().history() });
    }),
  );

  /** Dashboard summary: what is live and how much is waiting to be published. */
  router.get(
    "/status",
    asyncHandler(async (_req, res) => {
      const [current, unpublishedChanges] = await Promise.all([
        service().current(),
        service().unpublishedChangeCount(),
      ]);

      res.json({
        current: current
          ? {
              id: current.id,
              notes: current.notes,
              publishedAt: current.publishedAt,
              publishedBy: current.publishedBy,
            }
          : null,
        unpublishedChanges,
        neverPublished: current === null,
      });
    }),
  );

  /** What publishing now would change, as short lines for the release notes. */
  router.get(
    "/pending-changes",
    asyncHandler(async (_req, res) => {
      res.json(await service().pendingChanges());
    }),
  );

  /** Validates the drafts without publishing, for a pre-publish check. */
  router.get(
    "/draft-check",
    asyncHandler(async (_req, res) => {
      await service().buildDraftBundle();
      res.json({ ok: true });
    }),
  );

  router.post(
    "/:id/rollback",
    asyncHandler(async (req, res) => {
      const { id } = parseOrThrow(rollbackParamsSchema, req.params);
      res.json(await service().rollbackTo(id, editorOf(req)));
    }),
  );

  return router;
}
