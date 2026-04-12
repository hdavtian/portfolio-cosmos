import type { Request, Response } from "express";
import { z } from "zod";
import { ContentService } from "./content.service.js";

const keyParamsSchema = z.object({
  key: z.string().min(1),
});

export class ContentController {
  public constructor(private readonly contentService: ContentService) {}

  public getAll = async (_req: Request, res: Response): Promise<void> => {
    const data = await this.contentService.getAllContent();
    res.status(200).json({ items: data, count: data.length });
  };

  public getByKey = async (req: Request, res: Response): Promise<void> => {
    const parsedParams = keyParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({
        message: "Invalid content key",
        issues: parsedParams.error.issues,
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

  public getByKnownKey = (key: string) => {
    return async (_req: Request, res: Response): Promise<void> => {
      const item = await this.contentService.getByKey(key);
      if (!item) {
        res.status(404).json({ message: `Content not found for key '${key}'` });
        return;
      }

      res.status(200).json(item);
    };
  };
}
