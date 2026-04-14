"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ProjectsHeaderProps {
  companyId?: string | null;
}

export function ProjectsHeader({ companyId }: ProjectsHeaderProps) {
  const router = useRouter();
  const t = useTranslations("ProjectsHeader");

  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground mt-1">{t("subtitle")}</p>
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
        {t("newProject")}
      </Button>
    </div>
  );
}
