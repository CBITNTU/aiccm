"use client";

import { useState, useEffect } from "react";
import type { Database } from "@/lib/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { useDirectory } from "@/hooks/useDirectory";
import { ReadOnlyBanner } from "@/components/ReadOnlyBanner";
import { OnboardingBanner } from "@/components/OnboardingBanner";
import { Building2, ChevronLeft, ChevronRight } from "lucide-react";
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

  const isRestrictedUser = isPendingApproval || isOnboarding;
  const [filters, setFilters] = useState<DirectoryFilters>(defaultFilters);
  const [selectedCompany, setSelectedCompany] = useState<PublicCompany | null>(
    null,
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  const { data: directoryData, isLoading: loading, refetch } = useDirectory({
    search: filters.searchTerm.trim() || undefined,
    location: filters.location !== "all" ? filters.location : undefined,
    capability: filters.capability !== "all" ? filters.capability : undefined,
    taxonomyIds:
      filters.selectedTaxonomies.length > 0
        ? filters.selectedTaxonomies
        : undefined,
    page: currentPage,
    limit: itemsPerPage,
  });

  const companies = (directoryData?.companies as unknown as PublicCompany[]) ?? [];
  const taxonomiesByCompany = directoryData?.taxonomiesByCompany ?? {};
  const totalCount = directoryData?.totalCount ?? 0;
  const uniqueLocations = directoryData?.uniqueLocations ?? [];
  const uniqueCapabilities = directoryData?.uniqueCapabilities ?? [];

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
    refetch();
  };

  // Reset to page 1 when filters change (async to satisfy set-state-in-effect)
  useEffect(() => {
    queueMicrotask(() => setCurrentPage(1));
  }, [filters]);

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
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Companies Directory
          </h1>
          <p className="text-muted-foreground">
            Discover construction companies and their capabilities
          </p>
        </div>

        <DirectorySearchBar
          filters={filters}
          onFiltersChange={handleFiltersChange}
          onReset={handleResetFilters}
          uniqueLocations={uniqueLocations}
          uniqueCapabilities={uniqueCapabilities}
        />

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

        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mr-2" />
            <span className="text-muted-foreground">Loading companies...</span>
          </div>
        )}

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

        {!loading && companies.length > 0 && (
          <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {companies.map((company) => (
                <div key={company.id} className="list-item-deferred">
                  <CompanyCardNew
                    company={company}
                    onClick={handleCompanyClick}
                    taxonomies={taxonomiesByCompany[company.id]}
                  />
                </div>
              ))}
            </div>

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
