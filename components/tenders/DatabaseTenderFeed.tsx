"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { ChevronLeft, ChevronRight, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TenderCard } from "./TenderCard";
import { ResultsHeader } from "./ResultsHeader";
import { toast } from "sonner";

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
}

interface DatabaseTenderFeedProps {
  supabase: SupabaseClient<Database>;
  filters?: TenderFilters;
  onCreateProject?: (tenderId: string) => void;
  readOnly?: boolean;
}

export function DatabaseTenderFeed({
  supabase,
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
      // Calculate pagination
      const startIndex = (page - 1) * itemsPerPage;
      const endIndex = startIndex + itemsPerPage - 1;

      let query = supabase
        .from("tenders")
        .select("*", { count: "exact" })
        .neq("status", "closed")
        .order("deadline", { ascending: false });

      // Apply keyword filter from filters
      if (filters.keyword && filters.keyword.trim()) {
        query = query.or(
          `title.ilike.%${filters.keyword}%,description.ilike.%${filters.keyword}%,buyer.ilike.%${filters.keyword}%,location.ilike.%${filters.keyword}%`,
        );
      }

      // Apply external filters
      if (filters.location) {
        query = query.ilike("location", `%${filters.location}%`);
      }

      if (filters.status) {
        query = query.eq("status", filters.status);
      }

      if (filters.budgetMin) {
        query = query.gte("budget_min", filters.budgetMin);
      }

      if (filters.budgetMax) {
        query = query.lte("budget_max", filters.budgetMax);
      }

      if (filters.dateFrom) {
        query = query.gte("publication_date", filters.dateFrom);
      }

      if (filters.dateTo) {
        query = query.lte("publication_date", filters.dateTo);
      }

      // Apply taxonomy filters (multi-select)
      if (filters.selectedTaxonomies && filters.selectedTaxonomies.length > 0) {
        const { data: tenderIds, error: taxonomyError } = await supabase
          .from("tender_taxonomies")
          .select("tender_id")
          .in("taxonomy_id", filters.selectedTaxonomies);

        if (taxonomyError) {
          console.error("Error fetching taxonomy tenders:", taxonomyError);
        } else if (tenderIds && tenderIds.length > 0) {
          const ids = [...new Set(tenderIds.map((t) => t.tender_id))];
          query = query.in("id", ids);
        } else {
          setTenders([]);
          setTotalCount(0);
          setLoading(false);
          return;
        }
      }

      // Apply pagination
      query = query.range(startIndex, endIndex);

      const { data, error, count } = await query;

      if (error) {
        console.error("Error fetching tenders:", error);
        throw error;
      }

      setTenders((data as DatabaseTender[]) || []);
      setTotalCount(count || 0);

      // Fetch taxonomies for the tenders
      if (data && data.length > 0) {
        const tenderIds = data.map((t) => t.id);
        const { data: taxData } = await supabase
          .from("tender_taxonomies")
          .select("tender_id, taxonomy_id, taxonomies(id, name)")
          .in("tender_id", tenderIds);

        if (taxData) {
          const taxMap: Record<
            string,
            Array<{ id: string; name: string }>
          > = {};
          taxData.forEach((tt) => {
            if (!taxMap[tt.tender_id]) taxMap[tt.tender_id] = [];
            const tax = tt.taxonomies as { id: string; name: string } | null;
            if (tax?.name) {
              taxMap[tt.tender_id].push({ id: tax.id, name: tax.name });
            }
          });
          setTenderTaxonomies(taxMap);
        }
      }
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

  // Fetch tenders when filters, page, or supabase changes
  useEffect(() => {
    if (!supabase) return;
    fetchDatabaseTenders(currentPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, currentPage, supabase]);

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
