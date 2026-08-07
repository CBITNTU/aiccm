"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/hooks/useAuth";
import { useOrg } from "@/hooks/useOrg";
import { useDashboard } from "@/hooks/useDashboard";
import { useAnalyzeCompany } from "@/hooks/useCompanyMutations";
import { api } from "@/lib/api/client";
import { TeamMembersCard } from "@/components/company/TeamMembersCard";
import { VerificationBanner } from "@/components/company/VerificationBanner";
import { DashboardSkeleton } from "./_components/skeletons/DashboardSkeleton";
import { StatsCards } from "./_components/StatsCards";
import { PerformanceBenchmarkCard } from "./_components/PerformanceBenchmarkCard";
import { CompanyOverviewCard } from "./_components/CompanyOverviewCard";
import { QuickActionsSection } from "./_components/QuickActionsSection";
import { buildRadarData } from "./_components/types";
import type {
  Company,
  DashboardStats,
  CompanyAnalysis,
} from "./_components/types";

export default function DashboardPage() {
  const t = useTranslations("Dashboard");
  const { user } = useAuth();
  const { selectedOrg } = useOrg();
  const { data: dashboardData, isLoading: loading } = useDashboard(user?.id ?? null);
  const analyzeCompanyMutation = useAnalyzeCompany();

  const stats: DashboardStats = {
    totalTenders: dashboardData?.stats.totalTenders ?? 0,
    matchingResults: dashboardData?.stats.matchingResults ?? 0,
    companies: dashboardData?.stats.companies ?? 0,
    projects: dashboardData?.stats.projects ?? 0,
  };

  const [companyAnalysis, setCompanyAnalysis] =
    useState<CompanyAnalysis | null>(null);
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
    if (enrichedCompany?.aiAnalysis) {
      queueMicrotask(() =>
        setCompanyAnalysis(
          enrichedCompany.aiAnalysis as unknown as CompanyAnalysis,
        ),
      );
    } else {
      queueMicrotask(() => setCompanyAnalysis(null));
    }
  }, [enrichedCompany?.id, enrichedCompany?.aiAnalysis]);

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

  const radarData = buildRadarData(companyAnalysis);

  const displayCompany = enrichedCompany ?? selectedOrg;

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold">{t("page.title")}</h1>
        <p className="text-muted-foreground mt-2">
          {t("page.welcome")}
        </p>
      </div>

      {selectedOrg && selectedOrg.verificationStatus !== "verified" && (
        <div className="mb-6">
          <VerificationBanner
            companyId={selectedOrg.id}
            companyData={selectedOrg}
            isOwner={true}
          />
        </div>
      )}

      <StatsCards stats={stats} />

      {displayCompany && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <PerformanceBenchmarkCard
            companyName={displayCompany.companyName || ""}
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

      <QuickActionsSection />
    </div>
  );
}
