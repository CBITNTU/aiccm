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
  const [selectedResult, setSelectedResult] = useState<MatchingResult | null>(null);
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

  const analyzing = externalAnalyzing ?? (internalAnalyzing || (matchingProgress?.status === "processing"));

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
        `
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

  const cancelMatching = useCallback(async (batchId: string) => {
    try {
      const response = await fetch("/api/match-tenders/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to cancel matching");
      }

      // Clear from localStorage
      if (companyId) {
        localStorage.removeItem(`matching_batch_${companyId}`);
      }

      setMatchingProgress(null);
      toast.success("Matching cancelled");
    } catch (error) {
      console.error("Error cancelling matching:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to cancel matching"
      );
    }
  }, [companyId]);

  const checkMatchingProgress = useCallback(async (batchId: string) => {
    try {
      const response = await fetch(`/api/match-tenders/progress?batchId=${batchId}`);
      if (!response.ok) {
        // Batch not found or completed - clear from localStorage
        if (response.status === 404) {
          if (companyId) {
            localStorage.removeItem(`matching_batch_${companyId}`);
          }
          setMatchingProgress(null);
        }
        return;
      }

      const data = await response.json();
      setMatchingProgress({
        batchId: data.batch_id,
        totalJobs: data.total_jobs,
        completedJobs: data.completed_jobs,
        failedJobs: data.failed_jobs,
        status: data.status,
        progressPercent: data.progress_percent,
      });

      // If completed, refresh results and clear localStorage
      if (data.status === "completed" || data.status === "failed") {
        if (companyId) {
          localStorage.removeItem(`matching_batch_${companyId}`);
        }
        await fetchMatchingResultsMemo();
        if (data.status === "completed") {
          toast.success(`Matching completed: ${data.completed_jobs} tenders analyzed`);
        }
      }
    } catch (error) {
      console.error("Error checking matching progress:", error);
    }
  }, [companyId, fetchMatchingResultsMemo]);

  // Check for in-progress matching batch on mount
  useEffect(() => {
    if (user && companyId) {
      fetchMatchingResultsMemo();
      
      // Check for in-progress batch from localStorage
      const storedBatchId = localStorage.getItem(`matching_batch_${companyId}`);
      if (storedBatchId) {
        checkMatchingProgress(storedBatchId);
      }
    }
  }, [user, companyId, checkMatchingProgress, fetchMatchingResultsMemo]);

  // Poll for progress if matching is in progress
  useEffect(() => {
    if (!matchingProgress || matchingProgress.status !== "processing") {
      return;
    }

    const interval = setInterval(() => {
      if (matchingProgress.batchId) {
        checkMatchingProgress(matchingProgress.batchId);
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(interval);
  }, [matchingProgress, checkMatchingProgress]);

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
          result.tenders.location?.toLowerCase().includes(keyword)
      );
    }

    // Apply score range filter
    filtered = filtered.filter(
      (result) =>
        result.overall_score >= (filters.minScore || 0) &&
        result.overall_score <= (filters.maxScore || 100)
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
          (deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        );
        return daysDiff <= 7 && daysDiff >= 0;
      });
    } else if (filters.quickFilter === "high_value") {
      filtered = filtered.filter(
        (result) =>
          (result.tenders.budget_max || result.tenders.budget_min || 0) >= 1000000
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
          aValue = a.tenders.deadline ? new Date(a.tenders.deadline).getTime() : 0;
          bValue = b.tenders.deadline ? new Date(b.tenders.deadline).getTime() : 0;
          break;
        case "budget":
          aValue = a.tenders.budget_max || a.tenders.budget_min || 0;
          bValue = b.tenders.budget_max || b.tenders.budget_min || 0;
          break;
        default:
          aValue = a.overall_score;
          bValue = b.overall_score;
      }

      return filters.sortDirection === "desc" ? bValue - aValue : aValue - bValue;
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
          errorMessage = data.error || data.message || data.details || errorMessage;
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
      
      // Store batch ID in localStorage for persistence
      if (data.batch_id && companyId) {
        localStorage.setItem(`matching_batch_${companyId}`, data.batch_id);
      }

      // Set initial progress
      setMatchingProgress({
        batchId: data.batch_id,
        totalJobs: data.total_tenders,
        completedJobs: 0,
        failedJobs: 0,
        status: "processing",
        progressPercent: 0,
      });

      toast.success(`Matching started: ${data.total_tenders} tenders queued`);
      
      // Start polling for progress
      if (data.batch_id) {
        checkMatchingProgress(data.batch_id);
      }
    } catch (error) {
      console.error("Error starting matching:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to start matching"
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

      setMatchingResults((prev) => prev.filter((result) => result.id !== resultId));
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
          result.id === resultId ? { ...result, is_bookmarked: !currentStatus } : result
        )
      );
      toast.success(
        currentStatus ? "Removed from saved tenders" : "Added to saved tenders"
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
            <span className="font-medium text-foreground">{filteredResults.length}</span>{" "}
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
              title={readOnly ? "Action restricted for pending accounts" : undefined}
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
                {matchingProgress.completedJobs} / {matchingProgress.totalJobs} tenders
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => cancelMatching(matchingProgress.batchId)}
                className="h-7"
              >
                <X className="h-3 w-3 mr-1" />
                Cancel
              </Button>
            </div>
          </div>
          <Progress value={matchingProgress.progressPercent} className="h-2" />
          <p className="text-xs text-muted-foreground mt-2">
            Analyzing tenders... {matchingProgress.progressPercent}% complete
            {matchingProgress.failedJobs > 0 && ` (${matchingProgress.failedJobs} failed)`}
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
          <h3 className="text-lg font-semibold mb-2">No matching results found</h3>
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
