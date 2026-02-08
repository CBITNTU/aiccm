"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, Target, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { TenderDetailDialog } from "@/components/TenderDetailDialog";
import { TenderMatchCard } from "./TenderMatchCard";

export interface MatchingFiltersState {
  keyword?: string;
  sortBy: string;
  sortDirection: string;
  minScore: number;
  maxScore: number;
  showApplied: string;
  quickFilter?: string | null;
}

const DEFAULT_FILTERS: MatchingFiltersState = {
  sortBy: "overall_score",
  sortDirection: "desc",
  minScore: 0,
  maxScore: 100,
  showApplied: "all",
};

interface MatchingResult {
  id: string;
  tender_id: string;
  company_id: string;
  overall_score: number;
  capability_score: number;
  experience_score: number;
  location_score: number;
  certification_score: number;
  match_reasons: string[];
  improvement_suggestions: string[];
  ai_analysis: Record<string, unknown>;
  is_bookmarked: boolean;
  is_applied: boolean;
  created_at: string;
  tenders: {
    title: string;
    buyer: string;
    description: string;
    location: string;
    deadline: string;
    budget_min: number;
    budget_max: number;
  };
}

interface TenderMatchingProps {
  companyId?: string;
  filters?: MatchingFiltersState;
  onCreateProject?: (tenderId: string) => void;
  readOnly?: boolean;
  onAnalyze?: () => void;
  analyzing?: boolean;
}

