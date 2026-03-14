"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
import type { Tender, TeamMember } from "@/hooks/useProjectDetails";
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
  tenderMatchResult: {
    overall_score: number | null;
    capability_score: number | null;
    experience_score: number | null;
    location_score: number | null;
    certification_score: number | null;
    match_reasons: string[] | null;
    ai_analysis: { score_explanations?: Record<string, string> } | null;
  } | null;
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
      const t = setTimeout(dismissHint, 5000);
      return () => clearTimeout(t);
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
      toast.success("Gap analysis updated");
      if (movedToYours.length > 0) {
        setShowAddToProfileCard(true);
      }
    } catch {
      toast.error("Failed to save changes");
    }
  };

  const handleAddToCompanyProfile = async () => {
    if (!company) return;
    const existing = company.key_capabilities ?? "";
    const existingLines = existing
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const toAdd = movedToYours.filter(
      (c) => !existingLines.some((l) => l.toLowerCase() === c.toLowerCase()),
    );
    if (toAdd.length === 0) {
      toast.info("All competencies already in profile");
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
        updates: { key_capabilities: updated },
      });
      toast.success("Company profile updated");
      setMovedToYours([]);
      setShowAddToProfileCard(false);
    } catch {
      toast.error("Failed to update company profile");
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
      toast.error("Company and tender required for gap analysis");
      return;
    }

    try {
      toast.info("Starting gap analysis...");
      const result = await runAnalysis.mutateAsync({
        projectId,
        company,
        tenderId: tender.id,
      });

      const gaps = result.gapAnalysis.missingCompetencies?.length || 0;
      const partnerCount = result.recommendedPartners.length;

      toast.success(
        `Gap analysis complete! Coverage: ${Math.round(result.gapAnalysis.coveragePercentage)}%, ${gaps} gaps, ${partnerCount} partners recommended`,
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to run gap analysis",
      );
    }
  };

  // No tender linked
  if (!tender) {
    return (
      <div className="py-6 text-center">
        <AlertCircle className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
        <p className="text-muted-foreground">
          Link a tender to run gap analysis
        </p>
      </div>
    );
  }

  // Analysis not yet run: show Run Gap Analysis (solo can run to see results; with partners same)
  if (!gapAnalysis) {
    return (
      <div className="py-6">
        {isSolo && tenderMatchResult?.overall_score != null && (
          <div className="mb-4 p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
            Your tender match for this company and tender:{" "}
            <strong>{Math.round(tenderMatchResult.overall_score)}%</strong>. Run
            gap analysis below to see competency-level breakdown.
          </div>
        )}
        <div className="text-center mb-4">
          <p className="text-muted-foreground mb-4">
            Run AI-powered gap analysis to identify missing competencies and
            find recommended partners
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
                Run Gap Analysis
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
              Unsaved changes
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
                  Save changes
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

        {/* Coverage Score */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
        >
          <div className="flex justify-between text-sm mb-2">
            <span>Overall Coverage</span>
            <span className="font-medium">{editedCoverage}%</span>
          </div>
          <Progress value={editedCoverage} className="h-2" />
          <div className="flex justify-between mt-2 text-sm text-muted-foreground">
            <span>
              Analyzed:{" "}
              {new Date(gapAnalysis.analyzedAt).toLocaleDateString("en-GB")}
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
                <span className="font-medium">Tip:</span> Hover any competency
                and click the arrow to move it between columns.
              </p>
              <button
                onClick={dismissHint}
                className="ml-1 shrink-0 rounded p-0.5 text-blue-400 hover:text-blue-600 focus:outline-none"
                aria-label="Dismiss tip"
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
              Your Competencies ({companyCompetencies.length})
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
                            aria-label="Move to Missing"
                          >
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          <p>Move to Missing</p>
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
              Missing ({missingCompetencies.length})
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
                          aria-label="Move to Your Competencies"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="left">
                        <p>Move to Your Competencies</p>
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
              Add to {company.company_name}&apos;s profile?
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
                  "Add to Profile"
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowAddToProfileCard(false)}
              >
                Skip
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
              Identified Risks
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
                Recommendations
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
              <span className="font-medium">{recommendedPartners.length}</span>{" "}
              partner companies recommended based on missing competencies.
              <span className="text-muted-foreground ml-1">
                View them in the Team Builder panel.
              </span>
            </p>
          </motion.div>
        )}
      </div>
    </TooltipProvider>
  );
}
