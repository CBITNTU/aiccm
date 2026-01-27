"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useAuth } from "@/hooks/useAuth";
import { ReadOnlyBanner } from "@/components/ReadOnlyBanner";
import { OnboardingBanner } from "@/components/OnboardingBanner";
import { Building2, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CompanyCardNew } from "@/components/directory/CompanyCardNew";
import { CompanyDetailModal } from "@/components/directory/CompanyDetailModal";
import { DirectorySearchBar } from "@/components/directory/DirectorySearchBar";
import { DirectoryResultsHeader } from "@/components/directory/DirectoryResultsHeader";

type Company = Database["public"]["Tables"]["companies"]["Row"];
type PublicCompany = Pick<
  Company,
  | "id"
  | "company_name"
  | "description"
  | "key_capabilities"
  | "postcode"
  | "certifications"
  | "equipment"
  | "past_projects"
  | "is_system_company"
  | "status"
  | "market_position"
  | "safety_rating"
  | "digital_maturity"
  | "ai_competencies"
  | "ai_capabilities"
  | "ai_analysis"
  | "created_at"
  | "updated_at"
  | "user_id"
>;

interface DirectoryFilters {
  searchTerm: string;
  location: string;
  capability: string;
  selectedTaxonomies: string[];
}

const defaultFilters: DirectoryFilters = {
  searchTerm: "",
  location: "all",
  capability: "all",
  selectedTaxonomies: [],
};

