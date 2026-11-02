"use client";

/* eslint-disable @next/next/no-img-element -- cover images are user uploads (data/remote URLs) */
import { useState } from "react";
import { Check, CircleAlert, ImagePlus, RefreshCw, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field } from "@/components/ui/Field";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { Panel } from "@/components/ui/Panel";
import { PostStatusChip } from "@/components/ui/StatusChip";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { useAsync } from "@/hooks/useAsync";
import { formatDateTime, pluralize } from "@/lib/format";
import { slugify } from "@/lib/slug";
import { cn } from "@/lib/utils";
import { createAuthor, listAuthors } from "@/modules/authors/api";
import { listAudiences } from "@/modules/audiences/api";
import { MediaPickerModal } from "@/modules/media/MediaPickerModal";
import { createTag, listTags } from "@/modules/tags/api";
import { POST_LIMITS, type PostStatus } from "@/types/post";
import type { EditorForm, FormErrors } from "./form";

/** Domain shown in the search-result preview. Purely cosmetic. */
const PREVIEW_HOST = "yourblog.com";

export interface EditorMeta {
  status: PostStatus;
  publishedAt: string | null;
  updatedAt: string | null;
}

export interface EditorSidebarProps {
  form: EditorForm;
  errors: FormErrors;
  meta: EditorMeta;
  wordCount: number;
  readingTime: number;
  onChange: (patch: Partial<EditorForm>) => void;
  /** Called when the slug is edited by hand, which stops it following the title. */
  onSlugEdited: () => void;
}

export function EditorSidebar({ form, errors, meta, wordCount, readingTime, onChange, onSlugEdited }: EditorSidebarProps) {
  return (
    <div className="flex flex-col gap-3">
      <SummaryPanel meta={meta} wordCount={wordCount} readingTime={readingTime} />
      <UrlPanel form={form} errors={errors} status={meta.status} onChange={onChange} onSlugEdited={onSlugEdited} />
      <CoverPanel form={form} onChange={onChange} />
      <PeoplePanel form={form} onChange={onChange} />
      <AudiencePanel form={form} errors={errors} onChange={onChange} />
      <SeoPanel form={form} errors={errors} onChange={onChange} />
      <Panel title="Options">
        <Switch
          id="featured"
          checked={form.featured}
          onChange={(featured) => onChange({ featured })}
          label="Featured post"
          description="Highlighted at the top of the blog."
        />
      </Panel>
    </div>
  );
}

// ── Summary ─────────────────────────────────────────────────────────────

