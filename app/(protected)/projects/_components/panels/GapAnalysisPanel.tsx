"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import {
  useRunGapAnalysis,
  useUpdateGapAnalysis,
} from "@/hooks/useProjectMutations";
import { useUpdateCompany } from "@/hooks/useCompanyMutations";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Lightbulb,
  AlertCircle,
  Save,
  ChevronRight,
  ChevronLeft,
  X,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import type {
  GapAnalysis,
  RecommendedPartner,
  TeamAnalysis,
} from "@/hooks/useProjects";
import type { Tender, TeamMember, TenderMatchResult } from "@/hooks/useProjectDetails";
import type { CompanyRecord as Company } from "@/lib/api/types";
import { deriveCoverage } from "@/lib/utils";

interface GapAnalysisPanelProps {
  projectId: string;
  tender: Tender | null;
  company: Company | null;
  teamMembers: TeamMember[];
  gapAnalysis: GapAnalysis | null;
  recommendedPartners: RecommendedPartner[];
  teamAnalysis?: TeamAnalysis | null;
  /** When team is only lead (no partners), gap is derived from tender match. */
  tenderMatchResult: TenderMatchResult | null;
}

export function GapAnalysisPanel({
  projectId,
  tender,
  company,
  teamMembers,
  gapAnalysis,
  recommendedPartners,
  teamAnalysis,
  tenderMatchResult,
}: GapAnalysisPanelProps) {
  const t = useTranslations("GapAnalysisPanel");
  const isSolo = teamMembers.length <= 1;
  const runAnalysis = useRunGapAnalysis();
  const updateGapAnalysis = useUpdateGapAnalysis();
  const updateCompany = useUpdateCompany();
  const [companyCompetencies, setCompanyCompetencies] = useState<string[]>([]);
  const [missingCompetencies, setMissingCompetencies] = useState<string[]>([]);
  const [hasEdits, setHasEdits] = useState(false);
  const [movedToYours, setMovedToYours] = useState<string[]>([]);
  const [showAddToProfileCard, setShowAddToProfileCard] = useState(false);
  const lastAnalyzedAtRef = useRef<string | null>(null);

  const HINT_KEY = "gap-analysis-hint-seen-2";
  const [showHint, setShowHint] = useState(false);
  const hintInitializedRef = useRef(false);

  useEffect(() => {
    if (gapAnalysis) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync local state from prop
      setCompanyCompetencies(gapAnalysis.companyCompetencies || []);
      setMissingCompetencies(gapAnalysis.missingCompetencies || []);
      setHasEdits(false);

      // Only reset "add to profile" state when a brand-new AI analysis arrives.
      // Edit saves do not change analyzedAt, so movedToYours/showAddToProfileCard
      // survive the post-save refetch and the card can display correctly.
      if (gapAnalysis.analyzedAt !== lastAnalyzedAtRef.current) {
        lastAnalyzedAtRef.current = gapAnalysis.analyzedAt;
        setMovedToYours([]);
        setShowAddToProfileCard(false);
      }
    }
  }, [gapAnalysis]);

  const dismissHint = () => {
    setShowHint(false);
    localStorage.setItem(HINT_KEY, "true");
  };

  useEffect(() => {
    if (!gapAnalysis || hintInitializedRef.current) return;
    hintInitializedRef.current = true;
    if (localStorage.getItem(HINT_KEY) !== "true") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: show hint once on first mount
      setShowHint(true);
      const timer = setTimeout(dismissHint, 5000);
      return () => clearTimeout(timer);
    }
  }, [gapAnalysis]);

  const moveToMissing = (index: number) => {
    dismissHint();
    const item = companyCompetencies[index];
    setCompanyCompetencies((prev) => prev.filter((_, i) => i !== index));
    setMissingCompetencies((prev) => [item, ...prev]);
    setHasEdits(true);
    setMovedToYours((prev) => prev.filter((c) => c !== item));
  };

  const moveToCompetencies = (index: number) => {
    dismissHint();
    const item = missingCompetencies[index];
    setMissingCompetencies((prev) => prev.filter((_, i) => i !== index));
    setCompanyCompetencies((prev) => [item, ...prev]);
    setHasEdits(true);
    setMovedToYours((prev) => [...prev, item]);
  };

  const editedCoverage = deriveCoverage(
    companyCompetencies,
    missingCompetencies,
    gapAnalysis?.coveragePercentage ?? 0,
  );

  const handleSaveEdits = async () => {
    try {
      await updateGapAnalysis.mutateAsync({
        projectId,
        companyCompetencies,
        missingCompetencies,
      });
      setHasEdits(false);
      toast.success(t("analysisUpdated"));
      if (movedToYours.length > 0) {
        setShowAddToProfileCard(true);
      }
    } catch {
      toast.error(t("saveFailed"));
    }
  };

  const handleAddToCompanyProfile = async () => {
    if (!company) return;
    const existing = company.keyCapabilities ?? "";
    const existingLines = existing
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const toAdd = movedToYours.filter(
      (c) => !existingLines.some((l) => l.toLowerCase() === c.toLowerCase()),
    );
    if (toAdd.length === 0) {
      toast.info(t("allInProfile"));
      setMovedToYours([]);
      setShowAddToProfileCard(false);
      return;
    }
    const updated = existingLines.length
      ? `${existing}\n${toAdd.join("\n")}`
      : toAdd.join("\n");
    try {
      await updateCompany.mutateAsync({
        companyId: company.id,
        updates: { keyCapabilities: updated },
      });
      toast.success(t("profileUpdated"));
      setMovedToYours([]);
      setShowAddToProfileCard(false);
    } catch {
      toast.error(t("profileUpdateFailed"));
    }
  };

  const attributeCompetency = (comp: string): string | null => {
    if (isSolo || !teamAnalysis) return null;
    for (const member of teamAnalysis.teamMembers) {
      if (member.contribution.includes(comp)) {
        return member.companyName;
      }
    }
    return null;
  };

  const handleRunAnalysis = async () => {
    if (!company || !tender) {
      toast.error(t("companyTenderRequired"));
      return;
    }

    try {
      toast.info(t("startingAnalysis"));
      const result = await runAnalysis.mutateAsync({
        projectId,
        company,
        tenderId: tender.id,
      });

      const gaps = result.gapAnalysis.missingCompetencies?.length || 0;
      const partnerCount = result.recommendedPartners.length;

      toast.success(
        t("analysisComplete", {
          percentage: Math.round(result.gapAnalysis.coveragePercentage),
          gaps,
          partners: partnerCount,
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

  // Analysis not yet run: show Run Gap Analysis (solo can run to see results; with partners same)
  if (!gapAnalysis) {
    return (
      <div className="py-6">
        {isSolo && tenderMatchResult?.overallScore != null && (
          <div className="mb-4 p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
            {t("matchScore", { score: Math.round(tenderMatchResult.overallScore) })}
          </div>
        )}
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
    <TooltipProvider delayDuration={300}>
      <div className="py-4 space-y-6">
        {/* Action buttons */}
        <div className="flex items-center justify-end gap-2">
          {hasEdits && (
            <span className="text-xs text-muted-foreground flex items-center gap-1 mr-auto">
              <AlertCircle className="h-3 w-3" />
              {t("unsavedChanges")}
            </span>
          )}
          {hasEdits && (
            <Button
              size="sm"
              onClick={handleSaveEdits}
              disabled={updateGapAnalysis.isPending}
            >
              {updateGapAnalysis.isPending ? (
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

        {/* Coverage Score */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
        >
          <div className="flex justify-between text-sm mb-2">
            <span>{t("overallCoverage")}</span>
            <span className="font-medium">{editedCoverage}%</span>
          </div>
          <Progress value={editedCoverage} className="h-2" />
          <div className="flex justify-between mt-2 text-sm text-muted-foreground">
            <span>
              {t("analyzed", { date: new Date(gapAnalysis.analyzedAt).toLocaleDateString("en-GB") })}
            </span>
          </div>
        </motion.div>

        {/* Discoverability hint banner */}
        <AnimatePresence>
          {showHint && (
            <motion.div
              key="gap-hint"
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="flex items-center gap-2.5 rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-2.5 text-sm text-blue-700"
            >
              <span className="relative flex h-2 w-2 shrink-0">
                <motion.span
                  className="absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"
                  animate={{ scale: [1, 1.8, 1], opacity: [0.75, 0, 0.75] }}
                  transition={{
                    duration: 1.8,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
              </span>
              <p className="flex-1 leading-snug">
                <span className="font-medium">{t("tipLabel")}</span> {t("tipText")}
              </p>
              <button
                onClick={dismissHint}
                className="ml-1 shrink-0 rounded p-0.5 text-blue-400 hover:text-blue-600 focus:outline-none"
                aria-label={t("dismissTip")}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Competencies Grid */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          {/* Your Competencies */}
          <div>
            <h4 className="font-medium mb-3 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              {t("yourCompetencies", { count: companyCompetencies.length })}
            </h4>
            <div className="space-y-0.5 max-h-48 overflow-y-auto">
              <AnimatePresence initial={false}>
                {companyCompetencies.map((comp, idx) => {
                  const attribution = attributeCompetency(comp);
                  return (
                    <motion.div
                      key={comp}
                      layout
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: 16 }}
                      transition={{ duration: 0.15 }}
                      className="group relative flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 cursor-default"
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm">{comp}</span>
                        {attribution && (
                          <div className="text-xs text-muted-foreground">
                            {attribution}
                          </div>
                        )}
                      </div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-25 group-hover:opacity-100 transition-opacity duration-150 shrink-0"
                            onClick={() => moveToMissing(idx)}
                            aria-label={t("moveToMissing")}
                          >
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          <p>{t("moveToMissing")}</p>
                        </TooltipContent>
                      </Tooltip>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>

          {/* Missing Competencies */}
          <div>
            <h4 className="font-medium mb-3 flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-600" />
              {t("missing", { count: missingCompetencies.length })}
            </h4>
            <div className="space-y-0.5 max-h-48 overflow-y-auto">
              <AnimatePresence initial={false}>
                {missingCompetencies.map((comp, idx) => (
                  <motion.div
                    key={comp}
                    layout
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.15 }}
                    className="group relative flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 cursor-default"
                  >
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-25 group-hover:opacity-100 transition-opacity duration-150 shrink-0"
                          onClick={() => moveToCompetencies(idx)}
                          aria-label={t("moveToYours")}
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="left">
                        <p>{t("moveToYours")}</p>
                      </TooltipContent>
                    </Tooltip>
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                    <span className="text-sm flex-1">{comp}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>

        {/* Add to Company Profile card */}
        {showAddToProfileCard && movedToYours.length > 0 && company && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm"
          >
            <p className="font-medium mb-2">
              {t("addToProfilePrompt", { company: company.companyName })}
            </p>
            <ul className="mb-3 space-y-1 text-muted-foreground">
              {movedToYours.map((c, i) => (
                <li key={i}>• {c}</li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleAddToCompanyProfile}
                disabled={updateCompany.isPending}
              >
                {updateCompany.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  t("addToProfile")
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowAddToProfileCard(false)}
              >
                {t("skip")}
              </Button>
            </div>
          </motion.div>
        )}

        {/* Risks */}
        {gapAnalysis.risks && gapAnalysis.risks.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <h4 className="font-medium mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              {t("identifiedRisks")}
            </h4>
            <ul className="space-y-2">
              {gapAnalysis.risks.map((risk, idx) => (
                <li
                  key={idx}
                  className="text-sm text-muted-foreground pl-3 border-l-2 border-yellow-300"
                >
                  {risk}
                </li>
              ))}
            </ul>
          </motion.div>
        )}

        {/* Recommendations */}
        {gapAnalysis.recommendations &&
          gapAnalysis.recommendations.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-blue-600" />
                {t("recommendations")}
              </h4>
              <ul className="space-y-2">
                {gapAnalysis.recommendations.map((rec, idx) => (
                  <li
                    key={idx}
                    className="text-sm text-muted-foreground pl-3 border-l-2 border-blue-300"
                  >
                    {rec}
                  </li>
                ))}
              </ul>
            </motion.div>
          )}

        {/* Recommended Partners Count */}
        {recommendedPartners.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="p-3 bg-muted/50 rounded-lg"
          >
            <p className="text-sm">
              {t("partnersRecommended", { n: recommendedPartners.length })}
              <span className="text-muted-foreground ml-1">
                {t("viewTeamBuilder")}
              </span>
            </p>
          </motion.div>
        )}
      </div>
    </TooltipProvider>
  );
}
