"use client";

import { useRouter } from "next/navigation";
import { FolderKanban, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ProjectsHeaderProps {
  companyId?: string | null;
}

export function ProjectsHeader({ companyId }: ProjectsHeaderProps) {
  const router = useRouter();

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <FolderKanban className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground">
            Build teams and bid on tenders together
          </p>
        </div>
      </div>
      <Button
        onClick={() => {
          if (companyId) {
            router.push(`/projects/new?companyId=${companyId}`);
          }
        }}
        disabled={!companyId}
      >
        <Plus className="h-4 w-4 mr-2" />
        New Project
      </Button>
    </div>
  );
}
