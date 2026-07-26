"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { translateTaxonomyName } from "@/lib/taxonomyTranslations";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrg } from "@/hooks/useOrg";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Building2,
  Calendar,
  ExternalLink,
  FileText,
  Lightbulb,
  Loader2,
  MapPin,
  Plus,
  Banknote,
  Award,
  Tag,
  Target,
  Users,
} from "lucide-react";
import { formatCpvCode } from "@/lib/cpvCodes";
import { useDeployment } from "@/lib/deployment/client";
import { formatCurrency, resolveCurrencyConfig } from "@/lib/format/currency";
import { TenderStatusBadge } from "@/components/tenders/TenderStatusBadge";
import type { TenderMatchRecord, TenderRecord } from "@/lib/api/types";
import { resolveExternalNoticeLink } from "@/lib/tenders/externalNoticeLink";
import { toast } from "sonner";

type TenderData = TenderRecord;
type MatchData = TenderMatchRecord;

interface Taxonomy {
  id: string;
  name: string;
}

export default function TenderDetailPage() {
  const t = useTranslations("TenderDetail");
  const locale = useLocale();
  const { currency } = useDeployment();
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isPendingApproval, isOnboarding } = useAuth();
  const { selectedOrg } = useOrg();

  const tenderId = params.tenderId as string;
  const companyIdFromUrl = searchParams.get("companyId");
  const effectiveCompanyId = companyIdFromUrl ?? selectedOrg?.id ?? null;

  const [tender, setTender] = useState<TenderData | null>(null);
  const [matchData, setMatchData] = useState<MatchData | null>(null);
  const [taxonomies, setTaxonomies] = useState<Taxonomy[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [deepResearching, setDeepResearching] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Step back through history so the user lands on the exact tab, sub-view and
  // page of the list they came from. A hard push to /tenders would silently
  // reset all of it. Falls back to the list when this page was opened cold
  // (direct link, new tab) and there is nothing to go back to.
  const goBackToTenders = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/tenders");
    }
  };

  const { data: matchingConfig } = useQuery({
    queryKey: ["matchingConfig"],
    queryFn: () => api.getMatchingConfig(),
    staleTime: 5 * 60 * 1000,
  });

  const matchingModel = matchingConfig?.matchingModel ?? "AI model";

  const loadMatchData = useCallback(
    async (companyId: string) => {
      const matchResult = await api.getTenderMatch(tenderId, companyId);
      if (matchResult.match) {
        setMatchData(matchResult.match as MatchData);
        return true;
      }
      return false;
    },
    [tenderId],
  );

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch tender + taxonomies
        const tenderResult = await api.getTender(tenderId);
        if (!tenderResult.tender) {
          setNotFound(true);
          setLoading(false);
          return;
        }

        setTender(tenderResult.tender as TenderData);
        setTaxonomies(tenderResult.taxonomies);

        if (effectiveCompanyId) {
          await loadMatchData(effectiveCompanyId);
        }
      } catch (error) {
        console.error("Error fetching tender:", error);
        setNotFound(true);
      }

      setLoading(false);
    };

    fetchData();
  }, [tenderId, effectiveCompanyId, loadMatchData]);

  const runDeepResearch = async (force = false) => {
    if (!effectiveCompanyId) {
      toast.error(t("deepResearchNoCompany"));
      return;
    }

    if (!force && matchData) {
      toast.info(t("deepResearchCached"));
      return;
    }

    setDeepResearching(true);
    stopPolling();

    try {
      const result = await api.triggerDeepMatch(
        effectiveCompanyId,
        [tenderId],
        { force },
      );

      if (result.status === "all_cached") {
        setDeepResearching(false);
        await loadMatchData(effectiveCompanyId);
        toast.info(t("deepResearchCached"));
        return;
      }

      const modelLabel = result.matchingModel ?? matchingModel;
      toast.success(t("deepResearchQueued", { model: modelLabel }));

      let attempts = 0;
      pollRef.current = setInterval(async () => {
        attempts += 1;
        try {
          const found = await loadMatchData(effectiveCompanyId);
          if (found) {
            stopPolling();
            setDeepResearching(false);
            toast.success(t("deepResearchComplete"));
            const tenderResult = await api.getTender(tenderId);
            if (tenderResult.tender) {
              setTender(tenderResult.tender as TenderData);
              setTaxonomies(tenderResult.taxonomies);
            }
          } else if (attempts >= 40) {
            stopPolling();
            setDeepResearching(false);
          }
        } catch {
          if (attempts >= 40) {
            stopPolling();
            setDeepResearching(false);
          }
        }
      }, 3000);
    } catch (error) {
      setDeepResearching(false);
      toast.error(
        error instanceof Error ? error.message : t("deepResearchError"),
      );
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">{t("loading")}</span>
        </div>
      </div>
    );
  }

  if (notFound || !tender) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-16">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-2">{t("notFoundTitle")}</h2>
          <p className="text-muted-foreground mb-4">
            {t("notFoundDescription")}
          </p>
          <Button variant="outline" onClick={() => router.push("/tenders")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t("backToTenders")}
          </Button>
        </div>
      </div>
    );
  }

  const tenderCurrency = resolveCurrencyConfig(tender?.currency, currency);
  const formatBudget = (min?: number | null, max?: number | null) => {
    if (!min && !max) return t("budgetNotDisclosed");
    if (min && max)
      return t("budgetRange", {
        min: formatCurrency(min, tenderCurrency),
        max: formatCurrency(max, tenderCurrency),
      });
    if (min) return t("budgetFrom", { amount: formatCurrency(min, tenderCurrency) });
    if (max) return t("budgetUpTo", { amount: formatCurrency(max, tenderCurrency) });
    return t("budgetNotDisclosed");
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const isDeadlineSoon = (deadline: string) => {
    const deadlineDate = new Date(deadline);
    const today = new Date();
    const daysUntilDeadline = Math.ceil(
      (deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );
    return daysUntilDeadline <= 7 && daysUntilDeadline >= 0;
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const getScoreVariant = (
    score: number,
  ): "default" | "secondary" | "destructive" => {
    if (score >= 80) return "default";
    if (score >= 60) return "secondary";
    return "destructive";
  };

  const externalNoticeLink = resolveExternalNoticeLink({
    documents: tender.documents,
    referenceNumber: tender.referenceNumber,
  });

  const sourceLabel = (() => {
    if (externalNoticeLink.source === "ted") return t("sourceTed");
    if (externalNoticeLink.source === "find-a-tender")
      return t("sourceFindATender");
    if (externalNoticeLink.source === "contracts-finder")
      return t("sourceContractsFinder");
    return null;
  })();

  const viewExternalLabel = (() => {
    if (externalNoticeLink.source === "ted") return t("viewOnTed");
    if (externalNoticeLink.source === "find-a-tender")
      return t("viewOnFindATender");
    return t("viewOriginalNotice");
  })();

  const handleViewExternal = () => {
    if (externalNoticeLink.url) {
      window.open(externalNoticeLink.url, "_blank");
    }
  };

  const handleCreateProject = () => {
    const params = new URLSearchParams();
    if (effectiveCompanyId) params.set("companyId", effectiveCompanyId);
    params.set("tenderId", tenderId);
    router.push(`/projects/new?${params.toString()}`);
  };

  const handleBuildTeam = () => {
    sessionStorage.setItem(
      "voNavState",
      JSON.stringify({
        tenderId: tender.id,
        tenderTitle: tender.title,
        companyId: effectiveCompanyId,
      }),
    );
    router.push("/vo");
  };

  const isRestricted = isPendingApproval || isOnboarding;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Back Button */}
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={goBackToTenders}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("backToTenders")}
        </Button>
      </div>

      {/* Hero Card */}
      <Card className="card-professional mb-8">
        <CardHeader>
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex items-center space-x-4 flex-1">
              <div className="w-16 h-16 gradient-hero rounded-lg flex items-center justify-center">
                <FileText className="w-8 h-8 text-white" />
              </div>
              <div className="flex-1">
                <h1 className="text-2xl font-bold text-foreground">
                  {tender.title}
                </h1>
                {tender.referenceNumber && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {t("ref", { ref: tender.referenceNumber })}
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2 shrink-0 flex-wrap">
              {sourceLabel && (
                <Badge variant="outline" className="font-normal">
                  {sourceLabel}
                </Badge>
              )}
              {tender.deadline && isDeadlineSoon(tender.deadline) && (
                <Badge variant="destructive">{t("deadlineSoon")}</Badge>
              )}
              {tender.status && <TenderStatusBadge status={tender.status} />}
              {matchData && (
                <Badge
                  variant={getScoreVariant(matchData.overallScore ?? 0)}
                  className="text-lg px-3 py-1"
                >
                  {t("matchPercent", { score: matchData.overallScore ?? 0 })}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">{t("buyer")}</p>
                <p className="font-medium">{tender.buyer}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">{t("location")}</p>
                <p className="font-medium">
                  {tender.location || t("notSpecified")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">
                  {t("published")}
                </p>
                <p className="font-medium">
                  {tender.publicationDate
                    ? formatDate(tender.publicationDate)
                    : t("notSpecified")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">{t("deadline")}</p>
                <p className="font-medium">
                  {tender.deadline
                    ? formatDate(tender.deadline)
                    : t("notSpecified")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 col-span-2 md:col-span-1">
              <Banknote className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">{t("budget")}</p>
                <p className="font-medium">
                  {formatBudget(tender.budgetMin, tender.budgetMax)}
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3">
            {effectiveCompanyId && !isRestricted && (
              <Button
                onClick={() => runDeepResearch(Boolean(matchData))}
                disabled={deepResearching}
                variant={matchData ? "outline" : "default"}
              >
                {deepResearching ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Target className="w-4 h-4 mr-2" />
                )}
                {deepResearching
                  ? t("deepResearchInProgressShort")
                  : matchData
                    ? t("reRunDeepResearch")
                    : t("deepResearch")}
              </Button>
            )}
            {externalNoticeLink.url && (
              <Button variant="outline" onClick={handleViewExternal}>
                <ExternalLink className="w-4 h-4 mr-2" />
                {viewExternalLabel}
              </Button>
            )}
            {!isRestricted && (
              <Button onClick={handleCreateProject}>
                <Plus className="w-4 h-4 mr-2" />
                {t("createProject")}
              </Button>
            )}
            {effectiveCompanyId && matchData && !isRestricted && (
              <Button variant="outline" onClick={handleBuildTeam}>
                <Users className="w-4 h-4 mr-2" />
                {t("buildConsultingTeam")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Content Area */}
      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        {/* AI Summary */}
        {tender.aiSummary && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="text-blue-500">✨</span>
                {t("aiSummary")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap bg-blue-50 p-4 rounded-lg border border-blue-200">
                {tender.aiSummary}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Description */}
        <Card>
          <CardHeader>
            <CardTitle>{t("description")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {tender.description || t("noDescription")}
            </p>
          </CardContent>
        </Card>

        {/* CPV Codes */}
        {tender.cpvCodes && tender.cpvCodes.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tag className="w-5 h-5" />
                {t("cpvCodes")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {tender.cpvCodes.map((code) => {
                  const cpv = formatCpvCode(code);
                  return (
                    <Badge key={code} variant="outline">
                      {cpv.code} - {cpv.name}
                    </Badge>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tender Categories */}
        {taxonomies.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tag className="w-5 h-5" />
                {t("tenderCategories")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {taxonomies.map((taxonomy) => (
                  <Badge key={taxonomy.id} variant="secondary">
                    {translateTaxonomyName(taxonomy.name, locale)}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Match Analysis Section */}
      {effectiveCompanyId &&
        !matchData &&
        !deepResearching &&
        !isRestricted && (
          <Card className="mb-8 border-dashed">
            <CardContent className="py-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                {t("matchAnalysisPrompt")}
              </p>
              <Button
                onClick={() => runDeepResearch(false)}
                className="shrink-0"
              >
                <Target className="w-4 h-4 mr-2" />
                {t("deepResearch")}
              </Button>
            </CardContent>
          </Card>
        )}

      {matchData && (
        <>
          <Separator className="mb-8" />
          <h2 className="text-xl font-semibold mb-6">{t("matchAnalysis")}</h2>
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Score Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>{t("scoreBreakdown")}</CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const scoreExplanations =
                    ((
                      matchData.aiAnalysis as
                        | { scoreExplanations?: unknown }
                        | null
                        | undefined
                    )?.scoreExplanations as {
                      capability?: string;
                      experience?: string;
                      location?: string;
                      certification?: string;
                    }) || {};

                  const scores = [
                    {
                      label: t("scoreCapability"),
                      value: matchData.capabilityScore ?? 0,
                      explanation: scoreExplanations.capability,
                    },
                    {
                      label: t("scoreExperience"),
                      value: matchData.experienceScore ?? 0,
                      explanation: scoreExplanations.experience,
                    },
                    {
                      label: t("scoreLocation"),
                      value: matchData.locationScore ?? 0,
                      explanation: scoreExplanations.location,
                    },
                    {
                      label: t("scoreCertification"),
                      value: matchData.certificationScore ?? 0,
                      explanation: scoreExplanations.certification,
                    },
                  ];

                  return (
                    <div className="space-y-4">
                      {scores.map((score) => (
                        <div key={score.label} className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>{score.label}</span>
                            <span className={getScoreColor(score.value)}>
                              {score.value}%
                            </span>
                          </div>
                          <Progress value={score.value} className="h-2" />
                          {score.explanation && (
                            <p className="text-xs text-muted-foreground">
                              {score.explanation}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            {/* AI Analysis Summary */}
            {(matchData.aiAnalysis as { summary?: string } | null)?.summary && (
              <Card>
                <CardHeader>
                  <CardTitle>{t("aiAnalysisSummary")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {(matchData.aiAnalysis as { summary: string }).summary}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Key Strengths */}
            {matchData.matchReasons && matchData.matchReasons.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Award className="h-5 w-5" />
                    {t("keyStrengths")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {matchData.matchReasons.map((reason, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-2 text-sm"
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-2 flex-shrink-0" />
                        <span>{reason}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Improvement Suggestions */}
            {matchData.improvementSuggestions &&
              matchData.improvementSuggestions.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Lightbulb className="h-5 w-5" />
                      {t("improvementSuggestions")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {matchData.improvementSuggestions.map(
                        (suggestion, index) => (
                          <div
                            key={index}
                            className="flex items-start gap-2 text-sm"
                          >
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 flex-shrink-0" />
                            <span>{suggestion}</span>
                          </div>
                        ),
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
          </div>
        </>
      )}
    </div>
  );
}
