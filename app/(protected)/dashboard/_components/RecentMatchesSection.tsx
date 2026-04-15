"use client";

import { useRouter } from "next/navigation";
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
import { Clock, Target, ArrowRight } from "lucide-react";
import type { MatchingResult } from "./types";

interface RecentMatchesSectionProps {
  matches: MatchingResult[];
  companyName?: string;
  onViewDetails: (match: MatchingResult) => void;
}

export function RecentMatchesSection({
  matches,
  companyName,
  onViewDetails,
}: RecentMatchesSectionProps) {
  const t = useTranslations("Dashboard");
  const router = useRouter();

  return (
    <Card className="mb-8">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              {t("recentMatches.title")}
            </CardTitle>
            <CardDescription>
              {companyName
                ? t("recentMatches.description", { companyName })
                : t("recentMatches.descriptionFallback")}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="outline"
              onClick={() => router.push("/tenders?tab=matches")}
            >
              <Target className="mr-2 h-4 w-4" />
              {t("recentMatches.runAnalysis")}
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push("/tenders")}
            >
              {t("recentMatches.viewAll")}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {matches.map((match) => (
            <div
              key={match.id}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border hover:bg-muted/50 transition-colors rounded-2xl"
            >
              <div className="flex-1">
                <h4 className="font-semibold">{match.tenders?.title}</h4>
                <p className="text-sm text-muted-foreground">
                  {match.tenders?.buyer} - {t("recentMatches.due")}{" "}
                  {match.tenders?.deadline
                    ? new Date(match.tenders.deadline).toLocaleDateString()
                    : t("recentMatches.notAvailable")}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="secondary">
                    {match.companies?.companyName}
                  </Badge>
                  <Badge
                    variant={
                      (match.overallScore ?? 0) >= 80 ? "default" : "secondary"
                    }
                  >
                    {match.overallScore ?? 0}{t("recentMatches.matchSuffix")}
                  </Badge>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onViewDetails(match)}
                className="self-start sm:self-center flex-shrink-0"
              >
                {t("recentMatches.viewDetails")}
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
