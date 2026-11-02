import type { PageMeta } from "@/types/api";
import type { PostListParams, PostSortKey, PostStatus } from "@/types/post";

export interface PostsListQueryInput {
  tab: PostStatus | "ALL";
  query: string;
  tagId: string;
  authorId: string;
  sort: PostSortKey;
  direction: "asc" | "desc";
  page: number;
  pageSize: number;
}

/** Build the exact API query for the currently visible posts list. */
export function buildPostListParams(input: PostsListQueryInput): PostListParams {
  return {
    status: input.tab === "ALL" ? undefined : input.tab,
    q: input.query,
    tagId: input.tagId || undefined,
    authorId: input.authorId || undefined,
    sort: input.sort,
    direction: input.direction,
    page: input.page,
    size: input.pageSize,
  };
}

/**
 * Return the same active list query with its page corrected when a matching
 * response proves that the requested page no longer exists.
 *
 * A response for a different page is stale for this decision and must be ignored.
 * Page zero remains the canonical empty-list page when there are no results.
 */
export function reconcilePostListPage(params: PostListParams, meta: PageMeta): PostListParams | null {
  const requestedPage = params.page ?? 0;
  if (!Number.isInteger(requestedPage) || requestedPage < 0 || meta.page !== requestedPage) return null;
  if (!Number.isInteger(meta.totalPages) || meta.totalPages < 0) return null;

  const correctedPage =
    meta.totalPages === 0
      ? requestedPage > 0
        ? 0
        : null
      : requestedPage >= meta.totalPages
        ? meta.totalPages - 1
        : null;

  if (correctedPage === null || correctedPage === requestedPage) return null;
  return { ...params, page: correctedPage };
}
