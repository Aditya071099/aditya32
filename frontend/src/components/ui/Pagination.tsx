import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PageMeta } from "@/types/api";
import { IconButton } from "./IconButton";

export interface PaginationProps {
  meta: PageMeta;
  onPageChange: (page: number) => void;
  noun?: string;
}

export function Pagination({ meta, onPageChange, noun = "items" }: PaginationProps) {
  const totalPages = Math.max(0, meta.totalPages);
  const page = totalPages === 0 ? 0 : Math.min(Math.max(meta.page, 0), totalPages - 1);
  const first = meta.totalElements === 0 ? 0 : page * meta.size + 1;
  const last = Math.min((page + 1) * meta.size, meta.totalElements);
  return (
    <div className="flex items-center justify-between gap-3 text-[12px] text-muted">
      <span className="tabular-nums">
        {first}–{last} of {meta.totalElements} {noun}
      </span>
      <div className="flex items-center gap-1">
        <IconButton icon={ChevronLeft} label="Previous page" disabled={page === 0} onClick={() => onPageChange(page - 1)} />
        <span className="px-1 font-mono text-[11px] tabular-nums">
          {totalPages === 0 ? 0 : page + 1} / {totalPages}
        </span>
        <IconButton
          icon={ChevronRight}
          label="Next page"
          disabled={totalPages === 0 || page >= totalPages - 1}
          onClick={() => onPageChange(page + 1)}
        />
      </div>
    </div>
  );
}
