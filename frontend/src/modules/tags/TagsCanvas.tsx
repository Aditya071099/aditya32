"use client";

import { Tag } from "lucide-react";
import { TaxonomyCanvas } from "@/components/TaxonomyCanvas";
import { createTag, deleteTag, listTags, updateTag } from "./api";

export function TagsCanvas() {
  return (
    <TaxonomyCanvas
      singular="tag"
      plural="tags"
      title="Tags"
      description="Topics used to group and filter posts."
      emptyDescription="Create tags here or straight from the post editor."
      icon={Tag}
      nameMaxLength={60}
      slugMaxLength={80}
      slugHint="Used in tag page URLs."
      list={listTags}
      create={createTag}
      update={updateTag}
      remove={deleteTag}
    />
  );
}
