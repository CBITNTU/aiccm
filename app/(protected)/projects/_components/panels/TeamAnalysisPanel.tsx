"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import {
  useRunTeamAnalysis,
  useUpdateTeamAnalysis,
} from "@/hooks/useProjectMutations";
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
  Minus,
  Plus,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import type { TeamAnalysis } from "@/hooks/useProjects";
import type { Tender, TeamMember } from "@/hooks/useProjectDetails";
import type { CompanyRecord as Company } from "@/lib/api/types";
import { deriveCoverage } from "@/lib/utils";

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
  const t = useTranslations("TeamAnalysisPanel");
  const runAnalysis = useRunTeamAnalysis();
  const updateTeamAnalysis = useUpdateTeamAnalysis();
  const [companyCompetencies, setCompanyCompetencies] = useState<string[]>([]);
  const [missingCompetencies, setMissingCompetencies] = useState<string[]>([]);
  const [hasEdits, setHasEdits] = useState(false);

  useEffect(() => {
    if (teamAnalysis) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync local state from prop
      setCompanyCompetencies(teamAnalysis.companyCompetencies || []);
      setMissingCompetencies(teamAnalysis.missingCompetencies || []);
      setHasEdits(false);
    }
  }, [teamAnalysis]);

  const moveToMissing = (index: number) => {
    const item = companyCompetencies[index];
    setCompanyCompetencies((prev) => prev.filter((_, i) => i !== index));
    setMissingCompetencies((prev) => [...prev, item]);
    setHasEdits(true);
  };

  const moveToCompetencies = (index: number) => {
    const item = missingCompetencies[index];
    setMissingCompetencies((prev) => prev.filter((_, i) => i !== index));
    setCompanyCompetencies((prev) => [...prev, item]);
    setHasEdits(true);
  };

  const editedCoverage = deriveCoverage(
    companyCompetencies,
    missingCompetencies,
    teamAnalysis?.coveragePercentage ?? 0,
  );

  const handleSaveEdits = async () => {
    try {
      await updateTeamAnalysis.mutateAsync({
        projectId,
        companyCompetencies,
        missingCompetencies,
      });
      setHasEdits(false);
      toast.success(t("analysisUpdated"));
    } catch {
      toast.error(t("saveFailed"));
    }
  };

  const handleRunAnalysis = async () => {
    if (!company || !tender) {
      toast.error(t("companyTenderRequired"));
      return;
    }

    if (teamMembers.length === 0) {
      toast.error(t("noMembersError"));
      return;
    }

    try {
      toast.info(t("startingAnalysis"));
      const result = await runAnalysis.mutateAsync({
        projectId,
        company,
        tender: {
          title: tender.title,
          description: tender.description,
          buyerName: tender.buyerName || tender.buyer,
          value: tender.value,
          region: tender.region || tender.location,
        },
        teamMembers,
      });

      const gaps = result.teamAnalysis.missingCompetencies?.length || 0;
      const gapSuffix = gaps > 0 ? t("analysisGapSuffix", { gaps }) : t("analysisNoGapSuffix");

      toast.success(
        t("analysisComplete", {
          percentage: Math.round(result.teamAnalysis.coveragePercentage),
          gaps: gapSuffix,
        }),
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("analysisFailed"),
      );
    }
  };

  // No tender linked
  if (!tender) {
    return (
      <div className="py-6 text-center">
        <AlertCircle className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
        <p className="text-muted-foreground">
          {t("noTenderHint")}
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
          {t("noMembersHint")}
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
            {t("runPrompt")}
          </p>
          <Button
            onClick={handleRunAnalysis}
            disabled={runAnalysis.isPending || !company}
          >
            {runAnalysis.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t("analyzing")}
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                {t("runButton")}
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
      {/* Action buttons */}
      <div className="flex justify-end gap-2">
        {hasEdits && (
          <Button
            size="sm"
            onClick={handleSaveEdits}
            disabled={updateTeamAnalysis.isPending}
          >
            {updateTeamAnalysis.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                {t("saveChanges")}
              </>
            )}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={handleRunAnalysis}
          disabled={runAnalysis.isPending || !company}
        >
          {runAnalysis.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {t("rerunning")}
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              {t("rerun")}
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
            <Label className="text-sm text-muted-foreground">
              {t("teamCoverage")}
            </Label>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-3xl font-bold text-green-600">
                {editedCoverage}%
              </span>
              <Badge variant={editedCoverage >= 90 ? "default" : "secondary"}>
                {editedCoverage >= 90
                  ? t("ratingExcellent")
                  : editedCoverage >= 70
                    ? t("ratingGood")
                    : t("ratingNeedsWork")}
              </Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Label className="text-sm text-muted-foreground">
              {t("teamReadiness")}
            </Label>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-3xl font-bold text-green-600">
                {Math.round(teamAnalysis.readinessScore)}%
              </span>
              <Badge
                variant={
                  Math.round(teamAnalysis.readinessScore) >= 85
                    ? "default"
                    : Math.round(teamAnalysis.readinessScore) >= 50
                      ? "secondary"
                      : "outline"
                }
              >
                {Math.round(teamAnalysis.readinessScore) >= 85
                  ? t("readyToBid")
                  : Math.round(teamAnalysis.readinessScore) >= 50
                    ? t("almostReady")
                    : t("ratingNeedsWork")}
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
              <CardTitle className="text-base">
                {t("contributions")}
              </CardTitle>
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

      {/* Combined Competencies with +/- for human intervention */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-yellow-500" />
              {t("combinedCompetencies")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="font-semibold">{t("coveredCompetencies")}</Label>
              <p className="text-xs text-muted-foreground mb-2">
                {t("moveToRemainingHint")}
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                {companyCompetencies.map((comp, idx) => (
                  <Badge
                    key={`c-${idx}`}
                    variant="outline"
                    className="bg-green-500/10 flex items-center gap-1"
                  >
                    {comp}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 p-0 hover:bg-green-500/20"
                      onClick={() => moveToMissing(idx)}
                      title={t("moveToRemaining")}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <Label className="font-semibold text-orange-500">
                {t("remainingGaps")}
              </Label>
              <p className="text-xs text-muted-foreground mb-2">
                {t("moveToCoveredHint")}
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                {missingCompetencies.map((comp, idx) => (
                  <Badge
                    key={`m-${idx}`}
                    variant="outline"
                    className="bg-orange-500/10 border-orange-500/20 flex items-center gap-1"
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 p-0 hover:bg-orange-500/20"
                      onClick={() => moveToCompetencies(idx)}
                      title={t("moveToCovered")}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                    {comp}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Recommendations */}
      {teamAnalysis.recommendations &&
        teamAnalysis.recommendations.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {t("strategicRecs")}
                </CardTitle>
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
                {t("teamRisks")}
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
        {t("lastAnalyzed", { date: new Date(teamAnalysis.analyzedAt).toLocaleString("en-GB") })}
      </p>
    </div>
  );
}
