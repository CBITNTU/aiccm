"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  Award,
  Lightbulb,
  MapPin,
  Banknote,
  Calendar,
  Users,
  ExternalLink,
  Tag,
  Plus,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import { useDeployment } from "@/lib/deployment/client";
import { formatCurrency, resolveCurrencyConfig } from "@/lib/format/currency";
import type { MatchingResultRecord, TenderRecord } from "@/lib/api/types";

interface TenderDetailDialogProps {
  result: MatchingResultRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId?: string;
  onCreateProject?: (tenderId: string, companyId?: string) => void;
  readOnly?: boolean;
}

export function TenderDetailDialog({
  result,
  open,
  onOpenChange,
  companyId,
  onCreateProject,
  readOnly = false,
}: TenderDetailDialogProps) {
  const router = useRouter();
  const { currency } = useDeployment();
  const tenderCurrency = resolveCurrencyConfig(result?.tenders?.currency, currency);
  const [tenderDetails, setTenderDetails] = useState<TenderRecord | null>(null);
  const [taxonomies, setTaxonomies] = useState<
    Array<{ id: string; name: string }>
  >([]);

  // Fetch full tender details to get external_id for the correct link
  useEffect(() => {
    const fetchTenderDetails = async () => {
      if (!result?.tenderId) return;

      try {
        const tenderResult = await api.getTender(result.tenderId);
        const tender = tenderResult.tender;
        if (tender) {
          setTenderDetails(tender);
        }

        // Taxonomies come with the tender response
        if (tenderResult.taxonomies) {
          setTaxonomies(tenderResult.taxonomies);
        }
      } catch (error) {
        console.error("Error fetching tender details:", error);
      }
    };

    if (open) {
      fetchTenderDetails();
    }
  }, [result?.tenderId, open]);

  if (!result) return null;

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const getScoreVariant = (
    score: number,
  ): "default" | "secondary" | "destructive" => {
    if (score >= 80) return "default";
    if (score >= 60) return "secondary";
    return "destructive";
  };

  const handleApplySolo = () => {
    // Try to get the application URL from documents, otherwise construct from reference_number
    const applicationUrl = (tenderDetails?.documents as { application_url?: string } | null)
      ?.application_url;
    const referenceNumber = tenderDetails?.referenceNumber;

    const externalUrl =
      applicationUrl ||
      (referenceNumber
        ? `https://www.find-tender.service.gov.uk/Notice/${referenceNumber}?origin=SearchResults&p=1`
        : null);

    if (externalUrl) {
      window.open(externalUrl, "_blank");
    }
  };

  const handleBuildTeam = () => {
    // Navigate to consulting page with tender ID and company ID
    onOpenChange(false);
    // Store state in sessionStorage since Next.js doesn't support state in router.push
    sessionStorage.setItem(
      "voNavState",
      JSON.stringify({
        tenderId: result.tenderId,
        tenderTitle: result.tenders?.title,
        companyId: companyId,
      }),
    );
    router.push("/vo");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <DialogTitle className="text-xl">
                {result.tenders?.title}
              </DialogTitle>
              <DialogDescription className="mt-1 flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                {result.tenders?.buyer} - {result.tenders?.location}
              </DialogDescription>
            </div>
            <Badge
              variant={getScoreVariant(result.overallScore ?? 0)}
              className="text-lg px-3 py-1"
            >
              {result.overallScore ?? 0}% Match
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* AI Summary (if available) */}
          {tenderDetails?.aiSummary && (
            <div>
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <span className="text-blue-500">✨</span>
                AI Summary
              </h4>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                {tenderDetails.aiSummary}
              </p>
            </div>
          )}

          {/* Taxonomies */}
          {taxonomies.length > 0 && (
            <div>
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <Tag className="h-4 w-4" />
                Tender Categories
              </h4>
              <div className="flex flex-wrap gap-2">
                {taxonomies.map((taxonomy) => (
                  <Badge key={taxonomy.id} variant="secondary">
                    {taxonomy.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Tender Description */}
          {result.tenders?.description && (
            <div>
              <h4 className="font-medium mb-2">Description</h4>
              <p className="text-sm text-muted-foreground">
                {result.tenders.description}
              </p>
            </div>
          )}

          {/* Budget and Deadline */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {result.tenders?.budgetMin && result.tenders?.budgetMax && (
              <div className="flex items-center gap-2">
                <Banknote className="w-4 h-4 text-muted-foreground" />
                <div>
                  <div className="text-sm text-muted-foreground">
                    Budget Range
                  </div>
                  <div className="font-semibold">
                    {formatCurrency(result.tenders.budgetMin, tenderCurrency)} -{" "}
                    {formatCurrency(result.tenders.budgetMax, tenderCurrency)}
                  </div>
                </div>
              </div>
            )}
            {result.tenders?.deadline && (
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <div>
                  <div className="text-sm text-muted-foreground">Deadline</div>
                  <div className="font-semibold">
                    {new Date(result.tenders.deadline).toLocaleDateString()}
                  </div>
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Action Buttons */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button
              onClick={handleApplySolo}
              className="w-full"
              size="lg"
              variant="outline"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Go to Original Website
            </Button>
            {onCreateProject && !readOnly && (
              <Button
                onClick={() => {
                  onCreateProject(result.tenderId, companyId);
                  onOpenChange(false);
                }}
                className="w-full"
                size="lg"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Project
              </Button>
            )}
            {!readOnly && (
              <Button
                onClick={handleBuildTeam}
                variant="outline"
                className="w-full"
                size="lg"
              >
                <Users className="w-4 h-4 mr-2" />
                Build Consulting Team
              </Button>
            )}
          </div>

          <Separator />

          {/* Score Breakdown */}
          <div>
            <h4 className="font-medium mb-4">Match Score Breakdown</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(() => {
                const scoreExplanations =
                  ((result.aiAnalysis as { scoreExplanations?: unknown } | null | undefined)
                    ?.scoreExplanations as {
                    capability?: string;
                    experience?: string;
                    location?: string;
                    certification?: string;
                  }) || {};

                return (
                  <>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Capability</span>
                        <span
                          className={getScoreColor(result.capabilityScore ?? 0)}
                        >
                          {result.capabilityScore ?? 0}%
                        </span>
                      </div>
                      <Progress
                        value={result.capabilityScore ?? 0}
                        className="h-2"
                      />
                      {scoreExplanations.capability && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {scoreExplanations.capability}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Experience</span>
                        <span
                          className={getScoreColor(result.experienceScore ?? 0)}
                        >
                          {result.experienceScore ?? 0}%
                        </span>
                      </div>
                      <Progress
                        value={result.experienceScore ?? 0}
                        className="h-2"
                      />
                      {scoreExplanations.experience && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {scoreExplanations.experience}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Location</span>
                        <span className={getScoreColor(result.locationScore ?? 0)}>
                          {result.locationScore ?? 0}%
                        </span>
                      </div>
                      <Progress value={result.locationScore ?? 0} className="h-2" />
                      {scoreExplanations.location && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {scoreExplanations.location}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Certification</span>
                        <span
                          className={getScoreColor(result.certificationScore ?? 0)}
                        >
                          {result.certificationScore ?? 0}%
                        </span>
                      </div>
                      <Progress
                        value={result.certificationScore ?? 0}
                        className="h-2"
                      />
                      {scoreExplanations.certification && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {scoreExplanations.certification}
                        </p>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>

          <Separator />

          {/* AI Analysis Summary */}
          {(result.aiAnalysis as { summary?: string } | null)?.summary && (
            <div>
              <h4 className="font-medium mb-2">AI Analysis Summary</h4>
              <p className="text-sm text-muted-foreground">
                {(result.aiAnalysis as { summary: string }).summary}
              </p>
            </div>
          )}

          {/* Match Reasons */}
          {result.matchReasons && result.matchReasons.length > 0 && (
            <div>
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <Award className="h-4 w-4" />
                Key Strengths
              </h4>
              <div className="space-y-2">
                {result.matchReasons.map((reason, index) => (
                  <div key={index} className="flex items-start gap-2 text-sm">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-2 flex-shrink-0" />
                    <span>{reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Improvement Suggestions */}
          {result.improvementSuggestions &&
            result.improvementSuggestions.length > 0 && (
              <div>
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <Lightbulb className="h-4 w-4" />
                  Improvement Suggestions
                </h4>
                <div className="space-y-2">
                  {result.improvementSuggestions.map((suggestion, index) => (
                    <div key={index} className="flex items-start gap-2 text-sm">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 flex-shrink-0" />
                      <span>{suggestion}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
