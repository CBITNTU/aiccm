"use client";

import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ProjectsHeaderProps {
  companyId?: string | null;
}

export function ProjectsHeader({ companyId }: ProjectsHeaderProps) {
  const router = useRouter();

  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-bold">Projects</h1>
        <p className="text-muted-foreground mt-1">
          Build teams and bid on tenders together
        </p>
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
