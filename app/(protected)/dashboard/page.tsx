"use client";

import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useOrg } from "@/hooks/useOrg";
import { useDashboard } from "@/hooks/useDashboard";
import { useAnalyzeCompany } from "@/hooks/useCompanyMutations";
import { api } from "@/lib/api/client";
import { TenderDetailDialog } from "@/components/TenderDetailDialog";
import { TeamMembersCard } from "@/components/company/TeamMembersCard";
import { DashboardSkeleton } from "./_components/skeletons/DashboardSkeleton";
import { StatsCards } from "./_components/StatsCards";
import { PerformanceBenchmarkCard } from "./_components/PerformanceBenchmarkCard";
import { CompanyOverviewCard } from "./_components/CompanyOverviewCard";
import { RecentMatchesSection } from "./_components/RecentMatchesSection";
import { QuickActionsSection } from "./_components/QuickActionsSection";
import type {
  Company,
  DashboardStats,
  MatchingResult,
  CompanyAnalysis,
} from "./_components/types";

const BusinessChatbot = dynamic(
  () =>
    import("@/components/BusinessChatbot").then((m) => ({ default: m.BusinessChatbot })),
  { ssr: false },
);

export default function DashboardPage() {
  const { user } = useAuth();
  const { selectedOrg } = useOrg();
  const { data: dashboardData, isLoading: loading } = useDashboard(user?.id ?? null);
  const analyzeCompanyMutation = useAnalyzeCompany();

  const stats: DashboardStats = {
    totalTenders: dashboardData?.stats.totalTenders ?? 0,
    matchingResults: dashboardData?.stats.matchingResults ?? 0,
    companies: dashboardData?.stats.companies ?? 0,
    projects: dashboardData?.stats.projects ?? 0,
    recentMatches: (dashboardData?.recentMatches as unknown as MatchingResult[]) ?? [],
  };

  const [companyAnalysis, setCompanyAnalysis] =
    useState<CompanyAnalysis | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<MatchingResult | null>(null);
  const [enrichedCompany, setEnrichedCompany] = useState<Company | null>(null);

  // Keep enrichedCompany in sync with selectedOrg
  useEffect(() => {
    if (selectedOrg) {
      queueMicrotask(() => setEnrichedCompany(selectedOrg));
    } else {
      queueMicrotask(() => {
        setEnrichedCompany(null);
        setCompanyAnalysis(null);
      });
    }
  }, [selectedOrg?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load stored analysis when company changes
  useEffect(() => {
    if (enrichedCompany?.ai_analysis) {
      queueMicrotask(() =>
        setCompanyAnalysis(
          enrichedCompany.ai_analysis as unknown as CompanyAnalysis,
        ),
      );
    } else {
      queueMicrotask(() => setCompanyAnalysis(null));
    }
  }, [enrichedCompany?.id, enrichedCompany?.ai_analysis]);

  const isAnalyzing = analyzeCompanyMutation.isPending;

  const fetchCompanyAnalysis = async () => {
    if (!selectedOrg?.id) return;
    try {
      const data = await analyzeCompanyMutation.mutateAsync(selectedOrg.id);

      if (data?.success && data?.analysis) {
        const analysis = data.analysis as CompanyAnalysis;
        setCompanyAnalysis(analysis);

        try {
          const companyData = await api.getCompany(selectedOrg.id);
          const updatedCompany = companyData.company as unknown as Company;
          if (updatedCompany) {
            setEnrichedCompany(updatedCompany);
          }
        } catch (fetchError) {
          console.error("Error fetching updated company data:", fetchError);
        }
      }
    } catch (error) {
      console.error("Error fetching company analysis:", error);
    }
  };

  const radarData = companyAnalysis?.performanceBenchmark
    ? [
        { subject: "Technical Expertise", A: companyAnalysis.performanceBenchmark.technicalExpertise || 0, fullMark: 100 },
        { subject: "Safety Standards", A: companyAnalysis.performanceBenchmark.safetyStandards || 0, fullMark: 100 },
        { subject: "Innovation", A: companyAnalysis.performanceBenchmark.innovation || 0, fullMark: 100 },
        { subject: "Project Experience", A: companyAnalysis.performanceBenchmark.projectExperience || 0, fullMark: 100 },
        { subject: "Certifications", A: companyAnalysis.performanceBenchmark.certifications || 0, fullMark: 100 },
        { subject: "Market Reputation", A: companyAnalysis.performanceBenchmark.marketReputation || 0, fullMark: 100 },
      ]
    : [];

  const displayCompany = enrichedCompany ?? selectedOrg;

  const filteredMatches = selectedOrg
    ? stats.recentMatches.filter((match) => match.company_id === selectedOrg.id)
    : stats.recentMatches;

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Welcome back! Here&apos;s what&apos;s happening with your tenders and
          opportunities.
        </p>
      </div>

      <StatsCards stats={stats} />

      {displayCompany && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <PerformanceBenchmarkCard
            companyName={displayCompany.company_name || ""}
            companyAnalysis={companyAnalysis}
            radarData={radarData}
            isAnalyzing={isAnalyzing}
            onAnalyze={fetchCompanyAnalysis}
          />
          <CompanyOverviewCard company={displayCompany} />
        </div>
      )}

      {selectedOrg && (
        <div className="mb-8">
          <TeamMembersCard companyId={selectedOrg.id} variant="compact" />
        </div>
      )}

      {filteredMatches.length > 0 && (
        <RecentMatchesSection
          matches={filteredMatches}
          companyName={selectedOrg?.company_name || undefined}
          onViewDetails={(match) => {
            setSelectedMatch(match);
            setDialogOpen(true);
          }}
        />
      )}

      <QuickActionsSection />

      {selectedMatch && (
        <TenderDetailDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          result={selectedMatch}
          companyId={selectedOrg?.id}
        />
      )}

      <BusinessChatbot
        companyData={
          selectedOrg
            ? {
                company_name: selectedOrg.company_name || undefined,
                description: selectedOrg.description || undefined,
                key_capabilities: Array.isArray(selectedOrg.key_capabilities)
                  ? selectedOrg.key_capabilities.join(", ")
                  : undefined,
                certifications: Array.isArray(selectedOrg.certifications)
                  ? selectedOrg.certifications.join(", ")
                  : undefined,
              }
            : undefined
        }
      />
    </div>
  );
}
