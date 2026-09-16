import { ContentRepository } from "./content.repository.js";

export class ContentService {
  public constructor(private readonly repository: ContentRepository) {}

  public async getByKey(key: string): Promise<unknown | null> {
    const doc = await this.repository.findByKey(key);
    if (!doc) return null;

    return {
      key: doc.key,
      category: doc.category,
      payload: doc.payload,
      version: doc.version,
      updatedAt: doc.updatedAt,
    };
  }
}
