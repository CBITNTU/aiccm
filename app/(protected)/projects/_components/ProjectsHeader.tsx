"use client";

import { FolderKanban } from "lucide-react";

export function ProjectsHeader() {
  return (
    <div className="flex items-center gap-3">
      <FolderKanban className="h-8 w-8 text-primary" />
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
        <p className="text-muted-foreground">
          Build teams and bid on tenders together
        </p>
      </div>
    </div>
  );
}
