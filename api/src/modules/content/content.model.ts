import { Schema, model, type InferSchemaType } from "mongoose";

const contentSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    category: { type: String, required: true, index: true },
    payload: { type: Schema.Types.Mixed, required: true },
    sourceType: { type: String, required: true },
    sourcePath: { type: String, required: true },
    checksum: { type: String, required: true },
    version: { type: Number, required: true, default: 1 },
    isActive: { type: Boolean, required: true, default: true },
  },
  {
    timestamps: true,
    collection: "content_documents",
  },
);

export type ContentDocument = InferSchemaType<typeof contentSchema>;

export const ContentModel = model("Content", contentSchema);
