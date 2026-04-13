"use client";

import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";

interface ResultsHeaderProps {
  total: number;
  start: number;
  end: number;
  currentPage?: number;
  totalPages?: number;
  loading?: boolean;
  onRefresh?: () => void;
}

export function ResultsHeader({
  total,
  start,
  end,
  currentPage,
  totalPages,
  loading,
  onRefresh,
}: ResultsHeaderProps) {
  const t = useTranslations("ResultsHeader");
  return (
    <div className="flex items-center justify-between py-3 mb-4">
      <div className="flex items-center gap-4">
        <p className="text-sm text-muted-foreground">
          {t("showing")}{" "}
          <span className="font-medium text-foreground">
            {start}-{end}
          </span>{" "}
          {t("of")} <span className="font-medium text-foreground">{total}</span>{" "}
          {t("tenders")}
        </p>
        {currentPage && totalPages && totalPages > 1 && (
          <p className="text-sm text-muted-foreground">
            {t("pageOf", { current: currentPage, total: totalPages })}
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
          {t("refresh")}
        </Button>
      )}
    </div>
  );
}
