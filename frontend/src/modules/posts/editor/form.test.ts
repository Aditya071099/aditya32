import { describe, expect, it } from "vitest";
import type { ContentDoc } from "@/types/content";
import type { Post } from "@/types/post";
import { EMPTY_FORM, formAfterSave, formFromPost, inputFromForm, snapshotOf, validateForm, type EditorForm } from "./form";

function paragraph(text: string): ContentDoc {
  return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
}

const sent: EditorForm = { ...EMPTY_FORM, title: "Hello", slug: "hello", content: paragraph("First draft") };

describe("audience editing", () => {
  it("loads both groups and sends their IDs back on save", () => {
    const post: Post = {
      ...inputFromForm(sent), id: "post-1", status: "DRAFT", version: 1,
      authors: [], tags: [], coverImage: null, markdownSource: null,
      wordCount: 2, readingTimeMinutes: 1, publishedAt: null, createdAt: "", updatedAt: "",
      primaryAudiences: [{ id: "leaders", name: "Technology leaders", slug: "technology-leaders" }],
      secondaryAudiences: [{ id: "teams", name: "Engineering teams", slug: "engineering-teams" }],
    };
    const loaded = formFromPost(post);
    expect(inputFromForm(loaded)).toMatchObject({ primaryAudienceIds: ["leaders"], secondaryAudienceIds: ["teams"] });
    expect(inputFromForm({ ...loaded, primaryAudienceIds: [], secondaryAudienceIds: [] })).toMatchObject({
      primaryAudienceIds: [], secondaryAudienceIds: [],
    });
  });

  it("tracks an audience-only edit as unsaved and keeps it during a save", () => {
    const current = { ...sent, primaryAudienceIds: ["leaders"] };
    expect(snapshotOf(current)).not.toBe(snapshotOf(sent));
    expect(formAfterSave(current, sent, "hello").primaryAudienceIds).toEqual(["leaders"]);
  });

  it.each([undefined, null])("loads older responses with %s audience groups as empty selections", (audiences) => {
    // Older API responses can omit these fields or return null despite the current contract.
    const post = {
      ...inputFromForm(sent), authors: [], tags: [], coverImage: null, markdownSource: null,
      primaryAudiences: audiences, secondaryAudiences: audiences,
    } as unknown as Post;
    expect(inputFromForm(formFromPost(post))).toMatchObject({ primaryAudienceIds: [], secondaryAudienceIds: [] });
  });

  it("reports both the selection limit and overlapping groups", () => {
    const secondaryAudienceIds = Array.from({ length: 31 }, (_, i) => String(i));
    const errors = validateForm({ ...sent, primaryAudienceIds: ["0"], secondaryAudienceIds });
    expect(errors.secondaryAudienceIds).toContain("Choose at most 30 secondary audiences.");
    expect(errors.secondaryAudienceIds).toContain("An audience can only belong to one group per post.");
    expect(validateForm({ ...sent, secondaryAudienceIds }).secondaryAudienceIds).toBe("Choose at most 30 secondary audiences.");
    expect(validateForm({ ...sent, primaryAudienceIds: ["0"], secondaryAudienceIds: ["0"] }).secondaryAudienceIds)
      .toBe("An audience can only belong to one group per post.");
  });

  it("rejects overlapping groups and more than 30 selections", () => {
    expect(validateForm({ ...sent, primaryAudienceIds: ["teams"], secondaryAudienceIds: ["teams"] }).secondaryAudienceIds).toBeDefined();
    expect(validateForm({ ...sent, primaryAudienceIds: Array.from({ length: 31 }, (_, i) => String(i)) }).primaryAudienceIds).toBeDefined();
    expect(validateForm({ ...sent, primaryAudienceIds: ["leaders"], secondaryAudienceIds: ["teams"] })).toEqual({});
  });
});

describe("formAfterSave", () => {
  it("matches what was saved when nothing changed during the save", () => {
    // The editor compares the form with the saved snapshot to decide if it's dirty.
    expect(formAfterSave(sent, sent, "hello")).toEqual({ ...sent, slug: "hello" });
  });

  it("keeps the body typed while the save was in flight", () => {
    const current = { ...sent, content: paragraph("First draft, and more typed while saving") };
    expect(formAfterSave(current, sent, "hello").content).toEqual(current.content);
  });

  it("keeps a title typed while the save was in flight", () => {
    const current = { ...sent, title: "Hello again" };
    expect(formAfterSave(current, sent, "hello").title).toBe("Hello again");
  });

  it("takes the slug the server filled in", () => {
    const untitled = { ...sent, slug: "" };
    expect(formAfterSave(untitled, untitled, "draft-abc123").slug).toBe("draft-abc123");
  });

  it("keeps a slug that changed on screen during the save", () => {
    const current = { ...sent, slug: "hello-world" };
    expect(formAfterSave(current, sent, "hello").slug).toBe("hello-world");
  });
});

describe("snapshotOf", () => {
  it("treats the same body with its keys in another order as unchanged", () => {
    // Postgres JSONB sorts keys, so a loaded post has { text, type } where Tiptap emits { type, text }.
    const fromApi: ContentDoc = { type: "doc", content: [{ content: [{ text: "First draft", type: "text" }], type: "paragraph" }] };
    expect(snapshotOf({ ...sent, content: fromApi })).toBe(snapshotOf(sent));
  });

  it("still sees a change to the text", () => {
    expect(snapshotOf({ ...sent, content: paragraph("First draft, edited") })).not.toBe(snapshotOf(sent));
  });

  it("still sees paragraphs in a different order", () => {
    const one = { type: "paragraph", content: [{ type: "text", text: "One" }] };
    const two = { type: "paragraph", content: [{ type: "text", text: "Two" }] };
    const oneTwo: ContentDoc = { type: "doc", content: [one, two] };
    const twoOne: ContentDoc = { type: "doc", content: [two, one] };
    expect(snapshotOf({ ...sent, content: oneTwo })).not.toBe(snapshotOf({ ...sent, content: twoOne }));
  });

  it("still sees a change outside the body", () => {
    expect(snapshotOf({ ...sent, tagIds: ["t1"] })).not.toBe(snapshotOf(sent));
  });
});
