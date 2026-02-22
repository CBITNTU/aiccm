"use client";

import { useRouter } from "next/navigation";
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
  const router = useRouter();

  return (
    <Card className="mb-8">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Recent Matches
            </CardTitle>
            <CardDescription>
              {companyName
                ? `Latest matches for ${companyName}`
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
          {matches.map((match) => (
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
                onClick={() => onViewDetails(match)}
              >
                View Details
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
