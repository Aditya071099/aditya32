"use client";

/* eslint-disable @next/next/no-img-element -- cover thumbnails are user uploads (data/remote URLs) */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  Copy,
  EllipsisVertical,
  FileText,
  Pencil,
  Plus,
  SearchX,
  Send,
  Star,
  Trash2,
  Undo2,
} from "lucide-react";
import { AvatarStack } from "@/components/ui/Avatar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type DataTableColumn, type DataTableSort } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Menu, type MenuItem } from "@/components/ui/Menu";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { SearchInput } from "@/components/ui/SearchInput";
import { Select } from "@/components/ui/Select";
import { PostStatusChip, StatusChip } from "@/components/ui/StatusChip";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { useAsync } from "@/hooks/useAsync";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { formatDateTime, timeAgo } from "@/lib/format";
import { listAuthors } from "@/modules/authors/api";
import { listTags } from "@/modules/tags/api";
import type { PostSortKey, PostStatus, PostSummary } from "@/types/post";
import { archivePost, countPostsByStatus, deletePost, duplicatePost, listPosts, publishPost, unpublishPost } from "./api";
import { buildPostListParams, reconcilePostListPage } from "./list-page-reconciliation";

type StatusTab = PostStatus | "ALL";

const PAGE_SIZE = 10;