export function TenderMatching({
  companyId,
  filters: filtersProp,
  onCreateProject,
  readOnly = false,
  onAnalyze,
  analyzing: externalAnalyzing,
}: TenderMatchingProps) {
  const { user } = useAuth();
  const [matchingResults, setMatchingResults] = useState<MatchingResult[]>([]);
  const [filteredResults, setFilteredResults] = useState<MatchingResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [internalAnalyzing, setInternalAnalyzing] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [selectedResult, setSelectedResult] = useState<MatchingResult | null>(
    null,
  );
  const [dialogOpen, setDialogOpen] = useState(false);

  // Progress tracking state
  const [matchingProgress, setMatchingProgress] = useState<{
    batchId: string;
    totalJobs: number;
    completedJobs: number;
    failedJobs: number;
    status: "processing" | "completed" | "failed";
    progressPercent: number;
  } | null>(null);

  const analyzing =
    externalAnalyzing ??
    (internalAnalyzing || matchingProgress?.status === "processing");

  // Use stable filter reference to prevent infinite re-renders
  const filters = filtersProp ?? DEFAULT_FILTERS;

  // Serialize filter values for stable dependency comparison
  const filtersKey = JSON.stringify([
    filters.keyword,
    filters.sortBy,
    filters.sortDirection,
    filters.minScore,
    filters.maxScore,
    filters.showApplied,
    filters.quickFilter,
  ]);

  const fetchMatchingResultsMemo = useCallback(async () => {
    setLoading(true);
    try {
      if (!companyId) {
        setMatchingResults([]);
        return;
      }

      const supabase = createClient();
      const { data, error } = await supabase
        .from("matching_results")
        .select(
          `
          *,
          tenders (
            title,
            buyer,
            description,
            location,
            deadline,
            budget_min,
            budget_max
          )
        `,
        )
        .eq("company_id", companyId);

      if (error) throw error;
      setMatchingResults((data as MatchingResult[]) || []);
    } catch (error) {
      console.error("Error fetching matching results:", error);
      toast.error("Failed to fetch matching results");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  const cancelMatching = useCallback(
    async (batchId: string) => {
      console.log(`🛑 Attempting to cancel batch ${batchId}...`);

      try {
        // First, try to cancel the tracked batch
        const response = await fetch("/api/match-tenders/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batchId }),
        });

        if (response.ok) {
          const data = await response.json();
          console.log(`✅ Successfully cancelled batch ${batchId}:`, data);
        } else if (response.status === 404) {
          console.log(
            `⚠️ Batch ${batchId} not found (404) - may already be completed or never existed`,
          );
        } else {
          const data = await response.json();
          console.warn(
            `⚠️ Cancel API returned ${response.status}:`,
            data.error,
          );
        }
      } catch (error) {
        console.error("Error calling cancel API:", error);
      }

      // ALWAYS clear ALL batch-related state from localStorage
      // (even if the API call failed - important for stuck/stale batches)
      if (companyId) {
        localStorage.removeItem(`matching_batch_${companyId}`);
        localStorage.removeItem(`stale_check_${batchId}`);

        // Also clear any other stale_check entries
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith("stale_check_")) {
            localStorage.removeItem(key);
          }
        }
      }

      // Clear in-memory state
      setMatchingProgress(null);

      console.log(`✅ Cleared all local state for company ${companyId}`);
      toast.success("Cancelled - any running jobs will finish in background");

      // Refresh results after a delay to show completed jobs
      setTimeout(() => {
        fetchMatchingResultsMemo();
      }, 2000);
    },
    [companyId, fetchMatchingResultsMemo],
  );

  const checkMatchingProgress = useCallback(
    async (batchId: string) => {
      try {
        const response = await fetch(
          `/api/match-tenders/progress?batchId=${batchId}`,
        );
        if (!response.ok) {
          // Batch not found or completed - clear from localStorage
          if (response.status === 404) {
            console.log(`Batch ${batchId} not found (404) - clearing progress`);
            if (companyId) {
              localStorage.removeItem(`matching_batch_${companyId}`);
            }
            setMatchingProgress(null);
          } else {
            console.error(
              `Failed to fetch progress for batch ${batchId}:`,
              response.status,
              response.statusText,
            );
          }
          return;
        }

        const data = await response.json();

        // Validate response data
        if (!data.batch_id || data.total_jobs === undefined) {
          console.error("Invalid progress response:", data);
          return;
        }

        // Check if this batch belongs to the current company
        // (prevents showing progress for wrong company)
        if (companyId) {
          const storedBatchId = localStorage.getItem(
            `matching_batch_${companyId}`,
          );
          if (storedBatchId !== batchId) {
            console.warn(
              `Batch ${batchId} doesn't match stored batch ${storedBatchId} for company ${companyId}`,
            );
            // Clear stale batch and stop polling
            localStorage.removeItem(`matching_batch_${companyId}`);
            setMatchingProgress(null);
            return;
          }
        }

        const progressData = {
          batchId: data.batch_id,
          totalJobs: data.total_jobs || 0,
          completedJobs: data.completed_jobs || 0,
          failedJobs: data.failed_jobs || 0,
          status: data.status || "processing",
          progressPercent: data.progress_percent || 0,
        };

        console.log(
          `📊 Progress: ${progressData.completedJobs + progressData.failedJobs}/${progressData.totalJobs} (${progressData.progressPercent}%) - Batch ${batchId.slice(0, 8)}`,
        );
        setMatchingProgress(progressData);

        // If completed or failed, clear and check for results
        if (data.status === "completed" || data.status === "failed") {
          console.log(`Batch ${batchId} finished with status: ${data.status}`);
          if (companyId) {
            localStorage.removeItem(`matching_batch_${companyId}`);
          }
          setMatchingProgress(null); // Clear progress state
          await fetchMatchingResultsMemo();
          if (data.status === "completed") {
            toast.success(
              `Matching completed: ${data.completed_jobs} tenders analyzed`,
            );
          } else {
            toast.error(`Matching failed: ${data.failed_jobs} jobs failed`);
          }
        }

        // Auto-clear stale batches: if no progress after 60 seconds, clear it
        if (
          data.status === "processing" &&
          data.completed_jobs === 0 &&
          data.failed_jobs === 0
        ) {
          const staleCheckKey = `stale_check_${batchId}`;
          const firstCheckTime = localStorage.getItem(staleCheckKey);

          if (!firstCheckTime) {
            // First time seeing this batch at 0 progress
            localStorage.setItem(staleCheckKey, Date.now().toString());
          } else {
            const elapsed = Date.now() - parseInt(firstCheckTime);
            if (elapsed > 60000) {
              // 60 seconds with no progress
              console.warn(
                `⚠️ Batch ${batchId} stuck at 0 progress for ${Math.round(elapsed / 1000)}s - auto-clearing`,
              );
              if (companyId) {
                localStorage.removeItem(`matching_batch_${companyId}`);
              }
              localStorage.removeItem(staleCheckKey);
              setMatchingProgress(null);
              toast.info(
                "Previous matching was stuck. Click 'Run Analysis' to restart.",
              );
              return;
            }
          }
        } else if (data.completed_jobs > 0 || data.failed_jobs > 0) {
          // Clear stale check if we have progress
          localStorage.removeItem(`stale_check_${batchId}`);
        }
      } catch (error) {
        console.error("Error checking matching progress:", error);
        // Don't clear progress on network errors - might be temporary
      }
    },
    [companyId, fetchMatchingResultsMemo],
  );

  // Check for in-progress matching batch on mount
  useEffect(() => {
    if (user && companyId) {
      fetchMatchingResultsMemo();

      // Check for in-progress batch from localStorage
      const storedBatchId = localStorage.getItem(`matching_batch_${companyId}`);
      if (storedBatchId) {
        console.log(`🔄 Restoring batch from localStorage: ${storedBatchId}`);
        // Verify batch still exists and is active
        checkMatchingProgress(storedBatchId);
        // Note: checkMatchingProgress will auto-clear if batch is 404 or completed
      }
    }
  }, [user, companyId, checkMatchingProgress, fetchMatchingResultsMemo]);

  // Poll for progress and refetch results while matching is in progress (progressive results)
  useEffect(() => {
    if (!matchingProgress || matchingProgress.status !== "processing") {
      return;
    }

    const interval = setInterval(() => {
      if (matchingProgress.batchId) {
        checkMatchingProgress(matchingProgress.batchId);
        // Refetch results so new matches appear as they complete (progressive result delivery)
        fetchMatchingResultsMemo();
      }
    }, 5000); // Poll every 5 seconds for progress and incremental results

    return () => clearInterval(interval);
  }, [matchingProgress, checkMatchingProgress, fetchMatchingResultsMemo]);

  // Memoize filtered results to avoid infinite loops
  useEffect(() => {
    applyFiltersAndSorting();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchingResults, filtersKey]);

  // Alias for backward compatibility
  const fetchMatchingResults = fetchMatchingResultsMemo;

  const applyFiltersAndSorting = () => {
    let filtered = [...matchingResults];

    // Apply keyword filter
    if (filters.keyword && filters.keyword.trim()) {
      const keyword = filters.keyword.toLowerCase().trim();
      filtered = filtered.filter(
        (result) =>
          result.tenders.title.toLowerCase().includes(keyword) ||
          result.tenders.description?.toLowerCase().includes(keyword) ||
          result.tenders.buyer.toLowerCase().includes(keyword) ||
          result.tenders.location?.toLowerCase().includes(keyword),
      );
    }

    // Apply score range filter
    filtered = filtered.filter(
      (result) =>
        result.overall_score >= (filters.minScore || 0) &&
        result.overall_score <= (filters.maxScore || 100),
    );

    // Apply status filter
    if (filters.showApplied === "applied") {
      filtered = filtered.filter((result) => result.is_applied);
    } else if (filters.showApplied === "not_applied") {
      filtered = filtered.filter((result) => !result.is_applied);
    } else if (filters.showApplied === "bookmarked") {
      filtered = filtered.filter((result) => result.is_bookmarked);
    }

    // Apply quick filters
    if (filters.quickFilter === "high_score") {
      filtered = filtered.filter((result) => result.overall_score >= 80);
    } else if (filters.quickFilter === "urgent") {
      filtered = filtered.filter((result) => {
        if (!result.tenders.deadline) return false;
        const deadline = new Date(result.tenders.deadline);
        const today = new Date();
        const daysDiff = Math.ceil(
          (deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
        );
        return daysDiff <= 7 && daysDiff >= 0;
      });
    } else if (filters.quickFilter === "high_value") {
      filtered = filtered.filter(
        (result) =>
          (result.tenders.budget_max || result.tenders.budget_min || 0) >=
          1000000,
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: number, bValue: number;

      switch (filters.sortBy) {
        case "overall_score":
        case "capability_score":
        case "experience_score":
        case "location_score":
        case "certification_score":
          aValue = (a[filters.sortBy as keyof MatchingResult] as number) || 0;
          bValue = (b[filters.sortBy as keyof MatchingResult] as number) || 0;
          break;
        case "created_at":
          aValue = new Date(a.created_at).getTime();
          bValue = new Date(b.created_at).getTime();
          break;
        case "deadline":
          aValue = a.tenders.deadline
            ? new Date(a.tenders.deadline).getTime()
            : 0;
          bValue = b.tenders.deadline
            ? new Date(b.tenders.deadline).getTime()
            : 0;
          break;
        case "budget":
          aValue = a.tenders.budget_max || a.tenders.budget_min || 0;
          bValue = b.tenders.budget_max || b.tenders.budget_min || 0;
          break;
        default:
          aValue = a.overall_score;
          bValue = b.overall_score;
      }

      return filters.sortDirection === "desc"
        ? bValue - aValue
        : aValue - bValue;
    });

    setFilteredResults(filtered);
  };

  const runAnalysis = async () => {
    if (!companyId) {
      toast.error("Please select a company to analyze");
      return;
    }

    // Prevent multiple simultaneous analyses
    if (analyzing) {
      toast.info("Analysis already in progress");
      return;
    }

    // Prevent starting new batch if one is already processing
    if (matchingProgress && matchingProgress.status === "processing") {
      toast.info(
        "Matching already in progress. Click 'Clear & Restart' to cancel.",
      );
      return;
    }

    if (onAnalyze) {
      try {
        await onAnalyze();
        // Refresh results after external analysis
        await fetchMatchingResults();
      } catch (error) {
        console.error("Error in external analysis handler:", error);
      }
      return;
    }

    setInternalAnalyzing(true);

    // Clear any stale batch state before starting new one
    if (companyId) {
      const oldBatchId = localStorage.getItem(`matching_batch_${companyId}`);
      if (oldBatchId) {
        console.log(
          `🧹 Clearing old batch ${oldBatchId} before starting new one`,
        );
        localStorage.removeItem(`stale_check_${oldBatchId}`);
      }
    }

    try {
      const response = await fetch("/api/match-tenders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId }),
      });

      if (!response.ok) {
        let errorMessage = "Failed to start matching";
        const status = response.status;
        const statusText = response.statusText;

        // Read response as text first (can only read body once)
        const responseText = await response.text();
        console.error("Matching API error - Raw response:", {
          status,
          statusText,
          contentType: response.headers.get("content-type"),
          bodyLength: responseText.length,
          bodyPreview: responseText.substring(0, 500),
          fullBody: responseText,
        });

        try {
          const data = JSON.parse(responseText);
          errorMessage =
            data.error || data.message || data.details || errorMessage;
          console.error("Matching API error - Parsed:", {
            status,
            statusText,
            error: data.error,
            message: data.message,
            details: data.details,
            fullData: data,
          });
        } catch (parseError) {
          console.error("Failed to parse error response as JSON:", parseError);
          errorMessage = responseText || `HTTP ${status}: ${statusText}`;
        }

        throw new Error(errorMessage);
      }

      // Read response as text first, then parse
      const responseText = await response.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error("Failed to parse success response as JSON:", {
          parseError,
          responseText: responseText.substring(0, 500),
        });
        throw new Error("Invalid response format from server");
      }

      // Handle response - could be new batch or existing batch
      if (data.status === "already_running") {
        console.log(
          `ℹ️ Batch ${data.batch_id} already running for this company`,
        );
        toast.info("Matching already in progress - resuming...");
      } else {
        console.log(
          `✅ Created new batch: ${data.batch_id} (${data.total_tenders} tenders)`,
        );
        toast.success(`Matching started: ${data.total_tenders} tenders queued`);
      }

      // Store batch ID in localStorage for persistence
      if (data.batch_id && companyId) {
        const existingBatchId = localStorage.getItem(
          `matching_batch_${companyId}`,
        );
        if (existingBatchId && existingBatchId !== data.batch_id) {
          console.log(
            `🔄 Switching from batch ${existingBatchId} to ${data.batch_id}`,
          );
        }
        localStorage.setItem(`matching_batch_${companyId}`, data.batch_id);
      }

      // Set initial progress (will be updated by polling)
      setMatchingProgress({
        batchId: data.batch_id,
        totalJobs: data.total_tenders,
        completedJobs: 0,
        failedJobs: 0,
        status: "processing",
        progressPercent: 0,
      });

      // Start polling for progress
      if (data.batch_id) {
        checkMatchingProgress(data.batch_id);
      }
    } catch (error) {
      console.error("Error starting matching:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to start matching",
      );
    } finally {
      setInternalAnalyzing(false);
    }
  };

  const deleteResult = async (resultId: string) => {
    setDeleting(resultId);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("matching_results")
        .delete()
        .eq("id", resultId);

      if (error) throw error;

      setMatchingResults((prev) =>
        prev.filter((result) => result.id !== resultId),
      );
      toast.success("Match result deleted successfully");
    } catch (error) {
      console.error("Error deleting result:", error);
      toast.error("Failed to delete match result");
    } finally {
      setDeleting(null);
    }
  };

  const toggleBookmark = async (resultId: string, currentStatus: boolean) => {
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("matching_results")
        .update({ is_bookmarked: !currentStatus })
        .eq("id", resultId);

      if (error) throw error;

      setMatchingResults((prev) =>
        prev.map((result) =>
          result.id === resultId
            ? { ...result, is_bookmarked: !currentStatus }
            : result,
        ),
      );
      toast.success(
        currentStatus ? "Removed from saved tenders" : "Added to saved tenders",
      );
    } catch (error) {
      console.error("Error toggling bookmark:", error);
      toast.error("Failed to update bookmark");
    }
  };

  // If no company selected, show placeholder
  if (!companyId) {
    return (
      <div className="text-center py-16">
        <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground">
          Select a company above to view and analyze tender opportunities
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Results summary */}
      {!loading && matchingResults.length > 0 && (
        <div className="flex items-center justify-between py-3">
          <p className="text-sm text-muted-foreground">
            Showing{" "}
            <span className="font-medium text-foreground">
              {filteredResults.length}
            </span>{" "}
            {filteredResults.length !== matchingResults.length && (
              <>of {matchingResults.length}</>
            )}{" "}
            matches
          </p>
          {!onAnalyze && (
            <Button
              onClick={runAnalysis}
              disabled={analyzing || loading || readOnly}
              size="sm"
              title={
                readOnly ? "Action restricted for pending accounts" : undefined
              }
            >
              {analyzing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Target className="w-4 h-4 mr-2" />
                  Run Analysis
                </>
              )}
            </Button>
          )}
        </div>
      )}

      {/* Progress Bar */}
      {matchingProgress && matchingProgress.status === "processing" && (
        <div className="mb-4 p-4 bg-muted rounded-lg border">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="font-medium">Matching in progress...</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {matchingProgress.completedJobs} / {matchingProgress.totalJobs}{" "}
                tenders
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => cancelMatching(matchingProgress.batchId)}
                className="h-7"
              >
                <X className="h-3 w-3 mr-1" />
                {matchingProgress.completedJobs === 0 &&
                matchingProgress.failedJobs === 0
                  ? "Clear & Restart"
                  : "Cancel"}
              </Button>
            </div>
          </div>
          <Progress value={matchingProgress.progressPercent} className="h-2" />
          <p className="text-xs text-muted-foreground mt-2">
            Analyzing tenders... {matchingProgress.progressPercent}% complete
            {matchingProgress.failedJobs > 0 &&
              ` (${matchingProgress.failedJobs} failed)`}
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading matches...</span>
        </div>
      ) : filteredResults.length === 0 ? (
        <div className="text-center py-16">
          <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">
            No matching results found
          </h3>
          <p className="text-muted-foreground mb-4">
            {matchingResults.length === 0
              ? "No tender matches found for this company yet. Click 'Run Analysis' to analyze available tenders."
              : `${matchingResults.length} matches found but filtered out. Adjust your filters to see results.`}
          </p>
          {matchingResults.length === 0 && !readOnly && (
            <Button onClick={runAnalysis} disabled={analyzing}>
              <Target className="w-4 h-4 mr-2" />
              {analyzing ? "Analyzing..." : "Start Analysis"}
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredResults.map((result) => (
            <TenderMatchCard
              key={result.id}
              result={result}
              onViewDetails={() => {
                setSelectedResult(result);
                setDialogOpen(true);
              }}
              onBookmark={() => toggleBookmark(result.id, result.is_bookmarked)}
              onDelete={() => deleteResult(result.id)}
              isDeleting={deleting === result.id}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}

      {selectedResult && (
        <TenderDetailDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          result={selectedResult}
          companyId={companyId}
          onCreateProject={
            readOnly
              ? undefined
              : onCreateProject
                ? (tenderId) => onCreateProject(tenderId)
                : undefined
          }
          readOnly={readOnly}
        />
      )}
    </div>
  );
}
