"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  MapPin,
  Globe,
  Phone,
  Mail,
  Award,
  Building2,
  FileText,
  Wrench,
  Shield,
  Loader2,
  BadgeCheck,
  Sparkles,
} from "lucide-react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { Database } from "@/lib/supabase/types";
import { useAnalyzeCompany } from "@/hooks/useCompanyMutations";

type Company = Database["public"]["Tables"]["companies"]["Row"];
type PublicCompany = Pick<
  Company,
  | "id"
  | "company_name"
  | "description"
  | "key_capabilities"
  | "postcode"
  | "certifications"
  | "equipment"
  | "past_projects"
  | "is_system_company"
  | "status"
  | "market_position"
  | "safety_rating"
  | "digital_maturity"
  | "ai_competencies"
  | "ai_capabilities"
  | "ai_analysis"
  | "created_at"
  | "updated_at"
  | "user_id"
  | "website_url"
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
}

// Type guard to check if company has full contact fields
function isFullCompany(comp: PublicCompany | Company): comp is Company {
  return "contact_email" in comp;
}

export function CompanyDetailView({
  company,
  readOnly = false,
  isOwner: isOwnerProp,
}: CompanyDetailViewProps) {
  const { user } = useAuth();
  const [analysis, setAnalysis] = useState<CompanyAnalysis | null>(null);
  const analyzeMutation = useAnalyzeCompany();
  const loadingAnalysis = analyzeMutation.isPending;

  // Use explicit prop if provided (server-fetched pages), otherwise compute from auth
  const isOwner =
    isOwnerProp !== undefined ? isOwnerProp : user?.id === company.user_id;

  const loadStoredAnalysis = () => {
    if (company.ai_analysis) {
      setAnalysis(company.ai_analysis as unknown as CompanyAnalysis);
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
          subject: "Technical Expertise",
          A: analysis.performanceBenchmark.technicalExpertise || 0,
          fullMark: 100,
        },
        {
          subject: "Safety Standards",
          A: analysis.performanceBenchmark.safetyStandards || 0,
          fullMark: 100,
        },
        {
          subject: "Innovation",
          A: analysis.performanceBenchmark.innovation || 0,
          fullMark: 100,
        },
        {
          subject: "Project Experience",
          A: analysis.performanceBenchmark.projectExperience || 0,
          fullMark: 100,
        },
        {
          subject: "Certifications",
          A: analysis.performanceBenchmark.certifications || 0,
          fullMark: 100,
        },
        {
          subject: "Market Reputation",
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
          <h1 className="text-2xl font-bold">{company.company_name}</h1>
          <div className="flex items-center gap-2">
            {analysis?.performanceBenchmark?.overallScore && (
              <Badge variant="default" className="text-lg px-3 py-1">
                {analysis.performanceBenchmark.overallScore}/100
              </Badge>
            )}
            {company.user_id ? (
              <Badge className="gap-1 bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50">
                <BadgeCheck className="h-3 w-3" />
                Verified
              </Badge>
            ) : company.is_system_company ? (
              <Badge className="gap-1 bg-primary/10 text-primary border-primary/20 hover:bg-primary/10">
                <Sparkles className="h-3 w-3" />
                AI Generated
              </Badge>
            ) : null}
          </div>
        </div>
        {company.description && (
          <p className="text-muted-foreground text-base">{company.description}</p>
        )}

        {/* Key Capabilities */}
        <div className="mt-4">
          <h4 className="text-sm font-semibold flex items-center gap-2 mb-3">
            <Award className="h-4 w-4" />
            Key Capabilities
            {analysis && (
              <Badge variant="outline" className="text-xs">
                AI Analyzed
              </Badge>
            )}
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {(() => {
              let capabilities: string[] = [];

              if (
                analysis?.coreCompetencies &&
                Array.isArray(analysis.coreCompetencies)
              ) {
                capabilities = analysis.coreCompetencies;
              } else if (
                company.ai_competencies &&
                Array.isArray(company.ai_competencies)
              ) {
                capabilities = company.ai_competencies as string[];
              } else if (
                company.ai_capabilities &&
                Array.isArray(company.ai_capabilities)
              ) {
                capabilities = company.ai_capabilities as string[];
              } else if (company.key_capabilities) {
                capabilities = company.key_capabilities
                  .split(",")
                  .map((cap) => cap.trim());
              }

              return capabilities.slice(0, 9).map((capability, index) => (
                <Badge
                  key={index}
                  variant="outline"
                  className="justify-center py-2 px-3 text-center hover:bg-primary/10"
                >
                  {capability}
                </Badge>
              ));
            })()}
          </div>
          {!analysis && company.key_capabilities && (
            <p className="text-xs text-muted-foreground mt-2">
              <span className="text-yellow-600">*</span> Click &quot;Analyze
              Company&quot; to get AI-powered capability insights
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        {/* Contact Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Contact Information
          </h3>

          <div className="space-y-3">
            {company.postcode && (
              <div className="flex items-center gap-3">
                <MapPin className="h-4 w-4 text-primary" />
                <span>{company.postcode}</span>
              </div>
            )}

            {company.website_url && (
              <div className="flex items-center gap-3">
                <Globe className="h-4 w-4 text-primary" />
                <a
                  href={company.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {company.website_url}
                </a>
              </div>
            )}

            {isOwner && isFullCompany(company) ? (
              <>
                {company.contact_email && (
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-primary" />
                    <a
                      href={`mailto:${company.contact_email}`}
                      className="text-primary hover:underline"
                    >
                      {company.contact_email}
                    </a>
                  </div>
                )}

                {company.contact_phone && (
                  <div className="flex items-center gap-3">
                    <Phone className="h-4 w-4 text-primary" />
                    <a
                      href={`tel:${company.contact_phone}`}
                      className="text-primary hover:underline"
                    >
                      {company.contact_phone}
                    </a>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center gap-3 text-muted-foreground">
                <Mail className="h-4 w-4" />
                <span>Contact details available to verified partners</span>
              </div>
            )}

            {isFullCompany(company) && company.companies_house_number && (
              <div className="flex items-center gap-3">
                <Building2 className="h-4 w-4 text-primary" />
                <span>Companies House: {company.companies_house_number}</span>
              </div>
            )}
          </div>
        </div>

        {/* Company Metrics */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Company Metrics
          </h3>

          <div className="space-y-3">
            {company.safety_rating && (
              <div className="border border-border rounded-lg p-4 bg-card hover:bg-accent/5 transition-colors">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground block">
                    Safety Rating
                  </label>
                  <Badge className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-50">
                    {company.safety_rating}
                  </Badge>
                </div>
              </div>
            )}

            {company.digital_maturity && (
              <div className="border border-border rounded-lg p-4 bg-card hover:bg-accent/5 transition-colors">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground block">
                    Digital Maturity
                  </label>
                  <Badge className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-50">
                    {company.digital_maturity}
                  </Badge>
                </div>
              </div>
            )}

            {company.market_position && (
              <div className="border border-border rounded-lg p-4 bg-card hover:bg-accent/5 transition-colors">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground block">
                    Market Position
                  </label>
                  <Badge className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-50">
                    {company.market_position}
                  </Badge>
                </div>
              </div>
            )}

            {company.status && (
              <div className="border border-border rounded-lg p-4 bg-card hover:bg-accent/5 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <label className="text-sm font-medium text-foreground block">
                      Company Status
                    </label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Current operational status
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
              Performance Benchmark
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
                    Analyzing...
                  </>
                ) : analysis ? (
                  "Re-analyze Performance"
                ) : (
                  "Analyze Performance"
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
                    <PolarAngleAxis
                      dataKey="subject"
                      tick={{ fontSize: 11 }}
                    />
                    <PolarRadiusAxis
                      angle={90}
                      domain={[0, 100]}
                      tick={{ fontSize: 9 }}
                    />
                    <Radar
                      name="Performance Score"
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
                    Overall Score:{" "}
                    {analysis?.performanceBenchmark?.overallScore || 0}/100
                  </strong>
                </div>
                <strong className="text-foreground">Executive Summary:</strong>{" "}
                {analysis?.executiveSummary || "No summary available"}
              </div>
            </div>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-muted-foreground border border-dashed border-border rounded-lg bg-muted/30">
              <div className="text-center">
                <Award className="h-16 w-16 mx-auto mb-3 opacity-40" />
                <p className="font-medium mb-1">
                  No Performance Benchmark Available
                </p>
                {isOwner ? (
                  <p className="text-sm">
                    Click &quot;Analyze Performance&quot; to generate your
                    company&apos;s benchmark scores
                  </p>
                ) : (
                  <p className="text-sm">
                    Performance analysis not available for this company
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
        {company.equipment && (
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-3">
              <Wrench className="h-5 w-5" />
              Equipment
            </h3>
            <p className="text-muted-foreground">{company.equipment}</p>
          </div>
        )}

        {company.certifications && (
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-3">
              <FileText className="h-5 w-5" />
              Certifications
            </h3>
            <p className="text-muted-foreground">{company.certifications}</p>
          </div>
        )}

        {company.past_projects && (
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-3">
              <Building2 className="h-5 w-5" />
              Past Projects
            </h3>
            <p className="text-muted-foreground">{company.past_projects}</p>
          </div>
        )}
      </div>
    </div>
  );
}
