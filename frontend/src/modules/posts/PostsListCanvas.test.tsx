// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PostsListCanvas } from "./PostsListCanvas";
import type { PostListParams, PostStatus, PostSummary } from "@/types/post";
import { archivePost, countPostsByStatus, deletePost, duplicatePost, listPosts, publishPost, unpublishPost } from "./api";
import { listAuthors } from "@/modules/authors/api";
import { listTags } from "@/modules/tags/api";
import { Pagination } from "@/components/ui/Pagination";
import type { Page } from "@/types/api";

const { push, success, error } = vi.hoisted(() => ({
  push: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ success, error, info: vi.fn() }),
}));
vi.mock("./api", () => ({
  archivePost: vi.fn(),
  countPostsByStatus: vi.fn(),
  deletePost: vi.fn(),
  duplicatePost: vi.fn(),
  listPosts: vi.fn(),
  publishPost: vi.fn(),
  unpublishPost: vi.fn(),
}));
vi.mock("@/modules/authors/api", () => ({ listAuthors: vi.fn() }));
vi.mock("@/modules/tags/api", () => ({ listTags: vi.fn() }));

const tag = { id: "tag-1", name: "Tagged", slug: "tagged", postCount: 0, createdAt: "2025-01-01T00:00:00Z" };
const author = {
  id: "author-1",
  name: "Ada",
  slug: "ada",
  bio: "",
  avatar: null,
  postCount: 0,
  createdAt: "2025-01-01T00:00:00Z",
};

function post(id: number, status: PostStatus = "DRAFT", tagged = true): PostSummary {
  return {
    id: `post-${id}`,
    title: `Post ${id}`,
    slug: `post-${id}`,
    excerpt: "",
    status,
    featured: false,
    authors: [author],
    tags: tagged ? [tag] : [],
    coverImage: null,
    wordCount: 10,
    readingTimeMinutes: 1,
    publishedAt: status === "PUBLISHED" ? "2025-01-01T00:00:00Z" : null,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: `2025-01-${String((id % 28) + 1).padStart(2, "0")}T00:00:00Z`,
  };
}

let records: PostSummary[];
let listRequests: PostListParams[];
let allRequestedPages: number[];
let holdNextPageResponse: boolean;
let resolveHeldResponse: ((response: Page<PostSummary>) => void) | null;

function pageFor(params: PostListParams = {}) {
  let matches = records.filter((item) => !params.status || item.status === params.status);
  if (params.tagId) matches = matches.filter((item) => item.tags.some((itemTag) => itemTag.id === params.tagId));
  if (params.authorId) matches = matches.filter((item) => item.authors.some((itemAuthor) => itemAuthor.id === params.authorId));
  if (params.q) matches = matches.filter((item) => item.title.toLowerCase().includes(params.q!.toLowerCase()));

  const size = params.size ?? 10;
  const totalPages = matches.length === 0 ? 0 : Math.ceil(matches.length / size);
  const page = params.page ?? 0;
  return {
    items: matches.slice(page * size, page * size + size),
    meta: { page, size, totalElements: matches.length, totalPages },
  };
}

async function chooseAction(user: ReturnType<typeof userEvent.setup>, title: string, action: string) {
  await user.click(screen.getByRole("button", { name: `Actions for ${title}` }));
  await user.click(screen.getByRole("menuitem", { name: action }));
}

async function confirmDelete(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Delete" }));
}

beforeEach(() => {
  records = [];
  listRequests = [];
  allRequestedPages = [];
  holdNextPageResponse = false;
  resolveHeldResponse = null;
  vi.clearAllMocks();
  vi.mocked(listPosts).mockImplementation(async (params = {}) => {
    listRequests.push({ ...params });
    allRequestedPages.push(params.page ?? 0);
    const response = pageFor(params);
    if (holdNextPageResponse && params.page === 1) {
      holdNextPageResponse = false;
      return new Promise<Page<PostSummary>>((resolve) => {
        resolveHeldResponse = resolve;
      });
    }
    return response;
  });
  vi.mocked(countPostsByStatus).mockImplementation(async () => ({
    ALL: records.length,
    DRAFT: records.filter((item) => item.status === "DRAFT").length,
    PUBLISHED: records.filter((item) => item.status === "PUBLISHED").length,
    ARCHIVED: records.filter((item) => item.status === "ARCHIVED").length,
  }));
  vi.mocked(listAuthors).mockResolvedValue([author]);
  vi.mocked(listTags).mockResolvedValue([tag]);
  vi.mocked(deletePost).mockImplementation(async (id) => {
    records = records.filter((item) => item.id !== id);
  });
  vi.mocked(archivePost).mockImplementation(async (id) => {
    records = records.map((item) => item.id === id ? { ...item, status: "ARCHIVED" } : item);
    return {} as never;
  });
  vi.mocked(publishPost).mockImplementation(async (id) => {
    records = records.map((item) => item.id === id ? { ...item, status: "PUBLISHED" } : item);
    return {} as never;
  });
  vi.mocked(unpublishPost).mockImplementation(async (id) => {
    records = records.map((item) => item.id === id ? { ...item, status: "DRAFT" } : item);
    return {} as never;
  });
  vi.mocked(duplicatePost).mockResolvedValue({} as never);
});

