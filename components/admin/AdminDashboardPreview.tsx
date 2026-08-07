"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api/client";
import type { CompanyRecord } from "@/lib/api/types";
import { Card, CardContent } from "@/components/ui/card";
import { PerformanceBenchmarkCard } from "@/app/(protected)/dashboard/_components/PerformanceBenchmarkCard";
import { CompanyOverviewCard } from "@/app/(protected)/dashboard/_components/CompanyOverviewCard";
import {
  buildRadarData,
  type CompanyAnalysis,
} from "@/app/(protected)/dashboard/_components/types";

/**
 * What the user's dashboard will show once approved — the company performance
 * benchmark and overview cards, driven by the same components and the same
 * `companies.aiAnalysis` blob the real dashboard reads.
 *
 * The stats tiles are deliberately omitted: they count platform-wide tenders
 * and the user's projects, neither of which says anything about readiness.
 */
export function AdminDashboardPreview({ companyId }: { companyId: string }) {
  const t = useTranslations("AdminPreparation");
  const [company, setCompany] = useState<CompanyRecord | null>(null);
  const [analysis, setAnalysis] = useState<CompanyAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.getCompany(companyId);
      setCompany(data.company);
      const aiAnalysis = (data.company as unknown as Record<string, unknown>)
        .aiAnalysis as CompanyAnalysis | null | undefined;
      setAnalysis(aiAnalysis?.performanceBenchmark ? aiAnalysis : null);
    } catch (error) {
      console.error("Error loading dashboard preview:", error);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    try {
      const result = await api.analyzeCompany(companyId);
      if (result?.success) {
        toast.success(t("toasts.analyzeSuccess"));
        await load();
      }
    } catch (error) {
      console.error("Error analyzing company:", error);
      toast.error(
        error instanceof Error ? error.message : t("toasts.analyzeFailed"),
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!company) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          {t("notFound")}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{t("dashboardHelp")}</p>

      <PerformanceBenchmarkCard
        companyName={company.companyName}
        companyAnalysis={analysis}
        radarData={buildRadarData(analysis)}
        isAnalyzing={isAnalyzing}
        onAnalyze={handleAnalyze}
      />

      <CompanyOverviewCard company={company} />
    </div>
  );
}
