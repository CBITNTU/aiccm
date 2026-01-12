"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Building2, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CompanyCard } from "@/components/directory/CompanyCard";
import { CompanyDetailModal } from "@/components/directory/CompanyDetailModal";
import { TaxonomyFilter } from "@/components/directory/TaxonomyFilter";

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

export default function DirectoryPage() {
  const [supabase, setSupabase] = useState<SupabaseClient<Database> | null>(
    null
  );
  const [companies, setCompanies] = useState<PublicCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLocation, setSelectedLocation] = useState<string>("all");
  const [selectedCapability, setSelectedCapability] = useState<string>("all");
  const [selectedTaxonomies, setSelectedTaxonomies] = useState<string[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<PublicCompany | null>(
    null
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const itemsPerPage = 25;

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
        if (selectedTaxonomies.length > 0) {
          const { data: companyIds, error: taxonomyError } = await supabase
            .from("company_taxonomies")
            .select("company_id")
            .in("taxonomy_id", selectedTaxonomies);

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
            { count: "exact" } // Get total count
          )
          .eq("status", "active");

        // Apply taxonomy filter if we have filtered IDs
        if (filteredCompanyIds) {
          query = query.in("id", filteredCompanyIds);
        }

        // Apply search filter at database level
        if (searchTerm.trim()) {
          query = query.or(
            `company_name.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`
          );
        }

        // Apply location filter at database level
        if (selectedLocation !== "all" && selectedLocation.trim()) {
          query = query.ilike("postcode", `%${selectedLocation}%`);
        }

        // Apply capability filter at database level
        if (selectedCapability !== "all" && selectedCapability.trim()) {
          query = query.ilike("key_capabilities", `%${selectedCapability}%`);
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
  }, [
    supabase,
    selectedTaxonomies,
    currentPage,
    searchTerm,
    selectedLocation,
    selectedCapability,
  ]);

  // Fetch unique locations and capabilities for filter dropdowns (separate lightweight query)
  const [uniqueLocations, setUniqueLocations] = useState<string[]>([]);
  const [uniqueCapabilities, setUniqueCapabilities] = useState<string[]>([]);

  useEffect(() => {
    if (!supabase) return;

    const fetchFilterOptions = async () => {
      try {
        // Fetch just postcodes and capabilities for filter dropdowns
        const { data: companiesData } = await supabase
          .from("companies")
          .select("postcode, key_capabilities")
          .eq("status", "active")
          .limit(5000); // Get enough to build filter options

        if (companiesData) {
          const locations = [
            ...new Set(
              companiesData
                .map((c) => c.postcode)
                .filter(
                  (p): p is string =>
                    p !== null && p !== undefined && p.trim() !== ""
                )
            ),
          ];
          const capabilities = [
            ...new Set(
              companiesData
                .flatMap((c) =>
                  c.key_capabilities
                    ? c.key_capabilities.split(",").map((cap) => cap.trim())
                    : []
                )
                .filter(
                  (cap): cap is string =>
                    cap !== null && cap !== undefined && cap.trim() !== ""
                )
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

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedLocation, selectedCapability, selectedTaxonomies]);

  // Calculate pagination (now based on server-side total count)
  const totalPages = Math.ceil(totalCount / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalCount);

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
    // Scroll to top when page changes
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/20">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">Loading companies...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20">
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Companies Directory
          </h1>
          <p className="text-muted-foreground">
            Discover construction companies and their capabilities
          </p>
        </div>

        {/* Filters */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Search & Filter
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search companies..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              <Select
                value={selectedLocation}
                onValueChange={setSelectedLocation}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Filter by location" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All locations</SelectItem>
                  {uniqueLocations.map((location) => {
                    // Ensure we never use empty string as value
                    const safeValue =
                      location && location.trim() ? location.trim() : "unknown";
                    return (
                      <SelectItem key={location} value={safeValue}>
                        {location}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>

              <Select
                value={selectedCapability}
                onValueChange={setSelectedCapability}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Filter by capability" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All capabilities</SelectItem>
                  {uniqueCapabilities.map((capability) => {
                    // Ensure we never use empty string as value
                    const safeValue =
                      capability && capability.trim()
                        ? capability.trim()
                        : "unknown";
                    return (
                      <SelectItem key={capability} value={safeValue}>
                        {capability}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Taxonomy Filters */}
            <div className="border-t pt-4">
              <TaxonomyFilter
                selectedTaxonomies={selectedTaxonomies}
                onTaxonomiesChange={setSelectedTaxonomies}
              />
            </div>
          </CardContent>
        </Card>

        {/* Results Summary */}
        <div className="mb-6 flex items-center justify-between">
          <p className="text-muted-foreground">
            {totalCount > 0 ? (
              <>
                Showing {startIndex + 1}-{endIndex} of {totalCount} companies
              </>
            ) : (
              "No companies found"
            )}
          </p>
          {totalPages > 1 && (
            <p className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </p>
          )}
        </div>

        {/* Companies Grid */}
        {companies.length === 0 && !loading ? (
          <Card>
            <CardContent className="text-center py-12">
              <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No companies found</h3>
              <p className="text-muted-foreground">
                Try adjusting your search or filter criteria
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {companies.map((company) => (
                <CompanyCard
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
                      // Show first page, last page, current page, and pages around current
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
                    }
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
        />
      </main>
    </div>
  );
}
