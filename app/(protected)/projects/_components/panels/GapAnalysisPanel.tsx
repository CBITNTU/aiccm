"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  useRunGapAnalysis,
  useUpdateGapAnalysis,
} from "@/hooks/useProjectMutations";
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
  Minus,
  Plus,
  Save,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { GapAnalysis, RecommendedPartner } from "@/hooks/useProjects";
import type { Tender, TeamMember } from "@/hooks/useProjectDetails";
import type { Database } from "@/lib/supabase/types";
import { deriveCoverage } from "@/lib/utils";

type Company = Database["public"]["Tables"]["companies"]["Row"];

interface GapAnalysisPanelProps {
  projectId: string;
  tender: Tender | null;
  company: Company | null;
  teamMembers: TeamMember[];
  gapAnalysis: GapAnalysis | null;
  recommendedPartners: RecommendedPartner[];
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
  tenderMatchResult,
}: GapAnalysisPanelProps) {
  const isSolo = teamMembers.length <= 1;
  const runAnalysis = useRunGapAnalysis();
  const updateGapAnalysis = useUpdateGapAnalysis();
  const [companyCompetencies, setCompanyCompetencies] = useState<string[]>([]);
  const [missingCompetencies, setMissingCompetencies] = useState<string[]>([]);
  const [hasEdits, setHasEdits] = useState(false);
  const [showEditHintDialog, setShowEditHintDialog] = useState(false);

  useEffect(() => {
    if (gapAnalysis) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync local state from prop
      setCompanyCompetencies(gapAnalysis.companyCompetencies || []);
      setMissingCompetencies(gapAnalysis.missingCompetencies || []);
      setHasEdits(false);
    }
  }, [gapAnalysis]);

  const moveToMissing = (index: number) => {
    const item = companyCompetencies[index];
    setCompanyCompetencies((prev) => prev.filter((_, i) => i !== index));
    setMissingCompetencies((prev) => [...prev, item]);
    setHasEdits(true);
    setShowEditHintDialog(true);
  };

  const moveToCompetencies = (index: number) => {
    const item = missingCompetencies[index];
    setMissingCompetencies((prev) => prev.filter((_, i) => i !== index));
    setCompanyCompetencies((prev) => [...prev, item]);
    setHasEdits(true);
    setShowEditHintDialog(true);
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
    } catch {
      toast.error("Failed to save changes");
    }
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

  // Show analysis results (solo = read-only, no edits; with partners = full editing)
  return (
    <div className="py-4 space-y-6">
      {isSolo && (
        <div className="p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
          Add a partner to make edits and re-run gap analysis.
        </div>
      )}

      {/* Action buttons: only when with partners */}
      {!isSolo && (
        <div className="flex justify-end gap-2">
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
      )}

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

      {/* Competencies Grid: with +/- only when with partners */}
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
          {!isSolo && (
            <p className="text-xs text-muted-foreground mb-2">
              Use minus to move to Missing
            </p>
          )}
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {companyCompetencies.map((comp, idx) => (
              <div key={`c-${idx}`} className="flex items-center gap-2 group">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                <span className="text-sm flex-1">{comp}</span>
                {!isSolo && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-70 hover:opacity-100"
                    onClick={() => moveToMissing(idx)}
                    title="Move to Missing"
                    aria-label="Move to Missing"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Missing Competencies */}
        <div>
          <h4 className="font-medium mb-3 flex items-center gap-2">
            <XCircle className="h-4 w-4 text-red-600" />
            Missing ({missingCompetencies.length})
          </h4>
          {!isSolo && (
            <p className="text-xs text-muted-foreground mb-2">
              Use plus to move to Your Competencies
            </p>
          )}
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {missingCompetencies.map((comp, idx) => (
              <div key={`m-${idx}`} className="flex items-center gap-2 group">
                {!isSolo && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-70 hover:opacity-100 shrink-0"
                    onClick={() => moveToCompetencies(idx)}
                    title="Move to Your Competencies"
                    aria-label="Move to Your Competencies"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                )}
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                <span className="text-sm flex-1">{comp}</span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

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
                className="text-sm text-muted-foreground flex items-start gap-2"
              >
                <span className="text-yellow-500 mt-1">-</span>
                <span>{risk}</span>
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
                  className="text-sm text-muted-foreground flex items-start gap-2"
                >
                  <span className="text-blue-500 mt-1">-</span>
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        )}

      {/* Edit hint dialog - shown when user clicks +/- */}
      {company && (
        <AlertDialog open={showEditHintDialog} onOpenChange={setShowEditHintDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Save your edits permanently</AlertDialogTitle>
              <AlertDialogDescription>
                To save these competency changes, edit the capabilities on{" "}
                <strong>{company.company_name}</strong>&apos;s profile. Otherwise,
                edits will be lost when you re-run analysis or switch projects.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Got it</AlertDialogCancel>
              <AlertDialogAction asChild>
                <Link
                  href={`/company/${company.id}`}
                  className="inline-flex items-center gap-2"
                >
                  <ExternalLink className="h-4 w-4" />
                  Go to {company.company_name}
                </Link>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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
  );
}
