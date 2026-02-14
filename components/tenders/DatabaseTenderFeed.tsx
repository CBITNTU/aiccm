"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TenderCard } from "./TenderCard";
import { ResultsHeader } from "./ResultsHeader";
import { toast } from "sonner";
import { api } from "@/lib/api/client";

interface DatabaseTender {
  id: string;
  title: string;
  description: string;
  buyer: string;
  location: string;
  status: string;
  publication_date: string;
  deadline: string;
  budget_min: number;
  budget_max: number;
  reference_number: string;
  cpv_codes: string[];
}

interface TenderFilters {
  keyword?: string;
  location?: string;
  status?: string;
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
  const router = useRouter();
  const [tenders, setTenders] = useState<DatabaseTender[]>([]);
  const [loading, setLoading] = useState(false);
  const [tenderTaxonomies, setTenderTaxonomies] = useState<
    Record<string, Array<{ id: string; name: string }>>
  >({});
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const itemsPerPage = 25;

  const fetchDatabaseTenders = async (page = 1) => {
    setLoading(true);

    try {
      const result = await api.searchTenders({
        keyword: filters.keyword,
        location: filters.location,
        status: filters.status,
        budgetMin: filters.budgetMin,
        budgetMax: filters.budgetMax,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        taxonomyIds: filters.selectedTaxonomies,
        sortBy: filters.sortBy,
        sortDirection: filters.sortDirection,
        page,
        pageSize: itemsPerPage,
      });

      setTenders((result.tenders as unknown as DatabaseTender[]) || []);
      setTotalCount(result.totalCount || 0);
      setTenderTaxonomies(result.taxonomies || {});
    } catch (error) {
      console.error("Error fetching tenders:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to fetch tenders";

      toast.error("Error", {
        description: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchDatabaseTenders(currentPage);
  };

  const goToPage = (page: number) => {
    setCurrentPage(page);
  };

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  // Fetch tenders when filters or page changes
  useEffect(() => {
    fetchDatabaseTenders(currentPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, currentPage]);

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
          <span className="ml-2 text-muted-foreground">Loading tenders...</span>
        </div>
      ) : tenders.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">
            No tenders found matching your criteria
          </p>
        </div>
      ) : (
        <>
          {/* Tender cards */}
          <div className="space-y-3">
            {tenders.map((tender) => (
              <TenderCard
                key={tender.id}
                tender={tender}
                taxonomies={tenderTaxonomies[tender.id]}
                onClick={() => router.push(`/tenders/${tender.id}`)}
              />
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
                Previous
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
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </>
      )}

    </div>
  );
}
