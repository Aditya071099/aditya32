"use client";

import { Fragment } from "react";
import { ChevronRight, PanelLeft } from "lucide-react";
import { GuardedLink } from "./NavigationGuard";

export interface Crumb {
  label: string;
  href?: string;
}

/** Breadcrumb for the current path. Pure function of the pathname. */
export function resolveBreadcrumb(pathname: string): Crumb[] {
  const [section, sub] = pathname.split("/").filter(Boolean);
  const sections: Record<string, string> = { posts: "Posts", authors: "Authors", tags: "Tags", audiences: "Audiences", media: "Media" };
  const root: Crumb = { label: sections[section] ?? "Home", href: `/${section ?? ""}` };
  if (section === "posts" && sub) return [root, { label: sub === "new" ? "New post" : "Edit post" }];
  return [root];
}

export interface TopBarProps {
  breadcrumb: Crumb[];
  onToggleSidebar: () => void;
}

export function TopBar({ breadcrumb, onToggleSidebar }: TopBarProps) {
  return (
    <div className="flex h-[var(--shell-topbar-h)] shrink-0 items-center gap-2.5 border-b-[1.5px] border-line bg-page px-[var(--page-pad)]">
      <button
        type="button"
        onClick={onToggleSidebar}
        title="Toggle sidebar"
        aria-label="Toggle sidebar"
        className="flex h-[26px] w-[26px] shrink-0 cursor-pointer items-center justify-center rounded-sm border border-line text-muted hover:bg-hover hover:text-ink"
      >
        <PanelLeft size={13} />
      </button>

      <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1.5 text-[12px]">
        {breadcrumb.map((crumb, i) => {
          const isLast = i === breadcrumb.length - 1;
          return (
            <Fragment key={crumb.label}>
              {i > 0 && <ChevronRight size={11} className="text-[var(--atomity-gray-400)]" aria-hidden />}
              {isLast || !crumb.href ? (
                <span aria-current={isLast ? "page" : undefined} className={isLast ? "font-bold" : "font-medium"}>
                  {crumb.label}
                </span>
              ) : (
                <GuardedLink href={crumb.href} className="font-medium text-secondary hover:text-ink">
                  {crumb.label}
                </GuardedLink>
              )}
            </Fragment>
          );
        })}
      </nav>
    </div>
  );
}
