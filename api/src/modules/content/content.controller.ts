import type { Request, Response } from "express";
import { z } from "zod";
import { ContentService } from "./content.service.js";

// Only the keys the site still requests are served. Retired keys (about-deck,
// about-hall-*, cosmic-narrative, about-content, legacy-websites,
// moon-portfolio-mapping) 404 without a database round trip; their documents
// are left in Atlas untouched.
const SERVED_KEYS = ["resume", "portfolio-cores"] as const;

const keyParamsSchema = z.object({
  key: z.enum(SERVED_KEYS),
});

export class ContentController {
  public constructor(private readonly contentService: ContentService) {}

  public getByKey = async (req: Request, res: Response): Promise<void> => {
    const parsedParams = keyParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(404).json({
        message: `Content not found for key '${String(req.params.key)}'`,
      });
      return;
    }

    const item = await this.contentService.getByKey(parsedParams.data.key);
    if (!item) {
      res
        .status(404)
        .json({
          message: `Content not found for key '${parsedParams.data.key}'`,
        });
      return;
    }

    res.status(200).json(item);
  };
}