afterEach(cleanup);

describe("PostsListCanvas page reconciliation", () => {
  it("returns to the previous page after deleting the only post on page 2", async () => {
    const user = userEvent.setup();
    records = Array.from({ length: 11 }, (_, index) => post(index + 1));
    render(<PostsListCanvas />);

    await screen.findByText("Post 1");
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await screen.findByText("Post 11");
    await chooseAction(user, "Post 11", "Delete");
    await confirmDelete(user);

    await screen.findByText("Post 1");
    expect(screen.queryByText("Post 11")).not.toBeInTheDocument();
    expect(screen.getByText("1 / 1")).toBeInTheDocument();
    expect(screen.getByText("1–10 of 10 posts")).toBeInTheDocument();
    expect(allRequestedPages).toContain(1);
    expect(allRequestedPages.at(-1)).toBe(0);
  });

  it("keeps the active tag query while correcting a page after a successful delete", async () => {
    const user = userEvent.setup();
    records = [
      ...Array.from({ length: 11 }, (_, index) => post(index + 1, "DRAFT", true)),
      post(20, "DRAFT", false),
    ];
    render(<PostsListCanvas />);

    await screen.findByText("Post 1");
    await user.selectOptions(screen.getByRole("combobox", { name: "Filter by tag" }), "tag-1");
    await screen.findByText("Post 1");
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await screen.findByText("Post 11");
    await chooseAction(user, "Post 11", "Delete");
    await confirmDelete(user);

    await screen.findByText("Post 1");
    expect(screen.queryByText("Post 20")).not.toBeInTheDocument();
    expect(listRequests.at(-1)?.tagId).toBe("tag-1");
    expect(listRequests.at(-1)?.page).toBe(0);
    expect(screen.getByText("1–10 of 10 posts")).toBeInTheDocument();
  });

  it("ignores an older out-of-range refresh if the user changes the query before it settles", async () => {
    const user = userEvent.setup();
    records = [
      ...Array.from({ length: 11 }, (_, index) => post(index + 1, "DRAFT", true)),
      post(20, "DRAFT", false),
    ];
    render(<PostsListCanvas />);
    await screen.findByText("Post 1");
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await screen.findByText("Post 11");

    holdNextPageResponse = true;
    await chooseAction(user, "Post 11", "Delete");
    await confirmDelete(user);
    await waitFor(() => expect(resolveHeldResponse).not.toBeNull());

    await user.selectOptions(screen.getByRole("combobox", { name: "Filter by tag" }), "tag-1");
    await screen.findByText("Post 1");
    expect(listRequests.at(-1)?.tagId).toBe("tag-1");
    expect(listRequests.at(-1)?.page).toBe(0);

    await act(async () => {
      resolveHeldResponse?.(pageFor({ page: 1, size: 10 }));
    });

    expect(screen.getByText("Post 1")).toBeInTheDocument();
    expect(screen.queryByText("Post 20")).not.toBeInTheDocument();
    expect(screen.getByText("1–10 of 10 posts")).toBeInTheDocument();
  });

  it.each([
    { tab: "Published", source: "PUBLISHED" as const, action: "Archive", mutate: "archive" as const },
    { tab: "Published", source: "PUBLISHED" as const, action: "Unpublish", mutate: "unpublish" as const },
    { tab: "Drafts", source: "DRAFT" as const, action: "Publish", mutate: "publish" as const },
    { tab: "Archived", source: "ARCHIVED" as const, action: "Restore to drafts", mutate: "unpublish" as const },
  ])("corrects the current page when $action removes a post from the $tab tab", async ({ tab, source, action, mutate }) => {
    const user = userEvent.setup();
    records = Array.from({ length: 11 }, (_, index) => post(index + 1, source));
    render(<PostsListCanvas />);

    await screen.findByText("Post 1");
    await user.click(screen.getByRole("tab", { name: new RegExp(tab) }));
    await screen.findByText("Post 1");
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await screen.findByText("Post 11");
    await chooseAction(user, "Post 11", action);

    if (mutate === "archive") await waitFor(() => expect(archivePost).toHaveBeenCalledWith("post-11"));
    if (mutate === "publish") await waitFor(() => expect(publishPost).toHaveBeenCalledWith("post-11"));
    if (mutate === "unpublish") await waitFor(() => expect(unpublishPost).toHaveBeenCalledWith("post-11"));

    await screen.findByText("Post 1");
    expect(screen.getByText("1 / 1")).toBeInTheDocument();
    expect(screen.getByText("1–10 of 10 posts")).toBeInTheDocument();
    expect(listRequests.at(-1)?.status).toBe(source);
    expect(listRequests.at(-1)?.page).toBe(0);
  });

  it("preserves the current page when a successful action leaves that page valid", async () => {
    const user = userEvent.setup();
    records = Array.from({ length: 11 }, (_, index) => post(index + 1));
    render(<PostsListCanvas />);
    await screen.findByText("Post 1");
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await screen.findByText("Post 11");

    // Duplicate does not remove the source post from this result set.
    await chooseAction(user, "Post 11", "Duplicate");
    await waitFor(() => expect(duplicatePost).toHaveBeenCalledWith("post-11"));

    expect(listRequests.at(-1)?.page).toBe(1);
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
  });

  it("preserves page 1 when an action reduces the result count but page 1 remains valid", async () => {
    const user = userEvent.setup();
    records = Array.from({ length: 11 }, (_, index) => post(index + 1, "DRAFT"));
    render(<PostsListCanvas />);
    await screen.findByText("Post 1");
    await user.click(screen.getByRole("tab", { name: /Drafts/ }));
    await screen.findByText("Post 1");

    await chooseAction(user, "Post 1", "Archive");
    await waitFor(() => expect(archivePost).toHaveBeenCalledWith("post-1"));

    await waitFor(() => expect(listRequests.at(-1)?.status).toBe("DRAFT"));
    expect(listRequests.at(-1)?.page).toBe(0);
    expect(screen.getByText("1 / 1")).toBeInTheDocument();
    expect(screen.getByText("1–10 of 10 posts")).toBeInTheDocument();
  });

  it("shows the normal empty state and hides pagination when the query has no results", async () => {
    const user = userEvent.setup();
    records = [post(1)];
    vi.mocked(deletePost).mockImplementation(async () => { records = []; });
    render(<PostsListCanvas />);
    await screen.findByText("Post 1");
    await chooseAction(user, "Post 1", "Delete");
    await confirmDelete(user);

    expect(await screen.findByText("No posts yet")).toBeInTheDocument();
    expect(screen.queryByText(/of 0 posts/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next page" })).not.toBeInTheDocument();
  });

  it("does not correct pages after a failed mutation", async () => {
    const user = userEvent.setup();
    records = Array.from({ length: 11 }, (_, index) => post(index + 1));
    vi.mocked(deletePost).mockRejectedValue(new Error("Delete failed"));
    render(<PostsListCanvas />);
    await screen.findByText("Post 1");
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await screen.findByText("Post 11");
    await chooseAction(user, "Post 11", "Delete");
    await confirmDelete(user);

    await waitFor(() => expect(error).toHaveBeenCalledWith("Delete failed"));
    expect(allRequestedPages.at(-1)).toBe(1);
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    expect(screen.getAllByText("Post 11")).toHaveLength(2); // row and delete confirmation
  });

  it("does not refresh or move pages when a delete is cancelled", async () => {
    const user = userEvent.setup();
    records = Array.from({ length: 11 }, (_, index) => post(index + 1));
    render(<PostsListCanvas />);
    await screen.findByText("Post 1");
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await screen.findByText("Post 11");
    const requestCount = listRequests.length;
    await chooseAction(user, "Post 11", "Delete");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(deletePost).not.toHaveBeenCalled();
    expect(listRequests).toHaveLength(requestCount);
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    expect(screen.getByText("Post 11")).toBeInTheDocument();
  });
});

describe("Pagination boundaries", () => {
  it.each([
    { label: "zero results", meta: { page: 0, size: 10, totalElements: 0, totalPages: 0 }, range: "0–0 of 0 posts", pageLabel: "0 / 0" },
    { label: "full page", meta: { page: 0, size: 10, totalElements: 10, totalPages: 1 }, range: "1–10 of 10 posts", pageLabel: "1 / 1" },
    { label: "partial last page", meta: { page: 1, size: 10, totalElements: 11, totalPages: 2 }, range: "11–11 of 11 posts", pageLabel: "2 / 2" },
    { label: "stale out-of-range page", meta: { page: 1, size: 10, totalElements: 10, totalPages: 1 }, range: "1–10 of 10 posts", pageLabel: "1 / 1" },
  ])("renders valid ranges for $label", ({ meta, range, pageLabel }) => {
    render(<Pagination meta={meta} onPageChange={vi.fn()} noun="posts" />);
    expect(screen.getByText(range)).toBeInTheDocument();
    expect(screen.getByText(pageLabel)).toBeInTheDocument();
  });
});
