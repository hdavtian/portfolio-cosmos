import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cssColorSchema, listQuerySchema, MAX_PAGE_SIZE, slugSchema } from "../src";

const readData = (file: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../../src/data/${file}`, import.meta.url), "utf8"));

describe("slugSchema", () => {
  it("accepts the ids already used in site content", () => {
    for (const id of ["investcloud", "hs-slide-1", "path-msg-01", "level-01", "equipment-acecount-02"]) {
      expect(slugSchema.safeParse(id).success, id).toBe(true);
    }
  });

  it("rejects uppercase, spaces and doubled hyphens", () => {
    for (const id of ["InvestCloud", "has space", "a--b", "-lead", ""]) {
      expect(slugSchema.safeParse(id).success, id).toBe(false);
    }
  });
});

describe("cssColorSchema", () => {
  it("accepts every color format used by current content", () => {
    const messages = readData("aboutPathTravelMessages.json") as Array<{ fontColor: string }>;
    const colors = ["#FFD65C", "#545353", "rgba(122, 219, 255, 0.72)", ...messages.map((m) => m.fontColor)];
    for (const color of colors) {
      expect(cssColorSchema.safeParse(color).success, color).toBe(true);
    }
  });

  it("rejects values that are not colors", () => {
    for (const value of ["red; background:url(x)", "2px solid", "#GGG"]) {
      expect(cssColorSchema.safeParse(value).success, value).toBe(false);
    }
  });
});

describe("listQuerySchema", () => {
  it("applies defaults and coerces query-string numbers", () => {
    expect(listQuerySchema.parse({ page: "2" })).toEqual({ page: 2, pageSize: 25 });
  });

  it("caps page size", () => {
    expect(listQuerySchema.safeParse({ pageSize: String(MAX_PAGE_SIZE + 1) }).success).toBe(false);
  });
});
