"use client";

import { redirect } from "next/navigation";

/** Legacy route — matches live on the Tenders tab now. */
export default function MatchesPage() {
  redirect("/tenders?tab=matches");
}
