"use client";

import { motion } from "framer-motion";
import { useRunTeamAnalysis } from "@/hooks/useProjectMutations";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  RefreshCw,
  Loader2,
  Crown,
  Lightbulb,
  AlertTriangle,
  AlertCircle,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import type { TeamAnalysis } from "@/hooks/useProjects";
import type { Tender, TeamMember } from "@/hooks/useProjectDetails";
import type { Database } from "@/lib/supabase/types";

type Company = Database["public"]["Tables"]["companies"]["Row"];

interface TeamAnalysisPanelProps {
  projectId: string;
  tender: Tender | null;
  company: Company | null;
  teamMembers: TeamMember[];
  teamAnalysis: TeamAnalysis | null;
}

export function TeamAnalysisPanel({
  projectId,
  tender,
  company,
  teamMembers,
  teamAnalysis,
}: TeamAnalysisPanelProps) {
  const runAnalysis = useRunTeamAnalysis();

  const handleRunAnalysis = async () => {
    if (!company || !tender) {
      toast.error("Company and tender required for team analysis");
      return;
    }

    if (teamMembers.length === 0) {
      toast.error("Add team members before running team analysis");
      return;
    }

    try {
      toast.info("Starting team analysis...");
      const result = await runAnalysis.mutateAsync({
        projectId,
        company,
        tender: {
          title: tender.title,
          description: tender.description,
          buyer_name: tender.buyer_name || tender.buyer,
          value: tender.value,
          region: tender.region || tender.location,
        },
        teamMembers,
      });

      const gaps = result.teamAnalysis.missingCompetencies?.length || 0;

      toast.success(
        `Team analysis complete! Coverage: ${result.teamAnalysis.coveragePercentage}%` +
          (gaps > 0 ? `, ${gaps} remaining gaps` : ", no gaps!")
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to run team analysis"
      );
    }
  };

  // No tender linked
  if (!tender) {
    return (
      <div className="py-6 text-center">
        <AlertCircle className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
        <p className="text-muted-foreground">
          Link a tender to run team analysis
        </p>
      </div>
    );
  }

  // No team members
  if (teamMembers.length === 0) {
    return (
      <div className="py-6 text-center">
        <Users className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
        <p className="text-muted-foreground">
          Add team members before running team analysis
        </p>
      </div>
    );
  }

  // Analysis not yet run
  if (!teamAnalysis) {
    return (
      <div className="py-6">
        <div className="text-center mb-4">
          <p className="text-muted-foreground mb-4">
            Run AI-powered team analysis to evaluate your consortium&apos;s
            combined capabilities against the tender requirements
          </p>
          <Button
            onClick={handleRunAnalysis}
            disabled={runAnalysis.isPending || !company}
          >
            {runAnalysis.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Run Team Analysis
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // Show analysis results
  return (
    <div className="py-4 space-y-6">
      {/* Action button */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={handleRunAnalysis}
          disabled={runAnalysis.isPending || !company}
        >
          {runAnalysis.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Re-analyzing...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              Re-run Analysis
            </>
          )}
        </Button>
      </div>

      {/* Score Cards */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="grid grid-cols-2 gap-4"
      >
        <Card>
          <CardContent className="pt-6">
            <Label className="text-sm text-muted-foreground">Team Coverage</Label>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-3xl font-bold text-green-600">
                {teamAnalysis.coveragePercentage}%
              </span>
              <Badge
                variant={
                  teamAnalysis.coveragePercentage >= 90 ? "default" : "secondary"
                }
              >
                {teamAnalysis.coveragePercentage >= 90
                  ? "Excellent"
                  : teamAnalysis.coveragePercentage >= 70
                    ? "Good"
                    : "Needs Work"}
              </Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Label className="text-sm text-muted-foreground">Team Readiness</Label>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-3xl font-bold text-green-600">
                {teamAnalysis.readinessScore}%
              </span>
              <Badge
                variant={
                  teamAnalysis.readinessScore >= 85 ? "default" : "secondary"
                }
              >
                {teamAnalysis.readinessScore >= 85
                  ? "Ready to Bid"
                  : "Almost Ready"}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Team Member Contributions */}
      {teamAnalysis.teamMembers && teamAnalysis.teamMembers.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Team Member Contributions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {teamAnalysis.teamMembers.map((member, idx) => (
                <div key={idx} className="border rounded-lg p-3">
                  <div className="font-semibold text-sm mb-2 flex items-center gap-2">
                    {idx === 0 && <Crown className="h-4 w-4 text-yellow-500" />}
                    {member.companyName}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {member.contribution.map((contrib, cIdx) => (
                      <Badge key={cIdx} variant="outline" className="text-xs">
                        {contrib}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Combined Competencies */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-yellow-500" />
              Combined Team Competencies
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="font-semibold">Covered Competencies</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {teamAnalysis.companyCompetencies.map((comp, idx) => (
                  <Badge key={idx} variant="outline" className="bg-green-500/10">
                    {comp}
                  </Badge>
                ))}
              </div>
            </div>

            {teamAnalysis.missingCompetencies &&
              teamAnalysis.missingCompetencies.length > 0 && (
                <div>
                  <Label className="font-semibold text-orange-500">
                    Remaining Gaps
                  </Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {teamAnalysis.missingCompetencies.map((comp, idx) => (
                      <Badge
                        key={idx}
                        variant="outline"
                        className="bg-orange-500/10 border-orange-500/20"
                      >
                        {comp}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Recommendations */}
      {teamAnalysis.recommendations && teamAnalysis.recommendations.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Strategic Recommendations</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {teamAnalysis.recommendations.map((rec, idx) => (
                  <li
                    key={idx}
                    className="text-sm text-muted-foreground flex items-start gap-2"
                  >
                    <span className="text-primary mt-1">-</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Risks */}
      {teamAnalysis.risks && teamAnalysis.risks.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 text-red-500">
                <AlertTriangle className="h-4 w-4" />
                Team Risks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {teamAnalysis.risks.map((risk, idx) => (
                  <li
                    key={idx}
                    className="text-sm text-muted-foreground flex items-start gap-2"
                  >
                    <span className="text-red-500 mt-1">-</span>
                    <span>{risk}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Analysis timestamp */}
      <p className="text-xs text-muted-foreground text-right">
        Last analyzed:{" "}
        {new Date(teamAnalysis.analyzedAt).toLocaleString("en-GB")}
      </p>
    </div>
  );
}