export function PostsListCanvas() {
  const router = useRouter();
  const toast = useToast();

  const [tab, setTab] = useState<StatusTab>("ALL");
  const [query, setQuery] = useState("");
  const [tagId, setTagId] = useState("");
  const [authorId, setAuthorId] = useState("");
  const [sort, setSort] = useState<DataTableSort>({ key: "updatedAt", direction: "desc" });
  const [page, setPage] = useState(0);
  const [pageCorrectionQueryKey, setPageCorrectionQueryKey] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PostSummary | null>(null);
  const debouncedQuery = useDebouncedValue(query);

  const posts = useAsync(
    () =>
      listPosts(
        buildPostListParams({
          tab,
          query: debouncedQuery,
          tagId,
          authorId,
          sort: sort.key as PostSortKey,
          direction: sort.direction,
          page,
          pageSize: PAGE_SIZE,
        }),
      ),
    [tab, debouncedQuery, tagId, authorId, sort, page],
  );
  const pageMeta = posts.data?.meta;
  const listQueryKey = JSON.stringify([tab, debouncedQuery, tagId, authorId, sort.key, sort.direction, PAGE_SIZE]);
  const listParams = buildPostListParams({
    tab,
    query: debouncedQuery,
    tagId,
    authorId,
    sort: sort.key as PostSortKey,
    direction: sort.direction,
    page,
    pageSize: PAGE_SIZE,
  });
  const correctedListParams =
    !posts.loading && !posts.error && pageMeta ? reconcilePostListPage(listParams, pageMeta) : null;
  const isPageCorrectionPending =
    !posts.error && (pageCorrectionQueryKey === listQueryKey || correctedListParams !== null);

  // Only reconcile after the response for this exact page has settled. During an
  // ordinary page/filter request, useAsync keeps the previous rows visible.
  useEffect(() => {
    if (posts.loading) return;
    if (posts.error) return;
    if (!pageMeta) return;

    const corrected = reconcilePostListPage(
      buildPostListParams({
        tab,
        query: debouncedQuery,
        tagId,
        authorId,
        sort: sort.key as PostSortKey,
        direction: sort.direction,
        page,
        pageSize: PAGE_SIZE,
      }),
      pageMeta,
    );
    if (corrected) {
      // The settled response is async external data; mark this correction before changing page.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPageCorrectionQueryKey(listQueryKey);
      setPage(corrected.page ?? 0);
    } else if (pageCorrectionQueryKey === listQueryKey) {
      setPageCorrectionQueryKey(null);
    }
  }, [
    posts.loading,
    posts.error,
    pageMeta,
    tab,
    debouncedQuery,
    tagId,
    authorId,
    sort.key,
    sort.direction,
    page,
    listQueryKey,
    pageCorrectionQueryKey,
  ]);

  const counts = useAsync(countPostsByStatus, []);
  const authors = useAsync(listAuthors, []);
  const tags = useAsync(listTags, []);

  const hasFilters = Boolean(query || tagId || authorId);
  const changePage = (value: number) => {
    setPageCorrectionQueryKey(null);
    setPage(value);
  };
  const resetPage = <T,>(setter: (value: T) => void) => (value: T) => {
    setPageCorrectionQueryKey(null);
    setter(value);
    setPage(0);
  };

  const refresh = () => {
    posts.reload();
    counts.reload();
  };

  /** Runs a row action, then refreshes the list and reports the outcome. */
  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      toast.success(success);
      refresh();
    } catch (error) {
      toast.error((error as Error).message);
      throw error;
    }
  };

  const rowActions = (post: PostSummary): (MenuItem | "separator")[] => [
    { label: "Edit", icon: Pencil, onSelect: () => router.push(`/posts/${post.id}`) },
    {
      label: "Duplicate",
      icon: Copy,
      onSelect: () => void run(() => duplicatePost(post.id), `Created a copy of “${post.title || "Untitled"}”.`).catch(() => {}),
    },
    "separator",
    post.status === "PUBLISHED"
      ? { label: "Unpublish", icon: Undo2, onSelect: () => void run(() => unpublishPost(post.id), "Moved back to drafts.").catch(() => {}) }
      : { label: "Publish", icon: Send, onSelect: () => void run(() => publishPost(post.id), "Post published.").catch(() => {}) },
    post.status === "ARCHIVED"
      ? { label: "Restore to drafts", icon: Undo2, onSelect: () => void run(() => unpublishPost(post.id), "Restored to drafts.").catch(() => {}) }
      : { label: "Archive", icon: Archive, onSelect: () => void run(() => archivePost(post.id), "Post archived.").catch(() => {}) },
    "separator",
    { label: "Delete", icon: Trash2, danger: true, onSelect: () => setPendingDelete(post) },
  ];

  const columns: DataTableColumn<PostSummary>[] = [
    {
      key: "title",
      header: "Title",
      sortable: true,
      render: (post) => (
        <div className="flex min-w-0 items-center gap-3">
          {post.coverImage ? (
            <img src={post.coverImage.url} alt="" className="h-9 w-14 shrink-0 rounded-sm border border-line object-cover" />
          ) : (
            <span className="flex h-9 w-14 shrink-0 items-center justify-center rounded-sm border border-dashed border-line text-[var(--atomity-gray-400)]">
              <FileText size={14} aria-hidden />
            </span>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className={post.title ? "truncate font-semibold" : "truncate font-semibold text-muted italic"}>
                {post.title || "Untitled"}
              </span>
              {post.featured && <Star size={12} className="shrink-0 fill-[var(--atomity-orange)] text-[var(--atomity-orange)]" aria-label="Featured" />}
            </div>
            <div className="truncate font-mono text-[11px] text-muted">/{post.slug}</div>
          </div>
        </div>
      ),
    },
    { key: "status", header: "Status", width: "112px", render: (post) => <PostStatusChip status={post.status} /> },
    { key: "authors", header: "Authors", width: "104px", render: (post) => <AvatarStack people={post.authors} /> },
    {
      key: "tags",
      header: "Tags",
      width: "200px",
      render: (post) =>
        post.tags.length === 0 ? (
          <span className="text-muted">—</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {post.tags.slice(0, 2).map((tag) => (
              <StatusChip key={tag.id} tone="neutral" className="!normal-case !tracking-normal">
                {tag.name}
              </StatusChip>
            ))}
            {post.tags.length > 2 && <span className="font-mono text-[10px] text-muted">+{post.tags.length - 2}</span>}
          </div>
        ),
    },
    {
      key: "audiences",
      header: "Audience",
      width: "200px",
      render: (post) => {
        const primary = (post.primaryAudiences ?? []).map((a) => a.name).join(", ") || "None";
        const secondary = (post.secondaryAudiences ?? []).map((a) => a.name).join(", ") || "None";
        return (
          <div className="flex min-w-0 flex-col gap-1 text-[11.5px] text-secondary">
            <span className="truncate" title={`Primary: ${primary}`}><span className="font-semibold">Primary:</span> {primary}</span>
            <span className="truncate" title={`Secondary: ${secondary}`}><span className="font-semibold">Secondary:</span> {secondary}</span>
          </div>
        );
      },
    },
    {
      key: "updatedAt",
      header: "Updated",
      width: "116px",
      sortable: true,
      render: (post) => (
        <span title={formatDateTime(post.updatedAt)} className="text-secondary">
          {timeAgo(post.updatedAt)}
        </span>
      ),
    },
    {
      key: "wordCount",
      header: "Words",
      width: "80px",
      align: "right",
      sortable: true,
      render: (post) => <span className="font-mono text-[11.5px] tabular-nums">{post.wordCount.toLocaleString()}</span>,
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      width: "48px",
      align: "right",
      render: (post) => (
        <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} className="inline-flex">
          <Menu
            items={rowActions(post)}
            trigger={(props) => (
              <button
                type="button"
                {...props}
                aria-label={`Actions for ${post.title || "Untitled"}`}
                className="cursor-pointer rounded-sm p-1 text-muted hover:bg-hover hover:text-ink"
              >
                <EllipsisVertical size={15} />
              </button>
            )}
          />
        </div>
      ),
    },
  ];

  const onSortChange = (key: string) => {
    setPageCorrectionQueryKey(null);
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "desc" ? "asc" : key === "title" ? "asc" : "desc",
    }));
    setPage(0);
  };

  const rows = isPageCorrectionPending ? [] : posts.data?.items ?? [];
  const isFirstLoad = posts.loading && !posts.data;

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-5 p-[var(--page-pad)]">
      <PageHeader
        title="Posts"
        description="Write, review and publish your blog posts."
        actions={
          <Link href="/posts/new" className="btn btn-primary">
            <Plus size={14} aria-hidden />
            New post
          </Link>
        }
      />

      <div className="rounded-lg border-[1.5px] border-line bg-card shadow-card">
        <div className="px-3.5 pt-1">
          <Tabs<StatusTab>
            label="Filter by status"
            value={tab}
            onChange={resetPage(setTab)}
            items={[
              { key: "ALL", label: "All", count: counts.data?.ALL },
              { key: "DRAFT", label: "Drafts", count: counts.data?.DRAFT },
              { key: "PUBLISHED", label: "Published", count: counts.data?.PUBLISHED },
              { key: "ARCHIVED", label: "Archived", count: counts.data?.ARCHIVED },
            ]}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3.5 py-3">
          <div className="min-w-[220px] flex-1">
            <SearchInput label="Search posts" placeholder="Search title, slug or content" value={query} onChange={resetPage(setQuery)} />
          </div>
          <Select
            aria-label="Filter by author"
            value={authorId}
            onChange={(e) => resetPage(setAuthorId)(e.target.value)}
            className="w-[170px]"
            options={[{ value: "", label: "All authors" }, ...(authors.data ?? []).map((a) => ({ value: a.id, label: a.name }))]}
          />
          <Select
            aria-label="Filter by tag"
            value={tagId}
            onChange={(e) => resetPage(setTagId)(e.target.value)}
            className="w-[160px]"
            options={[{ value: "", label: "All tags" }, ...(tags.data ?? []).map((t) => ({ value: t.id, label: t.name }))]}
          />
          {hasFilters && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setPageCorrectionQueryKey(null);
                setQuery("");
                setTagId("");
                setAuthorId("");
                setPage(0);
              }}
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="overflow-x-auto px-1">
          {posts.error ? (
            <div className="p-4">
              <ErrorState title="Couldn't load posts" error={posts.error} onRetry={posts.reload} />
            </div>
          ) : !isFirstLoad && !posts.loading && !isPageCorrectionPending && rows.length === 0 ? (
            <div className="p-4">
              {hasFilters || tab !== "ALL" ? (
                <EmptyState icon={SearchX} title="No posts match" description="Try a different search, status or filter." />
              ) : (
                <EmptyState
                  icon={FileText}
                  title="No posts yet"
                  description="Your first post is one click away."
                  action={
                    <Link href="/posts/new" className="btn btn-primary btn-sm">
                      <Plus size={13} aria-hidden /> New post
                    </Link>
                  }
                />
              )}
            </div>
          ) : (
            <div className="min-w-[1120px]">
            <DataTable
              caption="Posts"
              columns={columns}
              rows={rows}
              rowKey={(post) => post.id}
              onRowClick={(post) => router.push(`/posts/${post.id}`)}
              sort={sort}
              onSortChange={onSortChange}
              loading={posts.loading || isPageCorrectionPending}
            />
            </div>
          )}
        </div>

        {posts.data && posts.data.meta.totalElements > 0 && !isPageCorrectionPending && (
          <div className="border-t border-line px-3.5 py-2">
            <Pagination meta={posts.data.meta} onPageChange={changePage} noun="posts" />
          </div>
        )}
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title="Delete this post?"
          message={
            <>
              <strong>{pendingDelete.title || "Untitled"}</strong> will be permanently deleted. This can’t be undone — archive it
              instead if you might need it again.
            </>
          }
          confirmLabel="Delete"
          danger
          onClose={() => setPendingDelete(null)}
          onConfirm={() => run(() => deletePost(pendingDelete.id), "Post deleted.")}
        />
      )}
    </div>
  );
}
