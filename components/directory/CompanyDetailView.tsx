"use client";

import { useState, useEffect, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  MapPin,
  Globe,
  Phone,
  Mail,
  Award,
  Building2,
  Shield,
  Loader2,
  Sparkles,
  UserPlus,
  Tag,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";
import { useAuth } from "@/hooks/useAuth";
import { PastProjectsDisplay } from "@/components/company/PastProjectsDisplay";
import { toast } from "sonner";
import type { CompanyRecord as Company } from "@/lib/api/types";
import { useAnalyzeCompany } from "@/hooks/useCompanyMutations";
import { VerifiedBadge } from "@/components/company/VerifiedBadge";
import { CompanyLogo } from "@/components/company/CompanyLogo";
import { useTranslations } from "next-intl";
type PublicCompany = Pick<
  Company,
  | "id"
  | "companyName"
  | "logoUrl"
  | "description"
  | "keyCapabilities"
  | "postcode"
  | "certifications"
  | "pastProjects"
  | "isSystemCompany"
  | "status"
  | "digitalMaturity"
  | "aiCompetencies"
  | "aiCapabilities"
  | "aiAnalysis"
  | "createdAt"
  | "updatedAt"
  | "userId"
  | "websiteUrl"
  | "verificationStatus"
>;

interface CompanyAnalysis {
  performanceBenchmark: {
    technicalExpertise: number;
    safetyStandards: number;
    innovation: number;
    projectExperience: number;
    certifications: number;
    marketReputation: number;
    financialHealth: number;
    operationalCapacity: number;
    overallScore: number;
  };
  coreCompetencies: string[];
  digitalMaturity: string;
  safetyRating: string;
  marketPosition: string;
  businessInsights: string[];
  competitivePositioning: string;
  swotSummary: {
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    threats: string[];
  };
  executiveSummary: string;
  companyInfo?: unknown;
}

interface CompanyDetailViewProps {
  company: PublicCompany | Company;
  readOnly?: boolean;
  /** If provided, overrides the client-side owner check from useAuth */
  isOwner?: boolean;
  /** Selected capabilities (Competency box) - with category for tree */
  capabilities?: { id: string; name: string; category?: string | null }[];
  /** Selected markets - with parent for tree */
  markets?: {
    id: string;
    name: string;
    parent_id?: string | null;
    parent_name?: string | null;
  }[];
  /** Selected standards - with parent for tree */
  standards?: {
    id: string;
    name: string;
    parent_id?: string | null;
    parent_name?: string | null;
  }[];
}

/** Renders a list of items as a tree: grouped by parent (L1), then children (L2) with indentation */
function TaxonomyTree({
  items,
}: {
  items: { id: string; label: string; parentLabel: string | null }[];
}) {
  const groups = useMemo(() => {
    const byParent = new Map<string | null, { id: string; label: string }[]>();
    for (const item of items) {
      const key = item.parentLabel ?? null;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push({ id: item.id, label: item.label });
    }
    // Sort parents; null (root) last or first
    const entries = Array.from(byParent.entries()).sort((a, b) => {
      if (a[0] === null) return 1;
      if (b[0] === null) return -1;
      return a[0].localeCompare(b[0]);
    });
    return entries;
  }, [items]);

  if (items.length === 0) return null;

  return (
    <div className="rounded-md border border-border bg-muted/20 text-sm">
      <ul className="divide-y divide-border/50">
        {groups.map(([parentLabel, children]) => (
          <li key={parentLabel ?? "__root__"} className="first:pt-0">
            {parentLabel != null && (
              <div className="px-3 py-1.5 font-medium text-foreground bg-muted/40">
                {parentLabel}
              </div>
            )}
            <ul className={parentLabel != null ? "pl-4 pb-1" : ""}>
              {children.map((c) => (
                <li
                  key={c.id}
                  className={`py-1 text-muted-foreground ${
                    parentLabel != null ? "border-l-2 border-border/50 pl-3 ml-1" : "px-3"
                  }`}
                >
                  {c.label}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Type guard to check if company has full contact fields
function isFullCompany(comp: PublicCompany | Company): comp is Company {
  return "contactEmail" in comp;
}

export function CompanyDetailView({
  company,
  readOnly = false,
  isOwner: isOwnerProp,
  capabilities: capabilitiesProp,
  markets = [],
  standards = [],
}: CompanyDetailViewProps) {
  const t = useTranslations("Directory");
  const { user } = useAuth();
  const router = useRouter();
  const [analysis, setAnalysis] = useState<CompanyAnalysis | null>(null);
  const analyzeMutation = useAnalyzeCompany();
  const loadingAnalysis = analyzeMutation.isPending;

  // Use explicit prop if provided (server-fetched pages), otherwise compute from auth
  const isOwner =
    isOwnerProp !== undefined ? isOwnerProp : user?.id === company.userId;

  const loadStoredAnalysis = () => {
    if (company.aiAnalysis) {
      setAnalysis(company.aiAnalysis as unknown as CompanyAnalysis);
    } else {
      setAnalysis(null);
    }
  };

  useEffect(() => {
    loadStoredAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run when company changes
  }, [company.id]);

  const fetchAnalysis = async () => {
    if (!company.id || loadingAnalysis) return;

    try {
      const data = await analyzeMutation.mutateAsync(company.id);

      if (data?.success && data?.analysis) {
        setAnalysis(data.analysis as CompanyAnalysis);
      }
    } catch (error) {
      console.error("Error fetching analysis:", error);
      toast.error("Failed to load company analysis");
    }
  };

  const radarData = analysis?.performanceBenchmark
    ? [
        {
          subject: t("companyDetailView.technicalExpertise"),
          A: analysis.performanceBenchmark.technicalExpertise || 0,
          fullMark: 100,
        },
        {
          subject: t("companyDetailView.safetyStandards"),
          A: analysis.performanceBenchmark.safetyStandards || 0,
          fullMark: 100,
        },
        {
          subject: t("companyDetailView.innovation"),
          A: analysis.performanceBenchmark.innovation || 0,
          fullMark: 100,
        },
        {
          subject: t("companyDetailView.projectExperience"),
          A: analysis.performanceBenchmark.projectExperience || 0,
          fullMark: 100,
        },
        {
          subject: t("companyDetailView.certifications"),
          A: analysis.performanceBenchmark.certifications || 0,
          fullMark: 100,
        },
        {
          subject: t("companyDetailView.marketReputation"),
          A: analysis.performanceBenchmark.marketReputation || 0,
          fullMark: 100,
        },
      ]
    : [];

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center gap-3 min-w-0">
            <CompanyLogo
              companyName={company.companyName}
              logoUrl={company.logoUrl}
              size="md"
              fallback="icon"
            />
            <h1 className="text-2xl font-bold">{company.companyName}</h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {!isOwner && user && (
              <Button
                variant="default"
                size="sm"
                className="gap-1.5"
                onClick={() =>
                  router.push(`/my-company/new?join=${encodeURIComponent(company.id)}`)
                }
              >
                <UserPlus className="h-4 w-4" />
                {t("companyDetailView.joinCompany")}
              </Button>
            )}
            {analysis?.performanceBenchmark?.overallScore && (
              <Badge variant="default" className="text-lg px-3 py-1">
                {analysis.performanceBenchmark.overallScore}/100
              </Badge>
            )}
            {company.verificationStatus === "verified" ? (
              <VerifiedBadge />
            ) : company.isSystemCompany && !company.userId ? (
              <Badge className="gap-1 bg-primary/10 text-primary border-primary/20 hover:bg-primary/10">
                <Sparkles className="h-3 w-3" />
                AI Generated
              </Badge>
            ) : null}
          </div>
        </div>
        {company.description && (
          <p className="text-muted-foreground text-base">
            {company.description}
          </p>
        )}

        {/* Competency, Market & Standards – single card with tree display */}
        <div className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Tag className="h-4 w-4" />
                {t("companyDetailView.competencyMarketStandards")}
                {analysis && capabilitiesProp?.length === 0 && (
                  <Badge variant="outline" className="text-xs font-normal">
                    {t("companyDetailView.aiAnalyzed")}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Competency tree (category = L1, name = L2) */}
              <div>
                <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
                  <Tag className="h-3.5 w-3.5" />
                  {t("companyDetailView.competency")}
                </h4>
                {capabilitiesProp && capabilitiesProp.length > 0 ? (
                  <TaxonomyTree
                    items={capabilitiesProp.map((c) => ({
                      id: c.id,
                      label: c.name,
                      parentLabel: c.category ?? null,
                    }))}
                  />
                ) : (
                  (() => {
                    let fallback: string[] = [];
                    if (
                      analysis?.coreCompetencies &&
                      Array.isArray(analysis.coreCompetencies)
                    ) {
                      fallback = analysis.coreCompetencies;
                    } else if (
                      company.aiCompetencies &&
                      Array.isArray(company.aiCompetencies)
                    ) {
                      fallback = company.aiCompetencies as string[];
                    } else if (
                      company.aiCapabilities &&
                      Array.isArray(company.aiCapabilities)
                    ) {
                      fallback = company.aiCapabilities as string[];
                    } else if (company.keyCapabilities) {
                      fallback = company.keyCapabilities
                        .split(",")
                        .map((cap) => cap.trim());
                    }
                    if (fallback.filter(Boolean).length === 0) {
                      return (
                        <span className="text-sm text-muted-foreground">
                          {t("companyDetailView.noCompetencies")}
                        </span>
                      );
                    }
                    return (
                      <TaxonomyTree
                        items={fallback
                          .filter(Boolean)
                          .slice(0, 12)
                          .map((label, index) => ({
                            id: `fallback-${index}`,
                            label,
                            parentLabel: null,
                          }))}
                      />
                    );
                  })()
                )}
              </div>

              {/* Market tree (parent_name = L1, name = L2) */}
              <div>
                <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
                  <Globe className="h-3.5 w-3.5" />
                  {t("companyDetailView.market")}
                </h4>
                {markets.length > 0 ? (
                  <TaxonomyTree
                    items={markets.map((m) => ({
                      id: m.id,
                      label: m.name,
                      parentLabel: m.parent_name ?? null,
                    }))}
                  />
                ) : (
                  <span className="text-sm text-muted-foreground">
                    {t("companyDetailView.noMarkets")}
                  </span>
                )}
              </div>

              {/* Standards & Certifications tree (parent_name = L1, name = L2) */}
              <div>
                <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
                  <Award className="h-3.5 w-3.5" />
                  {t("companyDetailView.standardsCertifications")}
                </h4>
                {standards.length > 0 ? (
                  <TaxonomyTree
                    items={standards.map((s) => ({
                      id: s.id,
                      label: s.name,
                      parentLabel: s.parent_name ?? null,
                    }))}
                  />
                ) : null}
                {company.certifications && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {company.certifications}
                  </p>
                )}
                {standards.length === 0 && !company.certifications && (
                  <span className="text-sm text-muted-foreground">
                    {t("companyDetailView.noStandards")}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        {/* Contact Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Phone className="h-5 w-5" />
            {t("companyDetailView.contactInformation")}
          </h3>

          <div className="space-y-3">
            {company.postcode && (
              <div className="flex items-center gap-3">
                <MapPin className="h-4 w-4 text-primary" />
                <span>{company.postcode}</span>
              </div>
            )}

            {company.websiteUrl && (
              <div className="flex items-center gap-3">
                <Globe className="h-4 w-4 text-primary" />
                <a
                  href={company.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {company.websiteUrl}
                </a>
              </div>
            )}

            {isOwner && isFullCompany(company) ? (
              <>
                {company.contactEmail && (
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-primary" />
                    <a
                      href={`mailto:${company.contactEmail}`}
                      className="text-primary hover:underline"
                    >
                      {company.contactEmail}
                    </a>
                  </div>
                )}

                {company.contactPhone && (
                  <div className="flex items-center gap-3">
                    <Phone className="h-4 w-4 text-primary" />
                    <a
                      href={`tel:${company.contactPhone}`}
                      className="text-primary hover:underline"
                    >
                      {company.contactPhone}
                    </a>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center gap-3 text-muted-foreground">
                <Mail className="h-4 w-4" />
                <span>{t("companyDetailView.contactAvailableToPartners")}</span>
              </div>
            )}

            {isFullCompany(company) && company.companiesHouseNumber && (
              <div className="flex items-center gap-3">
                <Building2 className="h-4 w-4 text-primary" />
                <span>{t("companyDetailView.companiesHouse")}{company.companiesHouseNumber}</span>
              </div>
            )}
          </div>
        </div>

        {/* Company Metrics */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {t("companyDetailView.companyMetrics")}
          </h3>

          <div className="space-y-3">
            {company.digitalMaturity && (
              <div className="border border-border rounded-lg p-4 bg-card hover:bg-accent/5 transition-colors">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground block">
                    {t("companyDetailView.digitalMaturity")}
                  </label>
                  <Badge className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-50">
                    {company.digitalMaturity}
                  </Badge>
                </div>
              </div>
            )}

            {company.status && (
              <div className="border border-border rounded-lg p-4 bg-card hover:bg-accent/5 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <label className="text-sm font-medium text-foreground block">
                      {t("companyDetailView.companyStatus")}
                    </label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("companyDetailView.currentOperationalStatus")}
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    <Badge
                      className={
                        company.status === "active"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                          : "bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-100"
                      }
                    >
                      {company.status.charAt(0).toUpperCase() +
                        company.status.slice(1)}
                    </Badge>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Performance Benchmark */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Award className="h-5 w-5" />
              {t("companyDetailView.performanceBenchmark")}
            </h3>
            {isOwner && !readOnly && (
              <Button
                variant="outline"
                size="sm"
                onClick={fetchAnalysis}
                disabled={loadingAnalysis}
              >
                {loadingAnalysis ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t("companyDetailView.analyzing")}
                  </>
                ) : analysis ? (
                  t("companyDetailView.reanalyzePerformance")
                ) : (
                  t("companyDetailView.analyzePerformance")
                )}
              </Button>
            )}
          </div>

          {analysis ? (
            <div className="space-y-4">
              <div className="border border-border rounded-lg p-4 bg-card">
                <ResponsiveContainer width="100%" height={280}>
                  <RadarChart data={radarData}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
                    <PolarRadiusAxis
                      angle={90}
                      domain={[0, 100]}
                      tick={{ fontSize: 9 }}
                    />
                    <Radar
                      name={t("companyDetailView.performanceScore")}
                      dataKey="A"
                      stroke="hsl(var(--primary))"
                      fill="hsl(var(--primary))"
                      fillOpacity={0.2}
                      strokeWidth={2}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {radarData.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 bg-muted/50 rounded-lg"
                  >
                    <span className="text-muted-foreground text-xs">
                      {item.subject}
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="w-12 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-500"
                          style={{ width: `${item.A}%` }}
                        />
                      </div>
                      <span className="font-medium text-xs min-w-[2rem] text-right">
                        {item.A}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="text-sm text-muted-foreground p-4 bg-muted/30 rounded-lg border border-border">
                <div className="flex items-center gap-2 mb-2">
                  <Award className="h-4 w-4 text-primary" />
                  <strong className="text-foreground">
                    {t("companyDetailView.overallScore", { score: `${analysis?.performanceBenchmark?.overallScore || 0}/100` })}
                  </strong>
                </div>
                <strong className="text-foreground">{t("companyDetailView.executiveSummary")}</strong>{" "}
                {analysis?.executiveSummary || t("companyDetailView.noSummary")}
              </div>
            </div>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-muted-foreground border border-dashed border-border rounded-lg bg-muted/30">
              <div className="text-center">
                <Award className="h-16 w-16 mx-auto mb-3 opacity-40" />
                <p className="font-medium mb-1">
                  {t("companyDetailView.noBenchmarkAvailable")}
                </p>
                {isOwner ? (
                  <p className="text-sm">
                    {t("companyDetailView.benchmarkOwnerHelper")}
                  </p>
                ) : (
                  <p className="text-sm">
                    {t("companyDetailView.benchmarkNonOwnerHelper")}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <Separator className="my-6" />

      {/* Additional Details */}
      <div className="space-y-6">
        {company.pastProjects && (
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-3">
              <Building2 className="h-5 w-5" />
              {t("companyDetailView.pastProjects")}
            </h3>
            <PastProjectsDisplay value={company.pastProjects} />
          </div>
        )}
      </div>
    </div>
  );
}
