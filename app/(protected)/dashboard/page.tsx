"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, memo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useOrg } from "@/hooks/useOrg";
import { useDashboard } from "@/hooks/useDashboard";
import { useAnalyzeCompany } from "@/hooks/useCompanyMutations";
import { api } from "@/lib/api/client";
import type { Database } from "@/lib/supabase/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  FileText,
  Building2,
  Users,
  Target,
  Clock,
  ArrowRight,
  Award,
} from "lucide-react";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { TenderDetailDialog } from "@/components/TenderDetailDialog";
import { TeamMembersCard } from "@/components/company/TeamMembersCard";

const BusinessChatbot = dynamic(
  () =>
    import("@/components/BusinessChatbot").then((m) => ({ default: m.BusinessChatbot })),
  { ssr: false },
);

type Company = Database["public"]["Tables"]["companies"]["Row"];

interface DashboardStats {
  totalTenders: number;
  matchingResults: number;
  companies: number;
  projects: number;
  recentMatches: MatchingResult[];
}

interface MatchingResult {
  id: string;
  tender_id: string;
  company_id: string;
  overall_score: number;
  capability_score: number;
  experience_score: number;
  location_score: number;
  certification_score: number;
  match_reasons: string[];
  improvement_suggestions: string[];
  ai_analysis: Record<string, unknown>;
  is_bookmarked: boolean;
  is_applied: boolean;
  created_at: string;
  tenders: {
    title: string;
    buyer: string;
    description: string;
    location: string;
    deadline: string;
    budget_min: number;
    budget_max: number;
  };
  companies: {
    company_name: string;
  };
}