function SummaryPanel({ meta, wordCount, readingTime }: { meta: EditorMeta; wordCount: number; readingTime: number }) {
  const rows: [string, React.ReactNode][] = [
    ["Status", <PostStatusChip key="status" status={meta.status} />],
    ["Published", meta.publishedAt ? formatDateTime(meta.publishedAt) : "Never"],
    ["Last saved", meta.updatedAt ? formatDateTime(meta.updatedAt) : "Not saved yet"],
    ["Length", `${pluralize(wordCount, "word")} · ${readingTime} min read`],
  ];
  return (
    <Panel title="Summary">
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-[12.5px]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted">{label}</dt>
            <dd className="text-right">{value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

// ── URL & excerpt ───────────────────────────────────────────────────────

function UrlPanel({
  form,
  errors,
  status,
  onChange,
  onSlugEdited,
}: {
  form: EditorForm;
  errors: FormErrors;
  status: PostStatus;
  onChange: (patch: Partial<EditorForm>) => void;
  onSlugEdited: () => void;
}) {
  const fromTitle = slugify(form.title);
  return (
    <Panel title="URL & excerpt" bodyClassName="flex flex-col gap-4">
      <Field
        label="Slug"
        htmlFor="slug"
        error={errors.slug}
        hint={status === "PUBLISHED" ? "Changing the slug of a published post breaks existing links to it." : undefined}
      >
        <div className="flex gap-1.5">
          <div className="input flex items-center gap-0 !p-0 focus-within:border-ink focus-within:shadow-[var(--focus-ring)]">
            <span className="shrink-0 pl-2.5 font-mono text-[11.5px] text-muted">/blog/</span>
            <input
              id="slug"
              value={form.slug}
              onChange={(e) => {
                onSlugEdited();
                onChange({ slug: e.target.value.toLowerCase().replace(/\s+/g, "-") });
              }}
              placeholder={fromTitle || "post-url"}
              aria-invalid={Boolean(errors.slug)}
              className="min-w-0 flex-1 bg-transparent py-[7px] pr-2.5 font-mono text-[12px] outline-none"
            />
          </div>
          <button
            type="button"
            title="Generate from title"
            aria-label="Generate slug from title"
            disabled={!fromTitle || fromTitle === form.slug}
            onClick={() => {
              onSlugEdited();
              onChange({ slug: fromTitle });
            }}
            className="flex w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-line text-muted hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </Field>

      <Field
        label="Excerpt"
        htmlFor="excerpt"
        error={errors.excerpt}
        count={{ current: form.excerpt.length, max: POST_LIMITS.excerpt }}
        hint="Shown on post cards and used as the meta description if you leave that empty."
      >
        <textarea
          id="excerpt"
          rows={4}
          value={form.excerpt}
          onChange={(e) => onChange({ excerpt: e.target.value })}
          placeholder="A one- or two-sentence summary of the post."
          aria-invalid={Boolean(errors.excerpt)}
          className="input"
        />
      </Field>
    </Panel>
  );
}

// ── Cover image ─────────────────────────────────────────────────────────

function CoverPanel({ form, onChange }: { form: EditorForm; onChange: (patch: Partial<EditorForm>) => void }) {
  const [picking, setPicking] = useState(false);
  return (
    <Panel title="Cover image" bodyClassName="flex flex-col gap-3">
      {form.cover ? (
        <div className="group relative overflow-hidden rounded-md border border-line">
          <img src={form.cover.url} alt={form.coverImageAlt || form.cover.altText} className="aspect-[1200/630] w-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1.5 bg-gradient-to-t from-[rgba(3,3,3,0.55)] to-transparent p-2 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
            <button type="button" className="btn btn-sm bg-card text-ink hover:bg-hover" onClick={() => setPicking(true)}>
              Change
            </button>
            <button
              type="button"
              aria-label="Remove cover image"
              className="btn btn-sm bg-card text-error-text hover:bg-hover"
              onClick={() => onChange({ cover: null, coverImageAlt: "" })}
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="flex aspect-[1200/630] w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border-[1.5px] border-dashed border-line text-muted transition-colors hover:border-line-strong hover:bg-subtle hover:text-ink"
        >
          <ImagePlus size={18} aria-hidden />
          <span className="text-[12px] font-semibold">Add a cover image</span>
          <span className="text-[11px]">1200 × 630 works best for social sharing</span>
        </button>
      )}

      {form.cover && (
        <Field label="Alt text" htmlFor="cover-alt" hint="Describe the image for screen readers. Leave empty to use the library's alt text.">
          <input
            id="cover-alt"
            className="input"
            value={form.coverImageAlt}
            onChange={(e) => onChange({ coverImageAlt: e.target.value })}
            placeholder={form.cover.altText || "What does the image show?"}
          />
        </Field>
      )}

      {picking && (
        <MediaPickerModal
          title="Choose a cover image"
          onClose={() => setPicking(false)}
          onSelect={(media) => onChange({ cover: { id: media.id, url: media.url, altText: media.altText } })}
        />
      )}
    </Panel>
  );
}

// ── Authors & tags ──────────────────────────────────────────────────────

function PeoplePanel({ form, onChange }: { form: EditorForm; onChange: (patch: Partial<EditorForm>) => void }) {
  const toast = useToast();
  const authors = useAsync(listAuthors, []);
  const tags = useAsync(listTags, []);

  const authorById = new Map((authors.data ?? []).map((a) => [a.id, a]));

  return (
    <Panel title="Authors & tags" bodyClassName="flex flex-col gap-4">
      <Field label="Authors" htmlFor="authors">
        <MultiSelect
          id="authors"
          placeholder="Add authors…"
          options={(authors.data ?? []).map((a) => ({ id: a.id, label: a.name }))}
          value={form.authorIds}
          onChange={(authorIds) => onChange({ authorIds })}
          renderChipPrefix={(option) => <Avatar name={option.label} image={authorById.get(option.id)?.avatar} size={16} />}
          onCreate={async (name) => {
            try {
              const author = await createAuthor({ name, slug: slugify(name), bio: "", avatarId: null });
              authors.reload();
              toast.success(`Added author “${author.name}”.`);
              return { id: author.id, label: author.name };
            } catch (error) {
              toast.error((error as Error).message);
              throw error;
            }
          }}
        />
      </Field>
      <Field label="Tags" htmlFor="tags">
        <MultiSelect
          id="tags"
          placeholder="Add tags…"
          options={(tags.data ?? []).map((t) => ({ id: t.id, label: t.name }))}
          value={form.tagIds}
          onChange={(tagIds) => onChange({ tagIds })}
          onCreate={async (name) => {
            try {
              const tag = await createTag({ name, slug: slugify(name) });
              tags.reload();
              return { id: tag.id, label: tag.name };
            } catch (error) {
              toast.error((error as Error).message);
              throw error;
            }
          }}
        />
      </Field>
    </Panel>
  );
}

// ── Audience ─────────────────────────────────────────────────────────────────

function AudiencePanel({ form, errors, onChange }: { form: EditorForm; errors: FormErrors; onChange: (patch: Partial<EditorForm>) => void }) {
  const audiences = useAsync(listAudiences, []);
  const options = (audiences.data ?? []).map((a) => ({ id: a.id, label: a.name }));

  return (
    <Panel title="Audience" bodyClassName="flex flex-col gap-4">
      <p className="text-[12px] text-secondary">Choose who this post is written for. Manage labels in Audiences.</p>
      {audiences.error ? (
        <ErrorState title="Couldn't load audiences" error={audiences.error} onRetry={audiences.reload} />
      ) : audiences.loading && !audiences.data ? (
        <p role="status" className="text-[12px] text-muted">Loading audiences...</p>
      ) : (
        <>
          <Field label="Primary audience" htmlFor="primary-audiences" count={{ current: form.primaryAudienceIds.length, max: 30 }} error={errors.primaryAudienceIds} hint="The main groups this post targets.">
            <MultiSelect
              id="primary-audiences"
              placeholder="Choose primary audiences..."
              options={options.filter((a) => form.primaryAudienceIds.includes(a.id) || !form.secondaryAudienceIds.includes(a.id))}
              value={form.primaryAudienceIds}
              onChange={(primaryAudienceIds) => onChange({ primaryAudienceIds })}
            />
          </Field>
          <Field label="Secondary audience" htmlFor="secondary-audiences" count={{ current: form.secondaryAudienceIds.length, max: 30 }} error={errors.secondaryAudienceIds} hint="Other groups this post is relevant to.">
            <MultiSelect
              id="secondary-audiences"
              placeholder="Choose secondary audiences..."
              options={options.filter((a) => form.secondaryAudienceIds.includes(a.id) || !form.primaryAudienceIds.includes(a.id))}
              value={form.secondaryAudienceIds}
              onChange={(secondaryAudienceIds) => onChange({ secondaryAudienceIds })}
            />
          </Field>
          {audiences.data?.length === 0 && <p className="text-[12px] text-muted">Create audience labels in Audiences to select them here.</p>}
        </>
      )}
    </Panel>
  );
}

function SeoPanel({ form, errors, onChange }: { form: EditorForm; errors: FormErrors; onChange: (patch: Partial<EditorForm>) => void }) {
  const title = form.seoTitle || form.title || "Untitled post";
  const description = form.metaDescription || form.excerpt || "Add an excerpt or meta description to control this text.";
  const keyword = form.focusKeyword.trim().toLowerCase();

  const checks = [
    { ok: title.length > 0 && title.length <= POST_LIMITS.seoTitle, label: `Title is ${POST_LIMITS.seoTitle} characters or fewer` },
    {
      ok: (form.metaDescription || form.excerpt).length >= 50 && (form.metaDescription || form.excerpt).length <= POST_LIMITS.metaDescription,
      label: `Description is 50–${POST_LIMITS.metaDescription} characters`,
    },
    ...(keyword
      ? [
          { ok: title.toLowerCase().includes(keyword), label: "Focus keyword appears in the title" },
          { ok: description.toLowerCase().includes(keyword), label: "Focus keyword appears in the description" },
        ]
      : []),
  ];

  return (
    <Panel title="SEO" bodyClassName="flex flex-col gap-4">
      <div className="rounded-md border border-line bg-input p-3" aria-label="Search result preview">
        <div className="truncate text-[11.5px] text-secondary">
          {PREVIEW_HOST} › blog › {form.slug || "post-url"}
        </div>
        <div className="mt-0.5 line-clamp-1 text-[15px] leading-snug text-[var(--search-preview-link)]">{title}</div>
        <div className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-secondary">{description}</div>
      </div>

      <ul className="flex flex-col gap-1">
        {checks.map((check) => (
          <li key={check.label} className={cn("flex items-center gap-1.5 text-[11.5px]", check.ok ? "text-success" : "text-muted")}>
            {check.ok ? <Check size={12} aria-hidden /> : <CircleAlert size={12} aria-hidden />}
            <span className={check.ok ? "text-secondary" : undefined}>{check.label}</span>
          </li>
        ))}
      </ul>

      <Field label="SEO title" htmlFor="seo-title" error={errors.seoTitle} count={{ current: form.seoTitle.length, max: POST_LIMITS.seoTitle }}>
        <input
          id="seo-title"
          className="input"
          value={form.seoTitle}
          onChange={(e) => onChange({ seoTitle: e.target.value })}
          placeholder={form.title || "Defaults to the post title"}
          aria-invalid={Boolean(errors.seoTitle)}
        />
      </Field>
      <Field
        label="Meta description"
        htmlFor="meta-description"
        error={errors.metaDescription}
        count={{ current: form.metaDescription.length, max: POST_LIMITS.metaDescription }}
      >
        <textarea
          id="meta-description"
          rows={3}
          className="input"
          value={form.metaDescription}
          onChange={(e) => onChange({ metaDescription: e.target.value })}
          placeholder={form.excerpt || "Defaults to the excerpt"}
          aria-invalid={Boolean(errors.metaDescription)}
        />
      </Field>
      <Field label="Focus keyword" htmlFor="focus-keyword" hint="The search phrase this post should rank for.">
        <input
          id="focus-keyword"
          className="input"
          value={form.focusKeyword}
          maxLength={POST_LIMITS.focusKeyword}
          onChange={(e) => onChange({ focusKeyword: e.target.value })}
          placeholder="e.g. kubernetes rightsizing"
        />
      </Field>
      <Field
        label="Canonical URL"
        htmlFor="canonical-url"
        error={errors.canonicalUrl}
        hint="Set only if this post was first published on another site."
      >
        <input
          id="canonical-url"
          className="input"
          value={form.canonicalUrl}
          onChange={(e) => onChange({ canonicalUrl: e.target.value })}
          placeholder="https://"
          aria-invalid={Boolean(errors.canonicalUrl)}
        />
      </Field>
    </Panel>
  );
}
