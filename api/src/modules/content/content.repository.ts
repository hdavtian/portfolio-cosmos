import { ContentModel, type ContentDocument } from "./content.model.js";

export type UpsertContentInput = {
  key: string;
  category: string;
  payload: unknown;
  sourceType: string;
  sourcePath: string;
  checksum: string;
  version?: number;
  isActive?: boolean;
};

export class ContentRepository {
  public async findAllActive(): Promise<ContentDocument[]> {
    return ContentModel.find({ isActive: true }).sort({ key: 1 }).lean();
  }

  public async findByKey(key: string): Promise<ContentDocument | null> {
    return ContentModel.findOne({ key, isActive: true }).lean();
  }

  public async upsertMany(items: UpsertContentInput[]): Promise<void> {
    if (items.length === 0) return;

    await ContentModel.bulkWrite(
      items.map((item) => ({
        updateOne: {
          filter: { key: item.key },
          update: {
            $set: {
              category: item.category,
              payload: item.payload,
              sourceType: item.sourceType,
              sourcePath: item.sourcePath,
              checksum: item.checksum,
              version: item.version ?? 1,
              isActive: item.isActive ?? true,
            },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  }
}
