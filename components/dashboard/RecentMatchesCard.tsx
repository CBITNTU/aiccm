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
import { MatchingTrigger } from "@/components/matching/MatchingTrigger";

interface MatchingResult {
  id: string;
  tender_id: string;
  company_id: string;
  overall_score: number;
  tenders: {
    title: string;
    buyer: string;
    deadline: string;
  };
  companies: {
    company_name: string;
  };
}

interface RecentMatchesCardProps {
  matches: MatchingResult[];
  selectedCompanyName?: string;
  onMatchSelect: (match: MatchingResult) => void;
}

export function RecentMatchesCard({
  matches,
  selectedCompanyName,
  onMatchSelect,
}: RecentMatchesCardProps) {
  const router = useRouter();

  const scoreColor = (score: number) => {
    if (score >= 80) return "bg-green-600 hover:bg-green-700";
    if (score >= 60) return "bg-amber-600 hover:bg-amber-700";
    return "bg-muted-foreground";
  };

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Recent Matches
            </CardTitle>
            <CardDescription>
              {selectedCompanyName
                ? `Latest matches for ${selectedCompanyName}`
                : "Your latest tender matching opportunities"}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <MatchingTrigger />
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
        {matches.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Target className="h-12 w-12 text-muted-foreground/40 mb-3" />
            <p className="font-medium text-muted-foreground mb-1">
              No matches yet
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              Run matching to find tenders that fit your company profile.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {matches.map((match) => (
              <div
                key={match.id}
                className="flex items-center justify-between p-4 border hover:bg-muted/50 transition-colors rounded-2xl cursor-pointer"
                onClick={() => onMatchSelect(match)}
              >
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold truncate">
                    {match.tenders?.title}
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    {match.tenders?.buyer} — Due:{" "}
                    {match.tenders?.deadline
                      ? new Date(match.tenders.deadline).toLocaleDateString()
                      : "N/A"}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="secondary">
                      {match.companies?.company_name}
                    </Badge>
                    <Badge className={scoreColor(match.overall_score)}>
                      {match.overall_score}% Match
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
