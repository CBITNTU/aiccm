"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api/client";
import { useUserRole } from "@/hooks/useUserRole";
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
  PoundSterling,
  Award,
  Tag,
  Users,
} from "lucide-react";
import { formatCpvCode } from "@/lib/cpvCodes";
import { TenderStatusBadge } from "@/components/tenders/TenderStatusBadge";
import type { TenderMatchRecord, TenderRecord } from "@/lib/api/types";
import { resolveExternalNoticeLink } from "@/lib/tenders/externalNoticeLink";

type TenderData = TenderRecord;
type MatchData = TenderMatchRecord;

interface Taxonomy {
  id: string;
  name: string;
}

export default function TenderDetailPage() {
  const t = useTranslations("TenderDetail");
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { role } = useUserRole();

  const tenderId = params.tenderId as string;
  const companyId = searchParams.get("companyId");

  const [tender, setTender] = useState<TenderData | null>(null);
  const [matchData, setMatchData] = useState<MatchData | null>(null);
  const [taxonomies, setTaxonomies] = useState<Taxonomy[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

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

        // Fetch match data if companyId provided
        if (companyId) {
          const matchResult = await api.getTenderMatch(tenderId, companyId);
          if (matchResult.match) {
            setMatchData(matchResult.match as MatchData);
          }
        }
      } catch (error) {
        console.error("Error fetching tender:", error);
        setNotFound(true);
      }

      setLoading(false);
    };

    fetchData();
  }, [tenderId, companyId]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">
            {t("loading")}
          </span>
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

  const formatBudget = (min?: number | null, max?: number | null) => {
    if (!min && !max) return t("budgetNotDisclosed");
    if (min && max)
      return t("budgetRange", { min: min.toLocaleString(), max: max.toLocaleString() });
    if (min) return t("budgetFrom", { amount: min.toLocaleString() });
    if (max) return t("budgetUpTo", { amount: max.toLocaleString() });
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
    if (externalNoticeLink.source === "find-a-tender") return t("sourceFindATender");
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
    if (companyId) params.set("companyId", companyId);
    params.set("tenderId", tenderId);
    router.push(`/projects/new?${params.toString()}`);
  };

  const handleBuildTeam = () => {
    sessionStorage.setItem(
      "voNavState",
      JSON.stringify({
        tenderId: tender.id,
        tenderTitle: tender.title,
        companyId: companyId,
      }),
    );
    router.push("/vo");
  };

  const isRestricted = role === "pending";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Back Button */}
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => router.push("/tenders")}
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
              {tender.status && (
                <TenderStatusBadge status={tender.status} />
              )}
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
                <p className="text-xs text-muted-foreground">{t("published")}</p>
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
              <PoundSterling className="w-4 h-4 text-muted-foreground flex-shrink-0" />
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
            {companyId && matchData && !isRestricted && (
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
              <p className="text-sm text-muted-foreground whitespace-pre-wrap bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
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
                    {taxonomy.name}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Match Analysis Section */}
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
                    ((matchData.aiAnalysis as { scoreExplanations?: unknown } | null | undefined)
                      ?.scoreExplanations as {
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
