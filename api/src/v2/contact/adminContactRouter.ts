import {
  contactSettingsSchema,
  contactStatusSchema,
  contactSubmissionPatchSchema,
  listQuerySchema,
} from "@hd/content-schema";
import { Router } from "express";
import { z } from "zod";
import { ApiError, asyncHandler, parseOrThrow } from "../http.js";
import {
  countByStatus,
  deleteSubmission,
  findSubmission,
  listSubmissions,
  patchSubmission,
  readContactSettings,
  writeContactSettings,
} from "./contactStore.js";
import { mailer } from "./mailer.js";

/**
 * Contact Form Submissions, in the admin. HD-4.
 *
 * R, U and D but no C: a message exists because somebody sent one, and an
 * admin able to invent them would make the list a worse record than the inbox
 * it replaces. The update is narrow by design — status and Harma's own notes,
 * nothing else — so nothing here can rewrite what a visitor actually wrote.
 * That matters: the stored text is evidence of what was said, and an admin that
 * can edit it quietly destroys that.
 *
 * Mounted under the admin router, so `createRequireAuth` already covers every
 * route in this file.
 */

const listSchema = listQuerySchema.extend({
  /** The status chips above the grid. Absent means every status. */
  status: contactStatusSchema.optional(),
});

const settingsSchema = contactSettingsSchema.extend({
  version: z.coerce.number().int().min(0),
});

const editorOf = (req: { auth?: { subject: string } }): string => req.auth?.subject ?? "unknown";

// Express types route params as string | string[]; these routes always have a
// single segment.
const param = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

export function createAdminContactRouter(): Router {
  const router = Router();

  /* ---- settings ---- */

  /*
   * Before the `/:id` route, or "settings" is read as a message id. The same
   * ordering trap as `portfolioEntries/tagging` in the admin's own routes.
   */
  router.get(
    "/settings",
    asyncHandler(async (_req, res) => {
      const settings = await readContactSettings();
      /* `mailConfigured` travels with the settings so the page can say plainly
         that nothing will be emailed, rather than letting an operator tune a
         confirmation body that no credential exists to send. */
      res.json({ ...settings, mailConfigured: mailer.configured });
    }),
  );

  router.put(
    "/settings",
    asyncHandler(async (req, res) => {
      const { version, ...settings } = parseOrThrow(settingsSchema, req.body);
      const saved = await writeContactSettings(settings, version, editorOf(req));

      if (!saved) {
        throw ApiError.conflict("The contact settings changed since you opened them.");
      }

      res.json({ ...saved, mailConfigured: mailer.configured });
    }),
  );

  /* ---- messages ---- */

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const query = parseOrThrow(listSchema, req.query);
      const [page, counts] = await Promise.all([listSubmissions(query), countByStatus()]);
      res.json({ ...page, counts });
    }),
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const submission = await findSubmission(param(req.params.id));
      if (!submission) throw ApiError.notFound("No such message");
      res.json(submission);
    }),
  );

  router.patch(
    "/:id",
    asyncHandler(async (req, res) => {
      const { version, ...changes } = parseOrThrow(contactSubmissionPatchSchema, req.body);
      const id = param(req.params.id);

      const updated = await patchSubmission(id, changes, version, editorOf(req));

      if (!updated) {
        /* The filter matched neither the id nor the version, and it cannot say
           which. Reading the row back distinguishes a message that is gone
           from one somebody else has since changed, because those two need
           very different things from whoever is looking at the screen. */
        const current = await findSubmission(id);
        if (!current) throw ApiError.notFound("No such message");
        throw ApiError.conflict("This message changed since you opened it.");
      }

      res.json(updated);
    }),
  );

  router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
      const deleted = await deleteSubmission(param(req.params.id));
      if (!deleted) throw ApiError.notFound("No such message");
      res.status(204).end();
    }),
  );

  return router;
}
