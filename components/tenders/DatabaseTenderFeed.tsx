"use client";

import { useState, useEffect } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  RefreshCw,
  Search,
  Calendar,
  MapPin,
  PoundSterling,
  ExternalLink,
  Tag as TagIcon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TenderViewDialog } from "./TenderViewDialog";
import { formatCpvCode } from "@/lib/cpvCodes";
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
}

export function DatabaseTenderFeed({
  supabase,
  filters = {},
  onCreateProject,
}: DatabaseTenderFeedProps) {
  const [tenders, setTenders] = useState<DatabaseTender[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTender, setSelectedTender] = useState<DatabaseTender | null>(
    null
  );
  const [tenderTaxonomies, setTenderTaxonomies] = useState<
    Record<string, Array<{ id: string; name: string }>>
  >({});
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const itemsPerPage = 25;

  const fetchDatabaseTenders = async (search = "", page = 1) => {
    setLoading(true);

    try {
      // Calculate pagination
      const startIndex = (page - 1) * itemsPerPage;
      const endIndex = startIndex + itemsPerPage - 1;

      let query = supabase
        .from("tenders")
        .select("*", { count: 'exact' })
        .neq("status", "closed")
        .order("publication_date", { ascending: false });

      // Apply keyword filter from filters
      const keyword = filters.keyword || search;
      if (keyword.trim()) {
        query = query.or(
          `title.ilike.%${keyword}%,description.ilike.%${keyword}%,buyer.ilike.%${keyword}%,location.ilike.%${keyword}%`
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
          const taxMap: Record<string, Array<{ id: string; name: string }>> = {};
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

      if (
        search.trim() ||
        Object.keys(filters).some(
          (key) => filters[key as keyof TenderFilters]
        )
      ) {
        toast.success("Search Complete", {
          description: `Found ${data?.length || 0} matching tenders`,
        });
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

  const handleSearch = () => {
    setCurrentPage(1); // Reset to first page on new search
    fetchDatabaseTenders(searchTerm, 1);
  };

  const handleRefresh = () => {
    fetchDatabaseTenders(searchTerm, currentPage);
  };

  const goToPage = (page: number) => {
    setCurrentPage(page);
    // Don't fetch here - let useEffect handle it
  };

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  // Fetch tenders when filters, page, or supabase changes
  useEffect(() => {
    if (!supabase) return;
    fetchDatabaseTenders(searchTerm, currentPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, currentPage, supabase]);

  const formatBudget = (min?: number, max?: number) => {
    if (!min && !max) return "Budget not disclosed";
    if (min && max)
      return `£${min.toLocaleString()} - £${max.toLocaleString()}`;
    if (min) return `From £${min.toLocaleString()}`;
    if (max) return `Up to £${max.toLocaleString()}`;
    return "Budget not disclosed";
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const isDeadlineSoon = (deadline: string) => {
    const deadlineDate = new Date(deadline);
    const today = new Date();
    const daysUntilDeadline = Math.ceil(
      (deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysUntilDeadline <= 7 && daysUntilDeadline >= 0;
  };

  const totalPages = Math.ceil(totalCount / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage - 1, totalCount - 1);

  return (
    <div className="space-y-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span>All Database Tenders</span>
              <Badge variant="outline">{totalCount} open tenders</Badge>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={loading}
            >
              <RefreshCw
                className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </CardTitle>

          <div className="flex space-x-2">
            <Input
              type="text"
              placeholder="Search tenders..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="flex-1"
            />
            <Button onClick={handleSearch} disabled={loading}>
              <Search className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {/* Results Summary */}
          {!loading && totalCount > 0 && (
            <div className="mb-4 flex items-center justify-between text-sm text-muted-foreground">
              <p>
                Showing {startIndex + 1}-{endIndex + 1} of {totalCount} tenders
              </p>
              {totalPages > 1 && (
                <p>
                  Page {currentPage} of {totalPages}
                </p>
              )}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <span className="ml-2">Loading tenders...</span>
            </div>
          ) : tenders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No open tenders found in the database.
            </div>
          ) : (
            <div className="space-y-4">
              {tenders.map((tender) => (
                  <Card
                    key={tender.id}
                    className="border-l-4 border-l-primary/20 hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => setSelectedTender(tender)}
                  >
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-semibold text-lg text-primary">
                          {tender.title}
                        </h3>
                        <div className="flex space-x-2 ml-4">
                          {tender.deadline && isDeadlineSoon(tender.deadline) && (
                            <Badge variant="destructive">Deadline Soon</Badge>
                          )}
                          <Badge variant="secondary">{tender.status}</Badge>
                        </div>
                      </div>

                      <div className="text-sm text-muted-foreground mb-2">
                        {tender.reference_number && (
                          <>
                            <strong>Ref:</strong> {tender.reference_number} |
                          </>
                        )}
                        <strong> Buyer:</strong> {tender.buyer}
                      </div>

                      <p className="text-sm mb-3 line-clamp-3">
                        {tender.description}
                      </p>

                      {/* Taxonomies */}
                      {tenderTaxonomies[tender.id] &&
                        tenderTaxonomies[tender.id].length > 0 && (
                          <div className="mb-3">
                            <div className="flex items-center gap-2 mb-2">
                              <TagIcon className="w-3 h-3 text-muted-foreground" />
                              <span className="text-xs font-medium text-muted-foreground">
                                Categories:
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {tenderTaxonomies[tender.id].map((taxonomy) => (
                                <Badge
                                  key={taxonomy.id}
                                  variant="secondary"
                                  className="text-xs"
                                >
                                  {taxonomy.name}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                      <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                        <div className="flex items-center">
                          <MapPin className="w-4 h-4 mr-1 text-muted-foreground" />
                          {tender.location || "Location not specified"}
                        </div>
                        <div className="flex items-center">
                          <PoundSterling className="w-4 h-4 mr-1 text-muted-foreground" />
                          {formatBudget(tender.budget_min, tender.budget_max)}
                        </div>
                        <div className="flex items-center">
                          <Calendar className="w-4 h-4 mr-1 text-muted-foreground" />
                          Published: {formatDate(tender.publication_date)}
                        </div>
                        <div className="flex items-center">
                          <Calendar className="w-4 h-4 mr-1 text-muted-foreground" />
                          Deadline:{" "}
                          {tender.deadline
                            ? formatDate(tender.deadline)
                            : "Not specified"}
                        </div>
                      </div>

                      <div className="flex justify-between items-center pt-3 border-t">
                        <div className="text-xs text-muted-foreground space-y-1">
                          {tender.cpv_codes && tender.cpv_codes.length > 0 && (
                            <div>
                              {tender.cpv_codes
                                .map((code) => {
                                  const cpv = formatCpvCode(code);
                                  return `${cpv.code} (${cpv.name})`;
                                })
                                .join(" | ")}
                            </div>
                          )}
                        </div>
                        <div className="flex space-x-2">
                          {tender.reference_number && (
                            <Button
                              variant="outline"
                              size="sm"
                              asChild
                              className="text-xs"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <a
                                href={`https://www.find-tender.service.gov.uk/Notice/${tender.reference_number}?origin=SearchResults`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <ExternalLink className="w-3 h-3 mr-1" />
                                Go to Original Website
                              </a>
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}

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
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
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
                          <span key={page} className="px-2">
                            ...
                          </span>
                        );
                      }
                      return null;
                    })}
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
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tender View Dialog */}
      <TenderViewDialog
        tender={selectedTender}
        open={!!selectedTender}
        onOpenChange={(open) => !open && setSelectedTender(null)}
        onCreateProject={onCreateProject}
      />
    </div>
  );
}
