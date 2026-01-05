"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2, FileText, Bookmark, Target, Plus } from "lucide-react";
import { DatabaseTenderFeed } from "@/components/tenders/DatabaseTenderFeed";
import { TenderFilters } from "@/components/tenders/TenderFilters";
import { TenderMatching } from "@/components/tenders/TenderMatching";
import { SavedTenders } from "@/components/tenders/SavedTenders";
import { ProjectWizard } from "@/components/tenders/ProjectWizard";
import { Button } from "@/components/ui/button";

type Company = Database["public"]["Tables"]["companies"]["Row"];

interface TenderFiltersState {
  keyword?: string;
  location?: string;
  status?: string;
  budgetMin?: number;
  budgetMax?: number;
  dateFrom?: string;
  dateTo?: string;
  selectedTaxonomies?: string[];
}

export default function TendersPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [supabase, setSupabase] = useState<SupabaseClient<Database> | null>(
    null
  );
  const [filters, setFilters] = useState<TenderFiltersState>({});
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [showProjectWizard, setShowProjectWizard] = useState(false);
  const [initialTenderId, setInitialTenderId] = useState<string | null>(null);

  // Get tab from URL query parameter, default to "tenders"
  const tabFromUrl = searchParams.get("tab") || "tenders";
  const [activeTab, setActiveTab] = useState(tabFromUrl);

  // Initialize supabase client
  useEffect(() => {
    try {
      const client = createClient();
      setSupabase(client);
    } catch (error) {
      console.error("Failed to create Supabase client:", error);
    }
  }, []);

  // Fetch user companies and auto-select the first one
  useEffect(() => {
    if (!supabase || !user) return;

    const fetchCompanies = async () => {
      try {
        const { data, error } = await supabase
          .from("companies")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (error) throw error;
        setCompanies(data || []);

        // Auto-select the first company if none is selected
        if (data && data.length > 0 && !selectedCompany) {
          setSelectedCompany(data[0]);
        }
      } catch (error) {
        console.error("Error fetching companies:", error);
      }
    };

    fetchCompanies();
  }, [supabase, user]);

  const handleFiltersChange = (newFilters: TenderFiltersState) => {
    setFilters(newFilters);
  };

  const handleCompanySelect = useCallback((companyId: string) => {
    const company = companies.find((c) => c.id === companyId);
    setSelectedCompany(company || null);
  }, [companies]);

  const resetFilters = () => {
    setFilters({ selectedTaxonomies: [] });
  };

  if (!supabase) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Tender Opportunities
          </h1>
          <p className="text-muted-foreground">
            Discover and track government and private sector tenders that match
            your capabilities
          </p>
        </div>
        {selectedCompany && (
          <Button
            onClick={() => setShowProjectWizard(true)}
            className="flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Start Project
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="tenders" className="flex items-center space-x-2">
            <FileText className="w-4 h-4" />
            <span>All Tenders</span>
          </TabsTrigger>
          <TabsTrigger value="matches" className="flex items-center space-x-2">
            <Target className="w-4 h-4" />
            <span>Your Matches</span>
          </TabsTrigger>
          <TabsTrigger value="saved" className="flex items-center space-x-2">
            <Bookmark className="w-4 h-4" />
            <span>Saved Tenders</span>
          </TabsTrigger>
        </TabsList>

        {/* All Tenders Tab */}
        <TabsContent value="tenders" className="space-y-6">
          <div className="bg-primary/5 border-l-4 border-primary p-4 rounded-lg mb-6">
            <h3 className="font-semibold text-foreground mb-2">
              Database Tender Opportunities
            </h3>
            <p className="text-sm text-muted-foreground">
              Browse all tender opportunities from our comprehensive database.
              Use filters to find relevant opportunities that match your business
              capabilities.
            </p>
          </div>

          {/* Filters */}
          <TenderFilters
            onFiltersChange={handleFiltersChange}
            filters={filters}
            onReset={resetFilters}
          />

          {/* Database Tenders */}
          <DatabaseTenderFeed
            supabase={supabase}
            filters={filters}
            onCreateProject={(tenderId) => {
              if (selectedCompany) {
                setInitialTenderId(tenderId);
                setShowProjectWizard(true);
              }
            }}
          />
        </TabsContent>

        {/* Your Matches Tab */}
        <TabsContent value="matches" className="space-y-6">
          <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-lg mb-6 dark:bg-green-950/20">
            <h3 className="font-semibold text-foreground mb-2">
              AI-Powered Tender Matching
            </h3>
            <p className="text-sm text-muted-foreground">
              Based on your company profile, we analyze tender opportunities and
              provide match scores with detailed recommendations.
            </p>
          </div>

          {/* Company Selector */}
          {companies.length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Select Company
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Select
                  value={selectedCompany?.id || ""}
                  onValueChange={handleCompanySelect}
                >
                  <SelectTrigger className="w-full md:w-[300px]">
                    <SelectValue placeholder="Select a company" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map((company) => (
                      <SelectItem key={company.id} value={company.id}>
                        {company.company_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          )}

          {/* TenderMatching Component */}
          {selectedCompany ? (
            <TenderMatching
              companyId={selectedCompany.id}
              onCreateProject={(tenderId) => {
                setInitialTenderId(tenderId);
                setShowProjectWizard(true);
              }}
            />
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Select a company to see matching results.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Saved Tenders Tab */}
        <TabsContent value="saved" className="space-y-6">
          <SavedTenders companyId={selectedCompany?.id} />
        </TabsContent>
      </Tabs>

      {showProjectWizard && selectedCompany && (
        <ProjectWizard
          onClose={() => {
            setShowProjectWizard(false);
            setInitialTenderId(null);
          }}
          onProjectCreated={(projectId) => {
            setShowProjectWizard(false);
            setInitialTenderId(null);
            // Optionally redirect to project page or show success message
            console.log("Project created:", projectId);
          }}
          leadCompanyId={selectedCompany.id}
          initialTenderId={initialTenderId}
        />
      )}
    </div>
  );
}
