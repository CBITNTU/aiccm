"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { CompanyDetailView } from "@/components/directory/CompanyDetailView";
import { useDirectoryCompany } from "@/hooks/useDirectoryCompany";
import { useTranslations } from "next-intl";

export default function DirectoryCompanyPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const t = useTranslations("CompanyPage");
  const { companyId } = use(params);
  const router = useRouter();
  const { data, isLoading, error } = useDirectoryCompany(companyId);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/directory")}
          className="mb-6 -ml-2"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          {t("backToDirectory")}
        </Button>

        {isLoading && <DirectoryCompanyPageSkeleton />}

        {error && (
          <div className="text-center py-16">
            <p className="text-muted-foreground mb-4">
              {t("failedToLoad")}
            </p>
            <Button variant="outline" onClick={() => router.push("/directory")}>
              {t("backToDirectory")}
            </Button>
          </div>
        )}

        {data && (
          <CompanyDetailView
            company={data.company}
            isOwner={data.isOwner}
            capabilities={data.capabilities}
            markets={data.markets}
            standards={data.standards}
          />
        )}
      </main>
    </div>
  );
}

function Sk({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-muted ${className ?? ""}`}
    />
  );
}

function DirectoryCompanyPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <Sk className="h-8 w-64" />
        <Sk className="h-6 w-24" />
      </div>
      <Sk className="h-4 w-full max-w-2xl" />
      <Sk className="h-4 w-3/4 max-w-xl" />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Sk key={i} className="h-9" />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <div className="space-y-3">
          <Sk className="h-6 w-40" />
          <Sk className="h-4 w-32" />
          <Sk className="h-4 w-48" />
        </div>
        <div className="space-y-3">
          <Sk className="h-6 w-40" />
          <Sk className="h-16" />
          <Sk className="h-16" />
        </div>
        <div className="space-y-3">
          <Sk className="h-6 w-40" />
          <Sk className="h-[280px]" />
        </div>
      </div>
    </div>
  );
}
