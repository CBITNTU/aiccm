"use client";

import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";

interface DirectoryResultsHeaderProps {
  total: number;
  start: number;
  end: number;
  currentPage?: number;
  totalPages?: number;
  loading?: boolean;
  onRefresh?: () => void;
}

export function DirectoryResultsHeader({
  total,
  start,
  end,
  currentPage,
  totalPages,
  loading,
  onRefresh,
}: DirectoryResultsHeaderProps) {
  const t = useTranslations("Directory");

  if (total === 0) {
    return null;
  }

  return (
    <div className="flex items-center justify-between py-3 mb-4">
      <div className="flex items-center gap-4">
        <p className="text-sm text-muted-foreground">
          {t("resultsHeader.showing")}{" "}
          <span className="font-medium text-foreground">
            {start}-{end}
          </span>{" "}
          {t("resultsHeader.of")}{" "}
          <span className="font-medium text-foreground">{total}</span>{" "}
          {t("resultsHeader.companies")}
        </p>
        {currentPage && totalPages && totalPages > 1 && (
          <p className="text-sm text-muted-foreground">
            {t("resultsHeader.page")} {currentPage} {t("resultsHeader.of")} {totalPages}
          </p>
        )}
      </div>
      {onRefresh && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={loading}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {t("resultsHeader.refresh")}
        </Button>
      )}
    </div>
  );
}
