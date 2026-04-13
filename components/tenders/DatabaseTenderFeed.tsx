"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, FileText, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { TenderCard } from "./TenderCard";
import { ResultsHeader } from "./ResultsHeader";
import { useTenders } from "@/hooks/useTenders";
import type { TenderRecord } from "@/lib/api/types";

interface TenderFilters {
  keyword?: string;
  location?: string;
  status?: string;
  source?: string;
  budgetMin?: number;
  budgetMax?: number;
  dateFrom?: string;
  dateTo?: string;
  selectedTaxonomies?: string[];
  sortBy?: string;
  sortDirection?: string;
}

interface DatabaseTenderFeedProps {
  filters?: TenderFilters;
  onCreateProject?: (tenderId: string) => void;
  readOnly?: boolean;
}

export function DatabaseTenderFeed({
  filters = {},
  onCreateProject: _onCreateProject,
  readOnly: _readOnly = false,
}: DatabaseTenderFeedProps) {
  const t = useTranslations("DatabaseTenderFeed");
  const router = useRouter();
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  // Reset to page 1 when filters change (async to satisfy set-state-in-effect)
  useEffect(() => {
    queueMicrotask(() => setCurrentPage(1));
  }, [filters]);

  const { data, isLoading: loading, refetch } = useTenders({
    keyword: filters.keyword,
    location: filters.location,
    status: filters.status,
    source: filters.source,
    budgetMin: filters.budgetMin,
    budgetMax: filters.budgetMax,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    taxonomyIds: filters.selectedTaxonomies,
    sortBy: filters.sortBy,
    sortDirection: filters.sortDirection,
    page: currentPage,
    pageSize: itemsPerPage,
  });

  const tenders = (data?.tenders as TenderRecord[]) ?? [];
  const totalCount = data?.totalCount ?? 0;
  const tenderTaxonomies = data?.taxonomies ?? {};

  const handleRefresh = () => {
    refetch();
  };

  const goToPage = (page: number) => {
    setCurrentPage(page);
  };

  const totalPages = Math.ceil(totalCount / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalCount);

  return (
    <div className="space-y-4">
      {/* Results Header */}
      {!loading && totalCount > 0 && (
        <ResultsHeader
          total={totalCount}
          start={startIndex + 1}
          end={endIndex}
          currentPage={currentPage}
          totalPages={totalPages}
          loading={loading}
          onRefresh={handleRefresh}
        />
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">{t("loading")}</span>
        </div>
      ) : tenders.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">
            {t("noResults")}
          </p>
        </div>
      ) : (
        <>
          {/* Tender cards */}
          <div className="space-y-3">
            {tenders.map((tender) => (
              <div key={tender.id} className="list-item-deferred">
                <TenderCard
                tender={tender}
                taxonomies={tenderTaxonomies[tender.id]}
                onClick={() => router.push(`/tenders/${tender.id}`)}
              />
              </div>
            ))}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1 || loading}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                {t("previous")}
              </Button>

              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                  (page) => {
                    // Show first page, last page, current page, and pages around current
                    if (
                      page === 1 ||
                      page === totalPages ||
                      (page >= currentPage - 1 && page <= currentPage + 1)
                    ) {
                      return (
                        <Button
                          key={page}
                          variant={page === currentPage ? "default" : "outline"}
                          size="sm"
                          onClick={() => goToPage(page)}
                          disabled={loading}
                          className="min-w-[40px]"
                        >
                          {page}
                        </Button>
                      );
                    } else if (
                      page === currentPage - 2 ||
                      page === currentPage + 2
                    ) {
                      return (
                        <span key={page} className="px-2 text-muted-foreground">
                          ...
                        </span>
                      );
                    }
                    return null;
                  },
                )}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages || loading}
              >
                {t("next")}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </>
      )}

    </div>
  );
}
