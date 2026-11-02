import { EMPTY_DOC } from "@/lib/content";
import { SLUG_PATTERN, slugify } from "@/lib/slug";
import type { ContentDoc } from "@/types/content";
import type { MarkdownSourceRef } from "@/types/markdown";
import type { MediaRef } from "@/types/media";
import { POST_LIMITS, type Post, type PostInput } from "@/types/post";

/** Everything the editor lets you change. Like PostInput, but keeps the cover's URL for the preview. */
export interface EditorForm {
  title: string;
  slug: string;
  excerpt: string;
  content: ContentDoc;
  cover: MediaRef | null;
  coverImageAlt: string;
  markdownSource: MarkdownSourceRef | null;
  seoTitle: string;
  metaDescription: string;
  focusKeyword: string;
  canonicalUrl: string;
  featured: boolean;
  authorIds: string[];
  tagIds: string[];
  primaryAudienceIds: string[];
  secondaryAudienceIds: string[];
}

export type FormErrors = Partial<Record<keyof EditorForm, string>>;

export const EMPTY_FORM: EditorForm = {
  title: "",
  slug: "",
  excerpt: "",
  content: EMPTY_DOC,
  cover: null,
  coverImageAlt: "",
  markdownSource: null,
  seoTitle: "",
  metaDescription: "",
  focusKeyword: "",
  canonicalUrl: "",
  featured: false,
  authorIds: [],
  tagIds: [],
  primaryAudienceIds: [],
  secondaryAudienceIds: [],
};

export function formFromPost(post: Post): EditorForm {
  return {
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    content: post.content,
    cover: post.coverImage,
    coverImageAlt: post.coverImageAlt,
    markdownSource: post.markdownSource,
    seoTitle: post.seoTitle,
    metaDescription: post.metaDescription,
    focusKeyword: post.focusKeyword,
    canonicalUrl: post.canonicalUrl,
    featured: post.featured,
    authorIds: post.authors.map((a) => a.id),
    tagIds: post.tags.map((t) => t.id),
    primaryAudienceIds: (post.primaryAudiences ?? []).map((a) => a.id),
    secondaryAudienceIds: (post.secondaryAudiences ?? []).map((a) => a.id),
  };
}

/**
 * The form as a string, used to check for unsaved changes. Object keys are sorted
 * first, because Postgres JSONB stores the body with its keys in a different order
 * from the one Tiptap uses. Without sorting, unchanged content would look changed.
 * Arrays keep their order, since it matters.
 */
export function snapshotOf(form: EditorForm): string {
  return JSON.stringify(withSortedKeys(form));
}

function withSortedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withSortedKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, withSortedKeys(child)]),
    );
  }
  return value;
}

/** A post saved before it has a title still needs a slug. */
function fallbackSlug(title: string): string {
  return slugify(title) || `draft-${Date.now().toString(36)}`;
}

export function inputFromForm(form: EditorForm): PostInput {
  return {
    title: form.title,
    slug: form.slug || fallbackSlug(form.title),
    excerpt: form.excerpt,
    content: form.content,
    coverImageId: form.cover?.id ?? null,
    coverImageAlt: form.coverImageAlt,
    markdownSourceId: form.markdownSource?.id ?? null,
    seoTitle: form.seoTitle,
    metaDescription: form.metaDescription,
    focusKeyword: form.focusKeyword,
    canonicalUrl: form.canonicalUrl,
    featured: form.featured,
    authorIds: form.authorIds,
    tagIds: form.tagIds,
    primaryAudienceIds: form.primaryAudienceIds,
    secondaryAudienceIds: form.secondaryAudienceIds,
  };
}

/**
 * The form once a save lands. Typing carries on while the request is in flight, so
 * `current` (what's on screen now) wins over `sent` (what was saved).
 */
export function formAfterSave(current: EditorForm, sent: EditorForm, savedSlug: string): EditorForm {
  return current.slug === sent.slug ? { ...current, slug: savedSlug } : current;
}

/** Client-side checks run before saving; the API repeats them. */
export function validateForm(form: EditorForm): FormErrors {
  const errors: FormErrors = {};
  if (form.primaryAudienceIds.length > 30) errors.primaryAudienceIds = "Choose at most 30 primary audiences.";
  if (form.secondaryAudienceIds.length > 30) errors.secondaryAudienceIds = "Choose at most 30 secondary audiences.";
  if (form.primaryAudienceIds.some((id) => form.secondaryAudienceIds.includes(id)))
    errors.secondaryAudienceIds = [errors.secondaryAudienceIds, "An audience can only belong to one group per post."].filter(Boolean).join(" ");
  if (form.title.length > POST_LIMITS.title) errors.title = `Keep the title under ${POST_LIMITS.title} characters.`;
  if (form.slug && !SLUG_PATTERN.test(form.slug)) errors.slug = "Use lowercase letters, numbers and single hyphens only.";
  if (form.excerpt.length > POST_LIMITS.excerpt) errors.excerpt = `Keep the excerpt under ${POST_LIMITS.excerpt} characters.`;
  if (form.seoTitle.length > POST_LIMITS.seoTitle) errors.seoTitle = `Search engines cut titles after ~${POST_LIMITS.seoTitle} characters.`;
  if (form.metaDescription.length > POST_LIMITS.metaDescription)
    errors.metaDescription = `Search engines cut descriptions after ~${POST_LIMITS.metaDescription} characters.`;
  if (form.canonicalUrl && !/^https?:\/\/\S+$/.test(form.canonicalUrl)) errors.canonicalUrl = "Must start with http:// or https://.";
  return errors;
}
