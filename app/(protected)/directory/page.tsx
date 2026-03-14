"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { CompanyRecord as Company } from "@/lib/api/types";
import { useDirectory } from "@/hooks/useDirectory";
import { useDebounce } from "@/hooks/useDebounce";
import { useOrg } from "@/hooks/useOrg";
import { ReadOnlyBanner } from "@/components/ReadOnlyBanner";
import { OnboardingBanner } from "@/components/OnboardingBanner";
import { Building2, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CompanyCardNew } from "@/components/directory/CompanyCardNew";
import {
  DirectorySearchBar,
  type DirectoryFiltersState,
} from "@/components/directory/DirectorySearchBar";
import { DirectoryResultsHeader } from "@/components/directory/DirectoryResultsHeader";

type PublicCompany = Pick<
  Company,
  | "id"
  | "company_name"
  | "description"
  | "key_capabilities"
  | "postcode"
  | "certifications"
  | "past_projects"
  | "is_system_company"
  | "status"
  | "digital_maturity"
  | "ai_competencies"
  | "ai_capabilities"
  | "ai_analysis"
  | "created_at"
  | "updated_at"
  | "user_id"
>;

const defaultFilters: DirectoryFiltersState = {
  searchTerm: "",
  selectedTaxonomies: [],
};

export default function DirectoryPage() {
  const router = useRouter();
  const { selectedOrg } = useOrg();

  const [filters, setFilters] = useState<DirectoryFiltersState>(defaultFilters);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  const debouncedSearch = useDebounce(filters.searchTerm, 400);

  const { data: directoryData, isLoading: loading, refetch } = useDirectory({
    search: debouncedSearch.trim() || undefined,
    taxonomyIds:
      filters.selectedTaxonomies.length > 0
        ? filters.selectedTaxonomies
        : undefined,
    page: currentPage,
    limit: itemsPerPage,
    lat: filters.lat,
    lng: filters.lng,
    radiusMiles: filters.radiusMiles,
  });

  const companies = (directoryData?.companies as unknown as PublicCompany[]) ?? [];
  const taxonomiesByCompany = directoryData?.taxonomiesByCompany ?? {};
  const distanceByCompany = directoryData?.distanceByCompany ?? {};
  const totalCount = directoryData?.totalCount ?? 0;

  const defaultLocationQuery =
    selectedOrg?.address || selectedOrg?.postcode || undefined;

  const handleCompanyClick = (company: PublicCompany) => {
    router.push(`/directory/${company.id}`);
  };

  const handleFiltersChange = (newFilters: DirectoryFiltersState) => {
    setFilters(newFilters);
  };

  const handleResetFilters = () => {
    setFilters(defaultFilters);
  };

  const handleRefresh = () => {
    refetch();
  };

  useEffect(() => {
    queueMicrotask(() => setCurrentPage(1));
  }, [debouncedSearch, filters.selectedTaxonomies, filters.lat, filters.lng, filters.radiusMiles]);

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
          defaultLocationQuery={defaultLocationQuery}
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
              filters.selectedTaxonomies.length > 0 ||
              filters.lat != null) && (
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
                    distanceMiles={distanceByCompany[company.id]}
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

      </main>
    </div>
  );
}
