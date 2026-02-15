"use client";

import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, ArrowRight } from "lucide-react";

interface CompanyAnalysis {
  performanceBenchmark?: {
    overallScore?: number;
    technicalExpertise?: number;
    safetyStandards?: number;
    certifications?: number;
    projectExperience?: number;
  };
  executiveSummary?: string;
}

interface CompanyInsightsCardProps {
  companyId?: string;
  analysis: CompanyAnalysis | null;
  onAnalyze: () => void;
  isAnalyzing: boolean;
}

function scoreColor(score: number) {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-amber-600";
  return "text-muted-foreground";
}

export function CompanyInsightsCard({
  companyId,
  analysis,
  onAnalyze,
  isAnalyzing,
}: CompanyInsightsCardProps) {
  const router = useRouter();
  const benchmark = analysis?.performanceBenchmark;

  const metrics = benchmark
    ? [
        { label: "Technical", value: benchmark.technicalExpertise },
        { label: "Safety", value: benchmark.safetyStandards },
        { label: "Certifications", value: benchmark.certifications },
        { label: "Experience", value: benchmark.projectExperience },
      ].filter((m) => m.value != null)
    : [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Company Insights
          </CardTitle>
          {!benchmark && (
            <Button
              variant="outline"
              size="sm"
              onClick={onAnalyze}
              disabled={isAnalyzing}
            >
              {isAnalyzing ? "Analyzing..." : "Analyze"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {benchmark ? (
          <div className="space-y-4">
            {/* Overall Score */}
            <div className="flex items-center gap-3">
              <Badge variant="default" className="text-lg px-3 py-1">
                {benchmark.overallScore ?? "—"}/100
              </Badge>
              <span className="text-sm text-muted-foreground">Overall Score</span>
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-2 gap-3">
              {metrics.map((m) => (
                <div key={m.label} className="flex justify-between items-center p-2 bg-muted/30 rounded-lg">
                  <span className="text-sm">{m.label}</span>
                  <span className={`text-sm font-semibold ${scoreColor(m.value!)}`}>
                    {m.value}
                  </span>
                </div>
              ))}
            </div>

            {/* Executive Summary (truncated) */}
            {analysis?.executiveSummary && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {analysis.executiveSummary}
              </p>
            )}

            {companyId && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => router.push(`/company/${companyId}`)}
              >
                View Full Analysis
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Sparkles className="h-10 w-10 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">
              Analyze your company to see AI-powered insights
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
