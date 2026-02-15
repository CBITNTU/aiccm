"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

interface CompanyDetailModalProps {
  company: (PublicCompany | Company) | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  readOnly?: boolean;
}

export function CompanyDetailModal({
  company,
  open,
  onOpenChange,
  readOnly = false,
}: CompanyDetailModalProps) {
  const { user } = useAuth();
  const [analysis, setAnalysis] = useState<CompanyAnalysis | null>(null);
  const analyzeMutation = useAnalyzeCompany();
  const loadingAnalysis = analyzeMutation.isPending;

  // Check if the current user owns this company
  const isOwner = user?.id === company?.user_id;

  // Type guard to check if company has all fields (is full Company type)
  const isFullCompany = (
    comp: PublicCompany | Company | null,
  ): comp is Company => {
    return comp !== null && "contact_email" in comp;
  };

  // Move conditional logic after hooks
  const fetchAnalysis = async () => {
    if (!company?.id || loadingAnalysis) return;

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

  const loadStoredAnalysis = () => {
    if (company?.ai_analysis) {
      setAnalysis(company.ai_analysis as unknown as CompanyAnalysis);
    } else {
      setAnalysis(null);
    }
  };

  useEffect(() => {
    if (open && company?.id) {
      // Always try to load stored analysis first
      loadStoredAnalysis();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: run when open/company.id change
  }, [open, company?.id]);

  // Return null after all hooks are called
  if (!company) return null;

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex justify-between items-start mb-2">
            <DialogTitle className="text-2xl">
              {company.company_name}
            </DialogTitle>
            <div className="flex items-center gap-2">
              {analysis?.performanceBenchmark?.overallScore && (
                <Badge variant="default" className="text-lg px-3 py-1">
                  {analysis.performanceBenchmark.overallScore}/100
                </Badge>
              )}
              {company.user_id ? (
                <Badge className="gap-1 border-0 bg-green-600 text-white dark:bg-green-600 dark:text-white">
                  <BadgeCheck className="h-3 w-3" />
                  Verified
                </Badge>
              ) : company.is_system_company ? (
                <Badge className="gap-1 border-0 bg-primary text-white dark:bg-primary dark:text-white">
                  <Sparkles className="h-3 w-3" />
                  AI Generated
                </Badge>
              ) : null}
            </div>
          </div>
          {company.description && (
            <DialogDescription className="text-base">
              {company.description}
            </DialogDescription>
          )}

          {/* Key Capabilities - AI-powered keywords */}
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
                // Use AI-generated capabilities if available, otherwise fall back to manual
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
                } else {
                  capabilities = [];
                }

                return capabilities.slice(0, 9).map((capability, index) => (
                  <Badge
                    key={index}
                    variant="outline"
                    className="justify-center py-2 px-3 text-center hover:bg-primary/10"
                  >
                    {typeof capability === "string" ? capability : capability}
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
        </DialogHeader>

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

              {/* Only show sensitive contact info to company owners and if we have full company data */}
              {isOwner && isFullCompany(company) ? (
                <>
                  {company.contact_email && (
                    <div className="flex items-center gap-3">
                      <Mail className="h-4 w-4 text-primary" />
                      <a
                        href={`mailto:${company.contact_email}`}
                        className="text-primary hover:underline"
                        onClick={(e) => e.stopPropagation()}
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
                        onClick={(e) => e.stopPropagation()}
                      >
                        {company.contact_phone}
                      </a>
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
                        onClick={(e) => e.stopPropagation()}
                      >
                        {company.website_url}
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

          {/* Company Metrics - Clean Professional Design */}
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
                    <p className="text-sm text-green-700 dark:text-green-300 font-medium leading-relaxed break-words">
                      {company.safety_rating}
                    </p>
                  </div>
                </div>
              )}

              {company.digital_maturity && (
                <div className="border border-border rounded-lg p-4 bg-card hover:bg-accent/5 transition-colors">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground block">
                      Digital Maturity
                    </label>
                    <p className="text-sm text-blue-700 dark:text-blue-300 font-medium leading-relaxed break-words">
                      {company.digital_maturity}
                    </p>
                  </div>
                </div>
              )}

              {company.market_position && (
                <div className="border border-border rounded-lg p-4 bg-card hover:bg-accent/5 transition-colors">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground block">
                      Market Position
                    </label>
                    <p className="text-sm text-muted-foreground leading-relaxed break-words">
                      {company.market_position}
                    </p>
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
                      <div
                        className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium ${
                          company.status === "active"
                            ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                            : "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                        }`}
                      >
                        {company.status.charAt(0).toUpperCase() +
                          company.status.slice(1)}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Performance Analysis Chart */}
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
                  <strong className="text-foreground">
                    Executive Summary:
                  </strong>{" "}
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
      </DialogContent>
    </Dialog>
  );
}