const PerformanceChart = memo(function PerformanceChart({
  data,
}: {
  data: { subject: string; A: number; fullMark: number }[];
}) {
  if (data.length === 0) return null;
  return (
    <ResponsiveContainer width="100%" height={250}>
      <RadarChart data={data}>
        <PolarGrid />
        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12 }} />
        <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10 }} />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            color: "hsl(var(--foreground))",
            fontSize: "12px",
          }}
          labelStyle={{ color: "hsl(var(--foreground))" }}
          formatter={(value) => [`${value}/100`, "Score"]}
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
  );
});

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
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { selectedOrg } = useOrg();
  const router = useRouter();
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
  const [selectedMatch, setSelectedMatch] = useState<MatchingResult | null>(
    null,
  );
  // Track a local copy of the company for refreshing after analysis
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
        {
          subject: "Technical Expertise",
          A: companyAnalysis.performanceBenchmark.technicalExpertise || 0,
          fullMark: 100,
        },
        {
          subject: "Safety Standards",
          A: companyAnalysis.performanceBenchmark.safetyStandards || 0,
          fullMark: 100,
        },
        {
          subject: "Innovation",
          A: companyAnalysis.performanceBenchmark.innovation || 0,
          fullMark: 100,
        },
        {
          subject: "Project Experience",
          A: companyAnalysis.performanceBenchmark.projectExperience || 0,
          fullMark: 100,
        },
        {
          subject: "Certifications",
          A: companyAnalysis.performanceBenchmark.certifications || 0,
          fullMark: 100,
        },
        {
          subject: "Market Reputation",
          A: companyAnalysis.performanceBenchmark.marketReputation || 0,
          fullMark: 100,
        },
      ]
    : [];

  // Use enrichedCompany for display (has latest ai_analysis), selectedOrg for ID
  const displayCompany = enrichedCompany ?? selectedOrg;

  // Filter matches by selected org
  const filteredMatches = selectedOrg
    ? stats.recentMatches.filter(
        (match) => match.company_id === selectedOrg.id,
      )
    : stats.recentMatches;

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
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

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card
          className="hover:shadow-lg transition-shadow cursor-pointer"
          onClick={() => router.push("/tenders")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tenders</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalTenders}</div>
            <p className="text-xs text-muted-foreground">
              <span className="text-green-600">+12%</span> from last month
            </p>
          </CardContent>
        </Card>

        <Card
          className="hover:shadow-lg transition-shadow cursor-pointer"
          onClick={() => router.push("/tenders?tab=matches")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Matched Opportunities
            </CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.matchingResults}</div>
            <p className="text-xs text-muted-foreground">
              <span className="text-green-600">+8%</span> from last week
            </p>
          </CardContent>
        </Card>

        <Card
          className="hover:shadow-lg transition-shadow cursor-pointer"
          onClick={() => router.push("/my-company")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">My Company</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.companies}</div>
            <p className="text-xs text-muted-foreground">Active companies</p>
          </CardContent>
        </Card>

        <Card
          className="hover:shadow-lg transition-shadow cursor-pointer"
          onClick={() => router.push("/projects")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Projects Created
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.projects}</div>
            <p className="text-xs text-muted-foreground">Consulting projects</p>
          </CardContent>
        </Card>
      </div>

      {/* Performance Benchmark and Company Overview */}
      {displayCompany && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Performance Benchmark Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Award className="h-5 w-5" />
                    Company Performance Benchmark
                  </CardTitle>
                  <CardDescription>
                    AI-powered assessment of {displayCompany.company_name}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {companyAnalysis?.performanceBenchmark?.overallScore && (
                    <Badge variant="default" className="text-lg px-3 py-1">
                      {companyAnalysis.performanceBenchmark.overallScore}/100
                    </Badge>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchCompanyAnalysis}
                    disabled={isAnalyzing}
                  >
                    {isAnalyzing
                      ? "Analyzing..."
                      : companyAnalysis
                        ? "Re-analyze"
                        : "Analyze"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {companyAnalysis ? (
                <div className="space-y-4">
                  <PerformanceChart data={radarData} />
                  <div className="text-sm text-muted-foreground p-3 bg-muted rounded-lg border border-border">
                    <strong className="text-foreground">
                      Executive Summary:
                    </strong>{" "}
                    {companyAnalysis?.executiveSummary ||
                      "No summary available"}
                  </div>
                </div>
              ) : (
                <div className="h-[250px] flex items-center justify-center text-muted-foreground border border-dashed border-border rounded-lg bg-muted/30">
                  <div className="text-center">
                    <Award className="h-16 w-16 mx-auto mb-3 opacity-40" />
                    <p className="font-medium mb-1">
                      No Performance Benchmark Available
                    </p>
                    <p className="text-sm mb-4">
                      Click &quot;Analyze&quot; to generate your company&apos;s
                      performance benchmark
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Company Overview Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Company Overview
              </CardTitle>
              <CardDescription>
                Key information and business insights
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                  <span className="text-sm font-medium">Company Name</span>
                  <span className="text-sm">
                    {displayCompany.company_name}
                  </span>
                </div>

                {displayCompany.safety_rating && (
                  <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                    <span className="text-sm font-medium">Safety Rating</span>
                    <Badge
                      variant="default"
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {displayCompany.safety_rating}
                    </Badge>
                  </div>
                )}

                {displayCompany.market_position && (
                  <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                    <span className="text-sm font-medium">Market Position</span>
                    <span className="text-sm">
                      {displayCompany.market_position}
                    </span>
                  </div>
                )}

                {/* Financial Data */}
                {displayCompany.financial_data &&
                  Object.keys(
                    displayCompany.financial_data as Record<string, unknown>,
                  ).length > 0 && (
                    <>
                      <Separator className="my-2" />
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold">
                          Financial Information
                        </h4>
                        {Object.entries(
                          displayCompany.financial_data as Record<
                            string,
                            { value: number | string }
                          >,
                        )
                          .slice(0, 5)
                          .map(([key, field]) => (
                            <div
                              key={key}
                              className="flex justify-between items-center p-3 bg-muted/30 rounded-lg"
                            >
                              <span className="text-sm font-medium capitalize">
                                {key.replace(/([A-Z])/g, " $1").trim()}
                              </span>
                              <span className="text-sm font-semibold">
                                {typeof field.value === "number"
                                  ? `£${field.value.toLocaleString()}`
                                  : field.value || "N/A"}
                              </span>
                            </div>
                          ))}
                      </div>
                    </>
                  )}

                <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                  <span className="text-sm font-medium">Status</span>
                  <Badge
                    variant={
                      displayCompany.status === "active"
                        ? "default"
                        : "secondary"
                    }
                    className={
                      displayCompany.status === "active"
                        ? "bg-emerald-600 hover:bg-emerald-700"
                        : "bg-orange-600 hover:bg-orange-700"
                    }
                  >
                    {displayCompany.status
                      ? displayCompany.status.charAt(0).toUpperCase() +
                        displayCompany.status.slice(1)
                      : "Active"}
                  </Badge>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => router.push("/profile")}
                  >
                    View Profile
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => router.push("/directory")}
                  >
                    Browse Directory
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Team Members Section */}
      {selectedOrg && (
        <div className="mb-8">
          <TeamMembersCard companyId={selectedOrg.id} variant="compact" />
        </div>
      )}

      {/* Recent Matches - Filter by selected company */}
      {filteredMatches.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Recent Matches
                </CardTitle>
                <CardDescription>
                  {selectedOrg
                    ? `Latest matches for ${selectedOrg.company_name}`
                    : "Your latest tender matching opportunities"}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => router.push("/tenders?tab=matches")}
                >
                  <Target className="mr-2 h-4 w-4" />
                  Run Analysis
                </Button>
                <Button
                  variant="outline"
                  onClick={() => router.push("/tenders")}
                >
                  View All
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredMatches.map((match) => (
                <div
                  key={match.id}
                  className="flex items-center justify-between p-4 border hover:bg-muted/50 transition-colors rounded-2xl"
                >
                  <div className="flex-1">
                    <h4 className="font-semibold">{match.tenders?.title}</h4>
                    <p className="text-sm text-muted-foreground">
                      {match.tenders?.buyer} - Due:{" "}
                      {match.tenders?.deadline
                        ? new Date(match.tenders.deadline).toLocaleDateString()
                        : "N/A"}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="secondary">
                        {match.companies?.company_name}
                      </Badge>
                      <Badge
                        variant={
                          match.overall_score >= 80 ? "default" : "secondary"
                        }
                      >
                        {match.overall_score}% Match
                      </Badge>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedMatch(match);
                      setDialogOpen(true);
                    }}
                  >
                    View Details
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card
          className="hover:shadow-lg transition-shadow cursor-pointer"
          onClick={() => router.push("/directory")}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Building2 className="h-5 w-5" />
              Manage Companies
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Update your company profiles and capabilities
            </p>
          </CardContent>
        </Card>

        <Card
          className="hover:shadow-lg transition-shadow cursor-pointer"
          onClick={() => router.push("/tenders")}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5" />
              Browse Tenders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Discover new tender opportunities
            </p>
          </CardContent>
        </Card>

        <Card
          className="hover:shadow-lg transition-shadow cursor-pointer"
          onClick={() => router.push("/projects")}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5" />
              Partnerships
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Build consulting teams and partnerships
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tender Detail Dialog */}
      {selectedMatch && (
        <TenderDetailDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          result={selectedMatch}
          companyId={selectedOrg?.id}
        />
      )}

      {/* Business Chatbot */}
      <BusinessChatbot
        companyData={
          selectedOrg
            ? {
                company_name: selectedOrg.company_name || undefined,
                description: selectedOrg.description || undefined,
                key_capabilities: Array.isArray(
                  selectedOrg.key_capabilities,
                )
                  ? selectedOrg.key_capabilities.join(", ")
                  : undefined,
                certifications: Array.isArray(selectedOrg.certifications)
                  ? selectedOrg.certifications.join(", ")
                  : undefined,
                equipment: Array.isArray(selectedOrg.equipment)
                  ? selectedOrg.equipment.join(", ")
                  : undefined,
              }
            : undefined
        }
      />
    </div>
  );
}
