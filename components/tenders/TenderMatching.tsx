"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { AlertCircle, Target, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { TenderDetailDialog } from "@/components/TenderDetailDialog";
import { TenderMatchCard } from "./TenderMatchCard";
import { api } from "@/lib/api/client";

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

  const analyzing = externalAnalyzing ?? internalAnalyzing;

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

  const fetchMatchingResults = async () => {
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
  };

  useEffect(() => {
    if (user && companyId) {
      fetchMatchingResults();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, companyId]);

  // Memoize filtered results to avoid infinite loops
  useEffect(() => {
    applyFiltersAndSorting();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchingResults, filtersKey]);

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
      const data = await api.matchTenders(companyId);

      if (data.up_to_date) {
        toast.success("All tenders are up to date - no new analysis needed");
      } else {
        toast.success(`Analysis complete! Found ${data.analyzed_count || 0} new matches.`);
      }

      // Refresh results after analysis
      await fetchMatchingResults();
    } catch (error) {
      console.error("Error running analysis:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to run tender analysis. Please try again.";
      toast.error(errorMessage);
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
