"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/hooks/useAuth";
import { useOrg } from "@/hooks/useOrg";
import { ReadOnlyBanner } from "@/components/ReadOnlyBanner";
import { OnboardingBanner } from "@/components/OnboardingBanner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { FileText, Bookmark, Target, Plus } from "lucide-react";
import { DatabaseTenderFeed } from "@/components/tenders/DatabaseTenderFeed";
import { TenderSearchBar } from "@/components/tenders/TenderSearchBar";
import {
  TenderMatching,
  MatchingFiltersState,
} from "@/components/tenders/TenderMatching";
import { SavedTenders } from "@/components/tenders/SavedTenders";

interface TenderFiltersState {
  keyword?: string;
  location?: string;
  status?: string;
  source?: string;
  budgetMin?: number;
  budgetMax?: number;
  dateFrom?: string;
  dateTo?: string;
  selectedTaxonomies?: string[];
  sortBy?: string;
  sortDirection?: string;
}

export default function TendersPage() {
  const t = useTranslations("TendersPage");
  const { isPendingApproval, isOnboarding } = useAuth();
  const { selectedOrg } = useOrg();
  const router = useRouter();

  const isRestrictedUser = isPendingApproval || isOnboarding;
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<TenderFiltersState>({});
  const [matchingFilters, setMatchingFilters] = useState<MatchingFiltersState>({
    sortBy: "overall_score",
    sortDirection: "desc",
    minScore: 0,
    maxScore: 100,
    showApplied: "all",
    tenderStatus: "active",
  });

  // Get tab from URL query parameter, default to "matches"
  const tabFromUrl = searchParams.get("tab") || "matches";
  const [activeTab, setActiveTab] = useState(tabFromUrl);

  const handleFiltersChange = (newFilters: TenderFiltersState) => {
    setFilters(newFilters);
  };

  const handleMatchingFiltersChange = (newFilters: MatchingFiltersState) => {
    setMatchingFilters(newFilters);
  };

  const resetFilters = () => {
    setFilters({
      selectedTaxonomies: [],
      sortBy: "deadline",
      sortDirection: "asc",
    });
  };

  const resetMatchingFilters = () => {
    setMatchingFilters({
      sortBy: "overall_score",
      sortDirection: "desc",
      minScore: 0,
      maxScore: 100,
      showApplied: "all",
      tenderStatus: "active",
    });
  };

  return (
    <div>
      <OnboardingBanner />
      <ReadOnlyBanner />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Page Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              {t("title")}
            </h1>
            <p className="text-muted-foreground mt-1">
              {t("subtitle")}
            </p>
          </div>
          {selectedOrg && !isRestrictedUser && (
            <Button
              onClick={() => {
                const params = new URLSearchParams();
                params.set("companyId", selectedOrg.id);
                router.push(`/projects/new?${params.toString()}`);
              }}
              className="flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              {t("startProject")}
            </Button>
          )}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="inline-flex h-10 items-center justify-start rounded-lg bg-muted p-1 mb-6">
            <TabsTrigger
              value="matches"
              className="rounded-md px-4 py-2 text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              <Target className="w-4 h-4 mr-2" />
              {t("tabMatches")}
            </TabsTrigger>
            <TabsTrigger
              value="saved"
              className="rounded-md px-4 py-2 text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              <Bookmark className="w-4 h-4 mr-2" />
              {t("tabSaved")}
            </TabsTrigger>
            <TabsTrigger
              value="tenders"
              className="rounded-md px-4 py-2 text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              <FileText className="w-4 h-4 mr-2" />
              {t("tabAllTenders")}
            </TabsTrigger>
          </TabsList>

          {/* Your Matches Tab */}
          <TabsContent value="matches" className="space-y-4">
            {/* Company info header */}
            {selectedOrg && (
              <div className="flex items-center gap-3 pb-2">
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  {t("matchingFor")}
                </span>
                <span className="text-sm font-medium">
                  {selectedOrg.companyName}
                </span>
              </div>
            )}
            {!selectedOrg && (
              <div className="flex items-center gap-3 pb-2">
                <span className="text-sm text-muted-foreground">
                  {t("noCompanySelected")}
                </span>
              </div>
            )}

            <TenderSearchBar
              filterType="matching"
              matchingFilters={matchingFilters}
              onMatchingFiltersChange={handleMatchingFiltersChange}
              onReset={resetMatchingFilters}
              placeholder={t("searchMatchesPlaceholder")}
            />

            <TenderMatching
              companyId={selectedOrg?.id}
              companyData={selectedOrg ?? undefined}
              filters={matchingFilters}
              readOnly={isRestrictedUser}
              onCreateProject={
                isRestrictedUser
                  ? undefined
                  : (tenderId) => {
                      const params = new URLSearchParams();
                      if (selectedOrg) {
                        params.set("companyId", selectedOrg.id);
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
              companyId={selectedOrg?.id}
              readOnly={isRestrictedUser}
            />
          </TabsContent>

          {/* All Tenders Tab */}
          <TabsContent value="tenders" className="space-y-4">
            <TenderSearchBar
              filterType="database"
              databaseFilters={filters}
              onDatabaseFiltersChange={handleFiltersChange}
              onReset={resetFilters}
              placeholder={t("searchAllPlaceholder")}
            />
            <DatabaseTenderFeed
              filters={filters}
              readOnly={isRestrictedUser}
              onCreateProject={
                isRestrictedUser
                  ? undefined
                  : (tenderId) => {
                      if (selectedOrg) {
                        const params = new URLSearchParams();
                        params.set("companyId", selectedOrg.id);
                        params.set("tenderId", tenderId);
                        router.push(`/projects/new?${params.toString()}`);
                      }
                    }
              }
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
