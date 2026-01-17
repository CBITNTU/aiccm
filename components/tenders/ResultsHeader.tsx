"use client";

import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

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
  return (
    <div className="flex items-center justify-between py-3 mb-4">
      <div className="flex items-center gap-4">
        <p className="text-sm text-muted-foreground">
          Showing{" "}
          <span className="font-medium text-foreground">
            {start}-{end}
          </span>{" "}
          of <span className="font-medium text-foreground">{total}</span> tenders
        </p>
        {currentPage && totalPages && totalPages > 1 && (
          <p className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
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
          Refresh
        </Button>
      )}
    </div>
  );
}
