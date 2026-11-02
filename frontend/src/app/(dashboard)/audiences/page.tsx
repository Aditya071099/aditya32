import type { Metadata } from "next";
import { AudiencesCanvas } from "@/modules/audiences/AudiencesCanvas";

export const metadata: Metadata = { title: "Audiences · Blog CMS" };

export default function AudiencesPage() {
  return <AudiencesCanvas />;
}
