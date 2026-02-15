"use client";

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useDashboard } from "@/hooks/useDashboard";
import { useMatchingResults } from "@/hooks/useMatchingResults";
import { useSavedTenders } from "@/hooks/useSavedTenders";
import { useAnalyzeCompany } from "@/hooks/useCompanyMutations";
import { api } from "@/lib/api/client";
import type { Database } from "@/lib/supabase/types";
import { TenderDetailDialog } from "@/components/TenderDetailDialog";
import { BusinessChatbot } from "@/components/BusinessChatbot";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { CompanyContextBar } from "@/components/dashboard/CompanyContextBar";
import { RecentMatchesCard } from "@/components/dashboard/RecentMatchesCard";
import { UpcomingDeadlinesCard } from "@/components/dashboard/UpcomingDeadlinesCard";
import { MatchScoreDistribution } from "@/components/dashboard/MatchScoreDistribution";
import { CompanyInsightsCard } from "@/components/dashboard/CompanyInsightsCard";

type Company = Database["public"]["Tables"]["companies"]["Row"];

interface MatchingResult {
  id: string;
  tender_id: string;
  company_id: string;
  overall_score: number;
  capability_score: number;
  experience_score: number;
  location_score: number;
  certification_score: number;
  match_reasons: string[];
  improvement_suggestions: string[];
  ai_analysis: Record<string, unknown>;
  is_bookmarked: boolean;
  is_applied: boolean;
  created_at: string;
  tenders: {
    title: string;
    buyer: string;
    description: string;
    location: string;
    deadline: string;
    budget_min: number;
    budget_max: number;
  };
  companies: {
    company_name: string;
  };
}

interface CompanyAnalysis {
  performanceBenchmark?: {
    overallScore?: number;
    technicalExpertise?: number;
    safetyStandards?: number;
    certifications?: number;
    projectExperience?: number;
  };
  executiveSummary?: string;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { data: dashboardData, isLoading } = useDashboard(user?.id ?? null);
  const analyzeCompanyMutation = useAnalyzeCompany();

  const userCompanies = useMemo(
    () => (dashboardData?.companies as unknown as Company[]) ?? [],
    [dashboardData?.companies]
  );
  const totalTenders = dashboardData?.stats.totalTenders ?? 0;
  const matchingResults = dashboardData?.stats.matchingResults ?? 0;
  const projects = dashboardData?.stats.projects ?? 0;

  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<MatchingResult | null>(null);

  // Matching results for selected company
  const { data: matchingData } = useMatchingResults(selectedCompany?.id);
  const companyMatches = (matchingData?.results as unknown as MatchingResult[]) ?? [];

  // Saved tenders count
  const { data: savedData } = useSavedTenders(selectedCompany?.id);
  const savedCount = (savedData?.results as unknown[])?.length ?? 0;

  // Auto-select first company when data loads
  useEffect(() => {
    if (userCompanies.length > 0 && !selectedCompany) {
      setSelectedCompany(userCompanies[0]);
    }
  }, [userCompanies, selectedCompany]);

  // Derived: company analysis
  const companyAnalysis = selectedCompany?.ai_analysis
    ? (selectedCompany.ai_analysis as unknown as CompanyAnalysis)
    : null;

  const handleAnalyze = async () => {
    if (!selectedCompany?.id) return;
    try {
      const data = await analyzeCompanyMutation.mutateAsync(selectedCompany.id);
      if (data?.success) {
        // Refresh company data
        try {
          const companyData = await api.getCompany(selectedCompany.id);
          const updated = companyData.company as unknown as Company;
          if (updated) setSelectedCompany(updated);
        } catch {
          // analysis saved server-side, will refresh on next load
        }
      }
    } catch (error) {
      console.error("Error analyzing company:", error);
    }
  };

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Welcome back! Here&apos;s your overview.
        </p>
        <div className="mt-4">
          <CompanyContextBar
            companies={userCompanies}
            selectedCompany={selectedCompany}
            onSelect={setSelectedCompany}
          />
        </div>
      </div>

      {/* Stats Row */}
      <div className="mb-8">
        <StatsCards
          totalTenders={totalTenders}
          matchingResults={matchingResults}
          savedCount={savedCount}
          projects={projects}
        />
      </div>

      {/* Main Content: Recent Matches + Upcoming Deadlines */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <RecentMatchesCard
          matches={companyMatches}
          selectedCompanyName={selectedCompany?.company_name ?? undefined}
          onMatchSelect={(match) => {
            setSelectedMatch(match as MatchingResult);
            setDialogOpen(true);
          }}
        />
        <UpcomingDeadlinesCard matches={companyMatches} />
      </div>

      {/* Bottom Row: Score Distribution + Company Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MatchScoreDistribution matches={companyMatches} />
        <CompanyInsightsCard
          companyId={selectedCompany?.id}
          analysis={companyAnalysis}
          onAnalyze={handleAnalyze}
          isAnalyzing={analyzeCompanyMutation.isPending}
        />
      </div>

      {/* Tender Detail Dialog */}
      {selectedMatch && (
        <TenderDetailDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          result={selectedMatch}
          companyId={selectedCompany?.id}
        />
      )}

      {/* Business Chatbot */}
      <BusinessChatbot
        companyData={
          selectedCompany
            ? {
                company_name: selectedCompany.company_name || undefined,
                description: selectedCompany.description || undefined,
                key_capabilities: Array.isArray(selectedCompany.key_capabilities)
                  ? selectedCompany.key_capabilities.join(", ")
                  : undefined,
                certifications: Array.isArray(selectedCompany.certifications)
                  ? selectedCompany.certifications.join(", ")
                  : undefined,
                equipment: Array.isArray(selectedCompany.equipment)
                  ? selectedCompany.equipment.join(", ")
                  : undefined,
              }
            : undefined
        }
      />
    </div>
  );
}
