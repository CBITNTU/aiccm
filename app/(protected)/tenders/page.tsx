"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { ReadOnlyBanner } from "@/components/ReadOnlyBanner";
import { OnboardingBanner } from "@/components/OnboardingBanner";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FileText, Bookmark, Target, Plus, Loader2 } from "lucide-react";
import { DatabaseTenderFeed } from "@/components/tenders/DatabaseTenderFeed";
import { TenderSearchBar } from "@/components/tenders/TenderSearchBar";
import {
  TenderMatching,
  MatchingFiltersState,
} from "@/components/tenders/TenderMatching";
import { SavedTenders } from "@/components/tenders/SavedTenders";
import { api } from "@/lib/api/client";
import { toast } from "sonner";

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
  const { user, isPendingApproval, isOnboarding } = useAuth();
  const router = useRouter();

  // Users are restricted if they're pending approval OR still onboarding
  const isRestrictedUser = isPendingApproval || isOnboarding;
  const searchParams = useSearchParams();
  const [supabase, setSupabase] = useState<SupabaseClient<Database> | null>(
    null,
  );
  const [filters, setFilters] = useState<TenderFiltersState>({});
  const [matchingFilters, setMatchingFilters] = useState<MatchingFiltersState>({
    sortBy: "overall_score",
    sortDirection: "desc",
    minScore: 0,
    maxScore: 100,
    showApplied: "all",
  });
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [analyzing, setAnalyzing] = useState(false);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, user]); // intentionally excluding selectedCompany to only auto-select once

  const handleFiltersChange = (newFilters: TenderFiltersState) => {
    setFilters(newFilters);
  };

  const handleMatchingFiltersChange = (newFilters: MatchingFiltersState) => {
    setMatchingFilters(newFilters);
  };

  const handleCompanySelect = useCallback(
    (companyId: string) => {
      const company = companies.find((c) => c.id === companyId);
      setSelectedCompany(company || null);
    },
    [companies],
  );

  const resetFilters = () => {
    setFilters({ selectedTaxonomies: [] });
  };

  const resetMatchingFilters = () => {
    setMatchingFilters({
      sortBy: "overall_score",
      sortDirection: "desc",
      minScore: 0,
      maxScore: 100,
      showApplied: "all",
    });
  };

  const runAnalysis = async () => {
    if (!selectedCompany) {
      toast.error("Please select a company to analyze");
      return;
    }

    // Prevent multiple simultaneous analyses
    if (analyzing) {
      return;
    }

    setAnalyzing(true);
    try {
      const data = await api.matchTenders(selectedCompany.id);

      if (data.up_to_date) {
        toast.success("All tenders are up to date - no new analysis needed");
      } else {
        toast.success(
          `Analysis complete! Found ${data.analyzed_count || 0} new matches.`,
        );
      }
    } catch (error: unknown) {
      console.error("Error running analysis:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to run tender analysis. Please try again.";
      toast.error(errorMessage);
    } finally {
      setAnalyzing(false);
    }
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
    <div>
      <OnboardingBanner />
      <ReadOnlyBanner />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Page Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              Tender Opportunities
            </h1>
            <p className="text-muted-foreground mt-1">
              Discover tenders matching your business capabilities
            </p>
          </div>
          {selectedCompany && !isRestrictedUser && (
            <Button
              onClick={() => {
                const params = new URLSearchParams();
                params.set("companyId", selectedCompany.id);
                router.push(`/projects/new?${params.toString()}`);
              }}
              className="flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Start Project
            </Button>
          )}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="inline-flex h-10 items-center justify-start rounded-lg bg-muted p-1 mb-6">
            <TabsTrigger
              value="tenders"
              className="rounded-md px-4 py-2 text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              <FileText className="w-4 h-4 mr-2" />
              All Tenders
            </TabsTrigger>
            <TabsTrigger
              value="matches"
              className="rounded-md px-4 py-2 text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              <Target className="w-4 h-4 mr-2" />
              Your Matches
            </TabsTrigger>
            <TabsTrigger
              value="saved"
              className="rounded-md px-4 py-2 text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              <Bookmark className="w-4 h-4 mr-2" />
              Saved
            </TabsTrigger>
          </TabsList>

          {/* All Tenders Tab */}
          <TabsContent value="tenders" className="space-y-4">
            <TenderSearchBar
              filterType="database"
              databaseFilters={filters}
              onDatabaseFiltersChange={handleFiltersChange}
              onReset={resetFilters}
              placeholder="Search by title, buyer, location, or description..."
            />
            <DatabaseTenderFeed
              supabase={supabase}
              filters={filters}
              readOnly={isRestrictedUser}
              onCreateProject={
                isRestrictedUser
                  ? undefined
                  : (tenderId) => {
                      if (selectedCompany) {
                        const params = new URLSearchParams();
                        params.set("companyId", selectedCompany.id);
                        params.set("tenderId", tenderId);
                        router.push(`/projects/new?${params.toString()}`);
                      }
                    }
              }
            />
          </TabsContent>

          {/* Your Matches Tab */}
          <TabsContent value="matches" className="space-y-4">
            {/* Company selector + Run Analysis header */}
            <div className="flex items-center justify-between gap-4 pb-2">
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  Matching for:
                </span>
                {companies.length > 0 ? (
                  <Select
                    value={selectedCompany?.id || ""}
                    onValueChange={handleCompanySelect}
                  >
                    <SelectTrigger className="w-[220px] h-9">
                      <SelectValue placeholder="Select company" />
                    </SelectTrigger>
                    <SelectContent>
                      {companies.map((company) => (
                        <SelectItem key={company.id} value={company.id}>
                          {company.company_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    No companies found
                  </span>
                )}
              </div>
              <Button
                onClick={runAnalysis}
                disabled={analyzing || !selectedCompany || isRestrictedUser}
                title={
                  isRestrictedUser
                    ? "Action restricted for pending accounts"
                    : undefined
                }
              >
                {analyzing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Target className="w-4 h-4 mr-2" />
                    Run Analysis
                  </>
                )}
              </Button>
            </div>

            <TenderSearchBar
              filterType="matching"
              matchingFilters={matchingFilters}
              onMatchingFiltersChange={handleMatchingFiltersChange}
              onReset={resetMatchingFilters}
              placeholder="Search matches by title, buyer, or location..."
            />

            <TenderMatching
              companyId={selectedCompany?.id}
              filters={matchingFilters}
              readOnly={isRestrictedUser}
              analyzing={analyzing}
              onAnalyze={runAnalysis}
              onCreateProject={
                isRestrictedUser
                  ? undefined
                  : (tenderId) => {
                      const params = new URLSearchParams();
                      if (selectedCompany) {
                        params.set("companyId", selectedCompany.id);
                      }
                      params.set("tenderId", tenderId);
                      router.push(`/projects/new?${params.toString()}`);
                    }
              }
            />
          </TabsContent>

          {/* Saved Tenders Tab */}
          <TabsContent value="saved" className="space-y-4">
            <SavedTenders
              companyId={selectedCompany?.id}
              readOnly={isRestrictedUser}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