export default function DirectoryPage() {
  const { isPendingApproval, isOnboarding } = useAuth();

  // Users are restricted if they're pending approval OR still onboarding
  const isRestrictedUser = isPendingApproval || isOnboarding;
  const [supabase, setSupabase] = useState<SupabaseClient<Database> | null>(
    null,
  );
  const [companies, setCompanies] = useState<PublicCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<DirectoryFilters>(defaultFilters);
  const [selectedCompany, setSelectedCompany] = useState<PublicCompany | null>(
    null,
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const itemsPerPage = 25;

  // Filter options for dropdowns
  const [uniqueLocations, setUniqueLocations] = useState<string[]>([]);
  const [uniqueCapabilities, setUniqueCapabilities] = useState<string[]>([]);

  // Initialize supabase client
  useEffect(() => {
    const client = createClient();
    setSupabase(client);
  }, []);

  // Fetch companies with server-side pagination and filtering
  useEffect(() => {
    if (!supabase) return;

    const fetchCompanies = async () => {
      try {
        setLoading(true);

        // Calculate pagination
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage - 1;

        // First, get company IDs if taxonomy filter is applied
        let filteredCompanyIds: string[] | null = null;
        if (filters.selectedTaxonomies.length > 0) {
          const { data: companyIds, error: taxonomyError } = await supabase
            .from("company_taxonomies")
            .select("company_id")
            .in("taxonomy_id", filters.selectedTaxonomies);

          if (taxonomyError) {
            console.error("Error fetching taxonomy companies:", taxonomyError);
          } else if (companyIds && companyIds.length > 0) {
            filteredCompanyIds = [
              ...new Set(companyIds.map((c) => c.company_id)),
            ];
          } else {
            // No companies match these taxonomies
            setCompanies([]);
            setTotalCount(0);
            setLoading(false);
            return;
          }
        }

        // Build base query
        let query = supabase
          .from("companies")
          .select(
            `
            id,
            company_name,
            description,
            key_capabilities,
            postcode,
            certifications,
            equipment,
            past_projects,
            is_system_company,
            status,
            market_position,
            safety_rating,
            digital_maturity,
            ai_competencies,
            ai_capabilities,
            ai_analysis,
            created_at,
            updated_at,
            user_id
          `,
            { count: "exact" },
          )
          .eq("status", "active");

        // Apply taxonomy filter if we have filtered IDs
        if (filteredCompanyIds) {
          query = query.in("id", filteredCompanyIds);
        }

        // Apply search filter at database level
        if (filters.searchTerm.trim()) {
          query = query.or(
            `company_name.ilike.%${filters.searchTerm}%,description.ilike.%${filters.searchTerm}%`,
          );
        }

        // Apply location filter at database level
        if (filters.location !== "all" && filters.location.trim()) {
          query = query.ilike("postcode", `%${filters.location}%`);
        }

        // Apply capability filter at database level
        if (filters.capability !== "all" && filters.capability.trim()) {
          query = query.ilike("key_capabilities", `%${filters.capability}%`);
        }

        // Apply pagination and ordering
        query = query.order("company_name").range(startIndex, endIndex);

        const { data, error, count } = await query;

        if (error) {
          throw error;
        }

        setCompanies(data || []);
        setTotalCount(count || 0);
      } catch (error) {
        console.error("Error fetching companies:", error);
        toast.error("Failed to load companies");
      } finally {
        setLoading(false);
      }
    };

    fetchCompanies();
  }, [supabase, filters, currentPage]);

  // Fetch unique locations and capabilities for filter dropdowns
  useEffect(() => {
    if (!supabase) return;

    const fetchFilterOptions = async () => {
      try {
        const { data: companiesData } = await supabase
          .from("companies")
          .select("postcode, key_capabilities")
          .eq("status", "active")
          .limit(5000);

        if (companiesData) {
          const locations = [
            ...new Set(
              companiesData
                .map((c) => c.postcode)
                .filter(
                  (p): p is string =>
                    p !== null && p !== undefined && p.trim() !== "",
                ),
            ),
          ];
          const capabilities = [
            ...new Set(
              companiesData
                .flatMap((c) =>
                  c.key_capabilities
                    ? c.key_capabilities.split(",").map((cap) => cap.trim())
                    : [],
                )
                .filter(
                  (cap): cap is string =>
                    cap !== null && cap !== undefined && cap.trim() !== "",
                ),
            ),
          ];
          setUniqueLocations(locations);
          setUniqueCapabilities(capabilities);
        }
      } catch (error) {
        console.error("Error fetching filter options:", error);
      }
    };

    fetchFilterOptions();
  }, [supabase]);

  const handleCompanyClick = (company: PublicCompany) => {
    setSelectedCompany(company);
    setIsModalOpen(true);
  };

  const handleFiltersChange = (newFilters: DirectoryFilters) => {
    setFilters(newFilters);
  };

  const handleResetFilters = () => {
    setFilters(defaultFilters);
  };

  const handleRefresh = () => {
    // Trigger re-fetch by toggling a dependency - the useEffect will re-run
    setFilters({ ...filters });
  };

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  // Calculate pagination
  const totalPages = Math.ceil(totalCount / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalCount);

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20">
      <OnboardingBanner />
      <ReadOnlyBanner />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Companies Directory
          </h1>
          <p className="text-muted-foreground">
            Discover construction companies and their capabilities
          </p>
        </div>

        {/* Search Bar with Filters */}
        <DirectorySearchBar
          filters={filters}
          onFiltersChange={handleFiltersChange}
          onReset={handleResetFilters}
          uniqueLocations={uniqueLocations}
          uniqueCapabilities={uniqueCapabilities}
        />

        {/* Results Header */}
        {!loading && totalCount > 0 && (
          <DirectoryResultsHeader
            total={totalCount}
            start={startIndex + 1}
            end={endIndex}
            currentPage={currentPage}
            totalPages={totalPages}
            loading={loading}
            onRefresh={handleRefresh}
          />
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mr-2" />
            <span className="text-muted-foreground">Loading companies...</span>
          </div>
        )}

        {/* Empty State */}
        {!loading && companies.length === 0 && (
          <div className="text-center py-16">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No companies found</h3>
            <p className="text-muted-foreground mb-4">
              Try adjusting your search or filter criteria
            </p>
            {(filters.searchTerm ||
              filters.location !== "all" ||
              filters.capability !== "all" ||
              filters.selectedTaxonomies.length > 0) && (
              <Button variant="outline" onClick={handleResetFilters}>
                Clear all filters
              </Button>
            )}
          </div>
        )}

        {/* Companies Grid */}
        {!loading && companies.length > 0 && (
          <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {companies.map((company) => (
                <CompanyCardNew
                  key={company.id}
                  company={company}
                  onClick={handleCompanyClick}
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
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                    (page) => {
                      if (
                        page === 1 ||
                        page === totalPages ||
                        (page >= currentPage - 1 && page <= currentPage + 1)
                      ) {
                        return (
                          <Button
                            key={page}
                            variant={
                              currentPage === page ? "default" : "outline"
                            }
                            size="sm"
                            onClick={() => goToPage(page)}
                            className="min-w-[2.5rem]"
                          >
                            {page}
                          </Button>
                        );
                      } else if (
                        page === currentPage - 2 ||
                        page === currentPage + 2
                      ) {
                        return (
                          <span
                            key={page}
                            className="px-2 text-muted-foreground"
                          >
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
                  disabled={currentPage === totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}
          </>
        )}

        {/* Company Detail Modal */}
        <CompanyDetailModal
          company={selectedCompany}
          open={isModalOpen}
          onOpenChange={setIsModalOpen}
          readOnly={isRestrictedUser}
        />
      </main>
    </div>
  );
}
