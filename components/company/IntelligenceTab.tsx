"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { DollarSign, TrendingUp, RefreshCw, Sparkles, CheckCircle2 } from "lucide-react";
import type { AnalysisUsage } from "@/hooks/useCompanyPageData";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { toast } from "sonner";
import { useDeployment } from "@/lib/deployment/client";
import { formatCurrency } from "@/lib/format/currency";

interface IntelligenceTabProps {
  companyId: string;
  isOwner: boolean;
  isVerified: boolean;
  isEditLocked: boolean;
  financialData: Record<string, { value: number; confidence: number }> | null;
  analysis: Record<string, unknown> | null;
  isAnalyzing: boolean;
  onAnalyze: () => void;
  onDataRefresh: () => Promise<void>;
  analysisUsage?: AnalysisUsage | null;
  analysisLimitReached?: boolean;
}

export function IntelligenceTab({
  companyId,
  isOwner,
  isVerified,
  isEditLocked,
  financialData,
  analysis,
  isAnalyzing,
  onAnalyze,
  onDataRefresh,
  analysisUsage,
  analysisLimitReached,
}: IntelligenceTabProps) {
  const t = useTranslations("CompanyPage");
  const { currency } = useDeployment();
  const queryClient = useQueryClient();
  const [isApplyingMarkets, setIsApplyingMarkets] = useState(false);
  const [marketsApplied, setMarketsApplied] = useState(false);

  const { data: allMarketsData } = useQuery({
    queryKey: ["markets"],
    queryFn: () => api.getMarkets(),
    staleTime: 10 * 60 * 1000,
  });

  const { data: companyMarketsData } = useQuery({
    queryKey: ["companyMarkets", companyId],
    queryFn: () => api.getCompanyMarkets(companyId),
    staleTime: 60 * 1000,
  });

  const suggestedMarketIds = (analysis?.aiSuggestedMarkets as string[] | undefined) ?? [];
  const existingMarketIds = new Set((companyMarketsData?.markets ?? []).map((m) => m.id));
  const allMarketsMap = new Map((allMarketsData?.markets ?? []).map((m) => [m.id, m.name]));

  const newSuggestedIds = suggestedMarketIds.filter((id) => !existingMarketIds.has(id));
  const newSuggestedNames = newSuggestedIds.map((id) => allMarketsMap.get(id)).filter(Boolean) as string[];

  const handleApplyMarkets = async () => {
    if (isEditLocked) {
      toast.error(t("intelligence.suggestedMarkets.editLocked"));
      return;
    }
    setIsApplyingMarkets(true);
    try {
      const mergedIds = [...existingMarketIds, ...newSuggestedIds];
      const result = await api.syncMarkets(companyId, mergedIds);
      setMarketsApplied(true);
      queryClient.invalidateQueries({ queryKey: ["companyMarkets", companyId] });
      await onDataRefresh();
      if (result.pendingReview) {
        toast.success(t("intelligence.suggestedMarkets.savedAsDraft"));
      } else {
        toast.success(t("intelligence.suggestedMarkets.applied"));
      }
    } catch {
      toast.error(t("intelligence.suggestedMarkets.applyFailed"));
    } finally {
      setIsApplyingMarkets(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Financial */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            {t("intelligence.financialInformation")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {financialData && Object.keys(financialData).length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.entries(financialData).map(([key, field]) => (
                <div key={key} className="p-3 bg-muted/50 rounded-lg">
                  <div className="text-xs font-medium text-muted-foreground capitalize">
                    {key.replace(/([A-Z])/g, " $1").trim()}
                  </div>
                  <div className="text-lg font-bold mt-0.5">
                    {typeof field.value === "number"
                      ? formatCurrency(field.value, currency)
                      : "N/A"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("intelligence.confidence")}{field.confidence}%
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              {t("intelligence.noFinancialData")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* AI-Suggested Markets */}
      {isOwner && !marketsApplied && newSuggestedNames.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-muted-foreground" />
              {t("intelligence.suggestedMarkets.title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("intelligence.suggestedMarkets.description")}
            </p>
            <div className="flex flex-wrap gap-2">
              {newSuggestedNames.map((name) => (
                <Badge key={name} variant="secondary">
                  {name}
                </Badge>
              ))}
            </div>
            {isVerified && (
              <p className="text-xs text-muted-foreground">
                {t("intelligence.suggestedMarkets.verifiedNote")}
              </p>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleApplyMarkets}
              disabled={isApplyingMarkets || isEditLocked}
            >
              {isApplyingMarkets
                ? t("intelligence.suggestedMarkets.applying")
                : t("intelligence.suggestedMarkets.apply")}
            </Button>
          </CardContent>
        </Card>
      )}

      {isOwner && marketsApplied && (
        <Card>
          <CardContent className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
            {isVerified
              ? t("intelligence.suggestedMarkets.savedAsDraft")
              : t("intelligence.suggestedMarkets.applied")}
          </CardContent>
        </Card>
      )}

      {/* AI Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            {t("intelligence.aiAnalysis")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {analysis ? (
            <div className="space-y-4">
              {Object.entries(analysis).map(([key, value]) => (
                <div key={key}>
                  <h4 className="text-sm font-semibold capitalize mb-1.5">
                    {key.replace(/([A-Z])/g, " $1").trim()}
                  </h4>
                  {Array.isArray(value) ? (
                    <ul className="list-disc list-inside space-y-0.5">
                      {value.map((item, idx) => (
                        <li key={idx} className="text-sm text-muted-foreground">
                          {String(item)}
                        </li>
                      ))}
                    </ul>
                  ) : typeof value === "object" && value !== null ? (
                    <pre className="text-xs text-muted-foreground bg-muted p-3 rounded-lg overflow-x-auto">
                      {JSON.stringify(value, null, 2)}
                    </pre>
                  ) : (
                    <p className="text-sm text-muted-foreground">{String(value)}</p>
                  )}
                  <Separator className="my-3" />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-sm text-muted-foreground mb-3">
                {t("intelligence.noAnalysis")}
              </p>
              <div className="flex items-center justify-center gap-2">
                <Button
                  className="btn-cta"
                  onClick={onAnalyze}
                  disabled={isAnalyzing || !!analysisLimitReached}
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 mr-1.5 ${isAnalyzing ? "animate-spin" : ""}`}
                  />
                  {isAnalyzing ? t("intelligence.analyzing") : analysisLimitReached ? t("intelligence.limitReached") : t("intelligence.analyzeCompany")}
                </Button>
                {analysisUsage && (
                  <Badge
                    variant={analysisLimitReached ? "destructive" : "secondary"}
                    className="text-xs"
                  >
                    {analysisUsage.used}/{analysisUsage.limit} {t("intelligence.thisMonth")}
                  </Badge>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
