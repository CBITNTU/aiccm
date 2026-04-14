"use client";

import { memo } from "react";
import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Award } from "lucide-react";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { CompanyAnalysis } from "./types";

const PerformanceChart = memo(function PerformanceChart({
  data,
  scoreLabel,
}: {
  data: { subject: string; A: number; fullMark: number }[];
  scoreLabel: string;
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
          formatter={(value) => [`${value}/100`, scoreLabel]}
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

interface PerformanceBenchmarkCardProps {
  companyName: string;
  companyAnalysis: CompanyAnalysis | null;
  radarData: { subject: string; A: number; fullMark: number }[];
  isAnalyzing: boolean;
  onAnalyze: () => void;
}

export function PerformanceBenchmarkCard({
  companyName,
  companyAnalysis,
  radarData,
  isAnalyzing,
  onAnalyze,
}: PerformanceBenchmarkCardProps) {
  const t = useTranslations("Dashboard");
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5" />
              {t("performance.title")}
            </CardTitle>
            <CardDescription>
              {t("performance.description", { companyName })}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {companyAnalysis?.performanceBenchmark?.overallScore && (
              <Badge variant="default" className="text-lg px-3 py-1">
                {companyAnalysis.performanceBenchmark.overallScore}/100
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={onAnalyze}
              disabled={isAnalyzing}
            >
              {isAnalyzing
                ? t("performance.analyzing")
                : companyAnalysis
                  ? t("performance.reAnalyze")
                  : t("performance.analyze")}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {companyAnalysis ? (
          <div className="space-y-4">
            <PerformanceChart data={radarData} scoreLabel={t("performance.score")} />
            <div className="text-sm text-muted-foreground p-3 bg-muted rounded-lg border border-border">
              <strong className="text-foreground">
                {t("performance.executiveSummary")}
              </strong>{" "}
              {companyAnalysis?.executiveSummary ||
                t("performance.noSummary")}
            </div>
          </div>
        ) : (
          <div className="h-[250px] flex items-center justify-center text-muted-foreground border border-dashed border-border rounded-lg bg-muted/30">
            <div className="text-center">
              <Award className="h-16 w-16 mx-auto mb-3 opacity-40" />
              <p className="font-medium mb-1">
                {t("performance.emptyTitle")}
              </p>
              <p className="text-sm mb-4">
                {t("performance.emptyDescription")}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
