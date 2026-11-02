import { describe, expect, it } from "vitest";
import type { ContentDoc } from "@/types/content";
import { collectImageIds, hasLibraryImageMediaIdMismatch, hasLibraryImageReferenceMismatch, isDocEmpty } from "./content";

const mediaId = "123e4567-e89b-12d3-a456-426614174000";

describe("collectImageIds", () => {
  it("collects an explicit mediaId", () => {
    const doc: ContentDoc = {
      type: "doc",
      content: [{ type: "image", attrs: { mediaId, src: "https://example.com/image.png" } }],
    };

    expect(collectImageIds(doc)).toEqual([mediaId]);
  });

  it("derives the ID from a canonical library URL when mediaId is absent", () => {
    const doc: ContentDoc = {
      type: "doc",
      content: [{ type: "image", attrs: { src: `/api/v1/media/${mediaId}/file` } }],
    };

    expect(collectImageIds(doc)).toEqual([mediaId]);
    expect(isDocEmpty(doc)).toBe(false);
  });

  it("derives the ID when mediaId is blank", () => {
    const doc: ContentDoc = {
      type: "doc",
      content: [{ type: "image", attrs: { src: `/api/v1/media/${mediaId}/file`, mediaId: " " } }],
    };
    expect(collectImageIds(doc)).toEqual([mediaId]);
  });

  it("does not derive an ID from an external image URL", () => {
    const doc: ContentDoc = {
      type: "doc",
      content: [{ type: "image", attrs: { src: "https://example.com/image.png" } }],
    };

    expect(collectImageIds(doc)).toEqual([]);
    expect(isDocEmpty(doc)).toBe(true);
  });
});

describe("hasLibraryImageMediaIdMismatch", () => {
  it("detects a canonical URL with a different explicit mediaId", () => {
    expect(hasLibraryImageMediaIdMismatch(
      `/api/v1/media/${mediaId}/file`,
      "223e4567-e89b-12d3-a456-426614174000",
    )).toBe(true);
  });

  it("accepts a matching mediaId", () => {
    expect(hasLibraryImageMediaIdMismatch(`/api/v1/media/${mediaId}/file`, mediaId)).toBe(false);
  });

  it("accepts a missing mediaId on a canonical library URL", () => {
    expect(hasLibraryImageMediaIdMismatch(`/api/v1/media/${mediaId}/file`, undefined)).toBe(false);
  });

  it("does not compare mediaIds for external image URLs", () => {
    expect(hasLibraryImageMediaIdMismatch("https://example.com/image.png", "another-id")).toBe(false);
  });

	it("accepts a whitespace-only mediaId on a canonical library URL", () => {
  expect(hasLibraryImageMediaIdMismatch(`/api/v1/media/${mediaId}/file`, "  ")).toBe(false);
});
});

describe("hasLibraryImageReferenceMismatch", () => {
  it("finds a mismatched image nested inside the document", () => {
    const doc: ContentDoc = {
      type: "doc",
      content: [{
        type: "paragraph",
        content: [{
          type: "image",
          attrs: {
            src: `/api/v1/media/${mediaId}/file`,
            mediaId: "223e4567-e89b-12d3-a456-426614174000",
          },
        }],
      }],
    };

    expect(hasLibraryImageReferenceMismatch(doc)).toBe(true);
  });

  it("accepts a document with a canonical URL and no mediaId", () => {
    const doc: ContentDoc = {
      type: "doc",
      content: [{ type: "image", attrs: { src: `/api/v1/media/${mediaId}/file` } }],
    };

    expect(hasLibraryImageReferenceMismatch(doc)).toBe(false);
  });
});
