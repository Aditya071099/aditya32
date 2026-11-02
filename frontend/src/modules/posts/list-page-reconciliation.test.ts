import { describe, expect, it } from "vitest";
import type { PageMeta } from "@/types/api";
import type { PostListParams } from "@/types/post";
import { buildPostListParams, reconcilePostListPage } from "./list-page-reconciliation";

function meta(page: number, totalPages: number): PageMeta {
  return { page, size: 10, totalElements: totalPages === 0 ? 0 : (totalPages - 1) * 10 + 1, totalPages };
}

describe("reconcilePostListPage", () => {
  it("builds list params with search and author filters for the active query", () => {
    expect(
      buildPostListParams({
        tab: "ALL",
        query: "release notes",
        tagId: "",
        authorId: "author-1",
        sort: "updatedAt",
        direction: "asc",
        page: 1,
        pageSize: 10,
      }),
    ).toEqual({
      q: "release notes",
      authorId: "author-1",
      sort: "updatedAt",
      direction: "asc",
      page: 1,
      size: 10,
      status: undefined,
      tagId: undefined,
    });
  });

  it("moves an out-of-range last page back while preserving the active query", () => {
    const params: PostListParams = {
      status: "PUBLISHED",
      q: "release notes",
      tagId: "tag-1",
      authorId: "author-1",
      sort: "updatedAt",
      direction: "asc",
      page: 1,
      size: 10,
    };

    expect(reconcilePostListPage(params, meta(1, 1))).toEqual({ ...params, page: 0 });
  });

  it.each([
    {
      name: "search",
      params: { q: "release notes", page: 2, size: 10 } satisfies PostListParams,
      response: meta(2, 2),
    },
    {
      name: "author filter",
      params: { authorId: "author-1", page: 1, size: 10 } satisfies PostListParams,
      response: meta(1, 1),
    },
    {
      name: "search and author filter",
      params: { q: "release", authorId: "author-1", page: 3, size: 10 } satisfies PostListParams,
      response: meta(3, 2),
    },
  ])("preserves the $name query while correcting its page", ({ params, response }) => {
    const corrected = reconcilePostListPage(params, response);
    expect(corrected).toEqual({ ...params, page: response.totalPages - 1 });
    expect(corrected?.q).toBe(params.q);
    expect(corrected?.authorId).toBe(params.authorId);
  });

  it("keeps the page when it remains valid", () => {
    const params: PostListParams = { page: 1, size: 10 };
    expect(reconcilePostListPage(params, meta(1, 2))).toBeNull();
  });

  it("ignores a stale response for a different requested page", () => {
    const params: PostListParams = { page: 1, size: 10 };
    expect(reconcilePostListPage(params, meta(0, 1))).toBeNull();
  });

  it("returns to page 1 when an out-of-range query now has no results", () => {
    const params: PostListParams = { q: "no match", authorId: "author-1", page: 2, size: 10 };
    expect(reconcilePostListPage(params, meta(2, 0))).toEqual({ ...params, page: 0 });
  });

  it("does not move page 1 for a genuinely empty result", () => {
    const params: PostListParams = { page: 0, size: 10 };
    expect(reconcilePostListPage(params, meta(0, 0))).toBeNull();
  });

  it("does not correct malformed page metadata", () => {
    const params: PostListParams = { page: 2, size: 10 };
    expect(reconcilePostListPage(params, { ...meta(2, 2), totalPages: -1 })).toBeNull();
  });
});
