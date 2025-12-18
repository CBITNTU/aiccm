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
import { Search, Building2 } from "lucide-react";
import { toast } from "sonner";
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

  // Initialize supabase client
  useEffect(() => {
    const client = createClient();
    setSupabase(client);
  }, []);

  // Fetch companies
  useEffect(() => {
    if (!supabase) return;

    const fetchCompanies = async () => {
      try {
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
          `
          )
          .eq("status", "active")
          .order("company_name");

        // Apply taxonomy filter
        if (selectedTaxonomies.length > 0) {
          const { data: companyIds, error: taxonomyError } = await supabase
            .from("company_taxonomies")
            .select("company_id")
            .in("taxonomy_id", selectedTaxonomies);

          if (taxonomyError) {
            console.error("Error fetching taxonomy companies:", taxonomyError);
          } else if (companyIds && companyIds.length > 0) {
            const ids = [...new Set(companyIds.map((c) => c.company_id))];
            query = query.in("id", ids);
          } else {
            // No companies match these taxonomies
            setCompanies([]);
            setLoading(false);
            return;
          }
        }

        const { data, error } = await query;

        if (error) {
          throw error;
        }

        setCompanies(data || []);
      } catch (error) {
        console.error("Error fetching companies:", error);
        toast.error("Failed to load companies");
      } finally {
        setLoading(false);
      }
    };

    fetchCompanies();
  }, [supabase, selectedTaxonomies]);

  const filteredCompanies = companies.filter((company) => {
    const matchesSearch =
      company.company_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (company.description &&
        company.description.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesLocation =
      selectedLocation === "all" ||
      (company.postcode &&
        company.postcode
          .toLowerCase()
          .includes(selectedLocation.toLowerCase()));

    const matchesCapability =
      selectedCapability === "all" ||
      (company.key_capabilities &&
        company.key_capabilities
          .toLowerCase()
          .includes(selectedCapability.toLowerCase()));

    return matchesSearch && matchesLocation && matchesCapability;
  });

  const uniqueLocations = [
    ...new Set(companies.map((c) => c.postcode).filter(Boolean)),
  ];
  const uniqueCapabilities = [
    ...new Set(
      companies.flatMap((c) =>
        c.key_capabilities
          ? c.key_capabilities.split(",").map((cap) => cap.trim())
          : []
      )
    ),
  ];

  const handleCompanyClick = (company: PublicCompany) => {
    setSelectedCompany(company);
    setIsModalOpen(true);
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
                  {uniqueLocations.map((location) => (
                    <SelectItem key={location} value={location || "unknown"}>
                      {location}
                    </SelectItem>
                  ))}
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
                  {uniqueCapabilities.map((capability) => (
                    <SelectItem key={capability} value={capability}>
                      {capability}
                    </SelectItem>
                  ))}
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
        <div className="mb-6">
          <p className="text-muted-foreground">
            Showing {filteredCompanies.length} of {companies.length} companies
          </p>
        </div>

        {/* Companies Grid */}
        {filteredCompanies.length === 0 ? (
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
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredCompanies.map((company) => (
              <CompanyCard
                key={company.id}
                company={company}
                onClick={handleCompanyClick}
              />
            ))}
          </div>
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
