"use client";

import { UsersRound } from "lucide-react";
import { TaxonomyCanvas } from "@/components/TaxonomyCanvas";
import { createAudience, deleteAudience, listAudiences, updateAudience } from "./api";

export function AudiencesCanvas() {
  return (
    <TaxonomyCanvas
      singular="audience"
      plural="audiences"
      title="Audiences"
      description="Groups of people your posts are written for."
      emptyDescription="Create reusable audience labels for the post editor."
      icon={UsersRound}
      nameMaxLength={100}
      slugMaxLength={120}
      slugHint="Follows the name unless you customize it."
      list={listAudiences}
      create={createAudience}
      update={updateAudience}
      remove={deleteAudience}
    />
  );
}
