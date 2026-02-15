"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useSavedTenders } from "@/hooks/useSavedTenders";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bookmark, Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { TenderMatchCard } from "./TenderMatchCard";

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

interface SavedTendersProps {
  companyId?: string;
  readOnly?: boolean;
}

export function SavedTenders({
  companyId,
  readOnly = false,
}: SavedTendersProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: savedData, isLoading: loading } = useSavedTenders(companyId);
  const savedResults = useMemo(
    () => (savedData?.results as unknown as MatchingResult[]) ?? [],
    [savedData?.results],
  );
  const [filteredResults, setFilteredResults] = useState<MatchingResult[]>([]);
  const [keyword, setKeyword] = useState("");

  // Apply keyword filter whenever savedResults or keyword changes
  useEffect(() => {
    if (!keyword.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- derive filtered list from savedResults and keyword
      setFilteredResults(savedResults);
    } else {
      const lowerKeyword = keyword.toLowerCase().trim();
      const filtered = savedResults.filter(
        (result) =>
          result.tenders.title.toLowerCase().includes(lowerKeyword) ||
          result.tenders.description?.toLowerCase().includes(lowerKeyword) ||
          result.tenders.buyer.toLowerCase().includes(lowerKeyword) ||
          result.tenders.location?.toLowerCase().includes(lowerKeyword),
      );
      setFilteredResults(filtered);
    }
  }, [savedResults, keyword]);

  const removeBookmark = async (resultId: string) => {
    try {
      await api.toggleBookmark(resultId, false);
      toast.success("Removed from saved tenders");
      if (companyId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.savedTenders(companyId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.matchingResults(companyId) });
      }
    } catch (error) {
      console.error("Error removing bookmark:", error);
      toast.error("Failed to remove bookmark");
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Saved Tenders</h2>
          <p className="text-sm text-muted-foreground">
            {savedResults.length} saved tender
            {savedResults.length !== 1 ? "s" : ""}
            {keyword && filteredResults.length !== savedResults.length && (
              <span className="ml-1">({filteredResults.length} shown)</span>
            )}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-10 h-11"
          placeholder="Search saved tenders..."
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        {keyword && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
            onClick={() => setKeyword("")}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">
            Loading saved tenders...
          </span>
        </div>
      ) : savedResults.length === 0 ? (
        <div className="text-center py-16">
          <Bookmark className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No saved tenders yet</h3>
          <p className="text-muted-foreground">
            Go to &quot;Your Matches&quot; and click the bookmark icon to save
            tenders for later review.
          </p>
        </div>
      ) : filteredResults.length === 0 ? (
        <div className="text-center py-16">
          <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No matching results</h3>
          <p className="text-muted-foreground mb-4">
            No saved tenders match your search &quot;{keyword}&quot;
          </p>
          <Button variant="outline" onClick={() => setKeyword("")}>
            Clear Search
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredResults.map((result) => (
            <TenderMatchCard
              key={result.id}
              result={result}
              onViewDetails={() => {
                router.push(`/tenders/${result.tender_id}?companyId=${result.company_id}`);
              }}
              onBookmark={() => removeBookmark(result.id)}
              onDelete={() => removeBookmark(result.id)}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}

    </div>
  );
}
