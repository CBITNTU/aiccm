"use client";

import { motion } from "framer-motion";
import { useRunGapAnalysis } from "@/hooks/useProjectMutations";
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
} from "lucide-react";
import { toast } from "sonner";
import type { GapAnalysis, RecommendedPartner } from "@/hooks/useProjects";
import type { Tender } from "@/hooks/useProjectDetails";
import type { Database } from "@/lib/supabase/types";

type Company = Database["public"]["Tables"]["companies"]["Row"];

interface GapAnalysisPanelProps {
  projectId: string;
  tender: Tender | null;
  company: Company | null;
  gapAnalysis: GapAnalysis | null;
  recommendedPartners: RecommendedPartner[];
}

export function GapAnalysisPanel({
  projectId,
  tender,
  company,
  gapAnalysis,
  recommendedPartners,
}: GapAnalysisPanelProps) {
  const runAnalysis = useRunGapAnalysis();

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
        tender: {
          title: tender.title,
          description: tender.description,
          buyer_name: tender.buyer_name || tender.buyer,
          value: tender.value,
          region: tender.region || tender.location,
        },
      });

      const gaps = result.gapAnalysis.missingCompetencies?.length || 0;
      const partnerCount = result.recommendedPartners.length;

      toast.success(
        `Gap analysis complete! Coverage: ${result.gapAnalysis.coveragePercentage}%, ${gaps} gaps, ${partnerCount} partners recommended`
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to run gap analysis"
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

  // Analysis not yet run
  if (!gapAnalysis) {
    return (
      <div className="py-6">
        <div className="text-center mb-4">
          <p className="text-muted-foreground mb-4">
            Run AI-powered gap analysis to identify missing competencies and find
            recommended partners
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

      {/* Coverage Score */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
      >
        <div className="flex justify-between text-sm mb-2">
          <span>Overall Coverage</span>
          <span className="font-medium">{gapAnalysis.coveragePercentage}%</span>
        </div>
        <Progress value={gapAnalysis.coveragePercentage} className="h-2" />
        <div className="flex justify-between mt-2 text-sm text-muted-foreground">
          <span>Readiness Score: {gapAnalysis.readinessScore}/100</span>
          <span>
            Analyzed:{" "}
            {new Date(gapAnalysis.analyzedAt).toLocaleDateString("en-GB")}
          </span>
        </div>
      </motion.div>

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
            Your Competencies ({gapAnalysis.companyCompetencies.length})
          </h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {gapAnalysis.companyCompetencies.map((comp, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-2 flex-shrink-0" />
                <span className="text-sm">{comp}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Missing Competencies */}
        <div>
          <h4 className="font-medium mb-3 flex items-center gap-2">
            <XCircle className="h-4 w-4 text-red-600" />
            Missing ({gapAnalysis.missingCompetencies.length})
          </h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {gapAnalysis.missingCompetencies.map((comp, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2 flex-shrink-0" />
                <span className="text-sm">{comp}</span>
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
      {gapAnalysis.recommendations && gapAnalysis.recommendations.length > 0 && (
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
