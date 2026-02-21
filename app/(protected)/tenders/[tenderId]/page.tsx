"use client";

/* eslint-disable @typescript-eslint/no-explicit-any -- tender row types */
import { useState, useEffect } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
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

interface TenderData {
  id: string;
  title: string;
  description: string | null;
  buyer: string;
  location: string | null;
  status: string | null;
  publication_date: string | null;
  deadline: string | null;
  budget_min: number | null;
  budget_max: number | null;
  reference_number: string | null;
  cpv_codes: string[] | null;
  ai_summary: string | null;
  ai_capability_taxonomy: string[] | null;
  documents: { application_url?: string; specification_url?: string } | null;
}

interface MatchData {
  id: string;
  overall_score: number;
  capability_score: number;
  experience_score: number;
  location_score: number;
  certification_score: number;
  match_reasons: string[];
  improvement_suggestions: string[];
  ai_analysis: Record<string, unknown>;
}

interface Taxonomy {
  id: string;
  name: string;
}

export default function TenderDetailPage() {
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

        setTender(tenderResult.tender as any);
        setTaxonomies(tenderResult.taxonomies);

        // Fetch match data if companyId provided
        if (companyId) {
          const matchResult = await api.getTenderMatch(tenderId, companyId);
          if (matchResult.match) {
            setMatchData(matchResult.match as unknown as MatchData);
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
            Loading tender details...
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
          <h2 className="text-lg font-semibold mb-2">Tender not found</h2>
          <p className="text-muted-foreground mb-4">
            The tender you are looking for does not exist or has been removed.
          </p>
          <Button variant="outline" onClick={() => router.push("/tenders")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Tenders
          </Button>
        </div>
      </div>
    );
  }

  const formatBudget = (min?: number | null, max?: number | null) => {
    if (!min && !max) return "Budget not disclosed";
    if (min && max)
      return `£${min.toLocaleString()} - £${max.toLocaleString()}`;
    if (min) return `From £${min.toLocaleString()}`;
    if (max) return `Up to £${max.toLocaleString()}`;
    return "Budget not disclosed";
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

  const sourceLabel =
    (() => {
      const url =
        tender.documents?.specification_url ||
        tender.documents?.application_url ||
        "";
      if (url.includes("ted.europa.eu")) return "TED (EU)";
      if (url.includes("find-tender.service.gov.uk")) return "Find a Tender (UK)";
      if (url.includes("contracts-finder.service.gov.uk"))
        return "Contracts Finder (UK)";
      return null;
    })();

  const handleViewExternal = () => {
    const applicationUrl = (tender.documents as any)?.application_url;
    const externalUrl =
      applicationUrl ||
      (tender.reference_number
        ? `https://www.find-tender.service.gov.uk/Notice/${tender.reference_number}?origin=SearchResults`
        : null);

    if (externalUrl) {
      window.open(externalUrl, "_blank");
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
          Back to Tenders
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
                {tender.reference_number && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Ref: {tender.reference_number}
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
                <Badge variant="destructive">Deadline Soon</Badge>
              )}
              {tender.status && (
                <Badge variant="secondary">{tender.status}</Badge>
              )}
              {matchData && (
                <Badge
                  variant={getScoreVariant(matchData.overall_score)}
                  className="text-lg px-3 py-1"
                >
                  {matchData.overall_score}% Match
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
                <p className="text-xs text-muted-foreground">Buyer</p>
                <p className="font-medium">{tender.buyer}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Location</p>
                <p className="font-medium">
                  {tender.location || "Not specified"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Published</p>
                <p className="font-medium">
                  {tender.publication_date
                    ? formatDate(tender.publication_date)
                    : "Not specified"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Deadline</p>
                <p className="font-medium">
                  {tender.deadline
                    ? formatDate(tender.deadline)
                    : "Not specified"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 col-span-2 md:col-span-1">
              <PoundSterling className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Budget</p>
                <p className="font-medium">
                  {formatBudget(tender.budget_min, tender.budget_max)}
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3">
            {tender.reference_number && (
              <Button variant="outline" onClick={handleViewExternal}>
                <ExternalLink className="w-4 h-4 mr-2" />
                View on Find a Tender
              </Button>
            )}
            {!isRestricted && (
              <Button onClick={handleCreateProject}>
                <Plus className="w-4 h-4 mr-2" />
                Create Project
              </Button>
            )}
            {companyId && matchData && !isRestricted && (
              <Button variant="outline" onClick={handleBuildTeam}>
                <Users className="w-4 h-4 mr-2" />
                Build Consulting Team
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Content Area */}
      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        {/* AI Summary */}
        {tender.ai_summary && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="text-blue-500">✨</span>
                AI Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                {tender.ai_summary}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Description */}
        <Card>
          <CardHeader>
            <CardTitle>Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {tender.description || "No description available"}
            </p>
          </CardContent>
        </Card>

        {/* CPV Codes */}
        {tender.cpv_codes && tender.cpv_codes.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tag className="w-5 h-5" />
                CPV Codes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {tender.cpv_codes.map((code) => {
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
                Tender Categories
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
          <h2 className="text-xl font-semibold mb-6">Match Analysis</h2>
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Score Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Score Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const scoreExplanations =
                    (matchData.ai_analysis?.score_explanations as {
                      capability?: string;
                      experience?: string;
                      location?: string;
                      certification?: string;
                    }) || {};

                  const scores = [
                    {
                      label: "Capability",
                      value: matchData.capability_score,
                      explanation: scoreExplanations.capability,
                    },
                    {
                      label: "Experience",
                      value: matchData.experience_score,
                      explanation: scoreExplanations.experience,
                    },
                    {
                      label: "Location",
                      value: matchData.location_score,
                      explanation: scoreExplanations.location,
                    },
                    {
                      label: "Certification",
                      value: matchData.certification_score,
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
            {(matchData.ai_analysis as { summary?: string })?.summary && (
              <Card>
                <CardHeader>
                  <CardTitle>AI Analysis Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {(matchData.ai_analysis as { summary: string }).summary}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Key Strengths */}
            {matchData.match_reasons && matchData.match_reasons.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Award className="h-5 w-5" />
                    Key Strengths
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {matchData.match_reasons.map((reason, index) => (
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
            {matchData.improvement_suggestions &&
              matchData.improvement_suggestions.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Lightbulb className="h-5 w-5" />
                      Improvement Suggestions
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {matchData.improvement_suggestions.map(
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
