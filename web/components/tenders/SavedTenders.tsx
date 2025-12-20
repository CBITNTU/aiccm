"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  TrendingUp,
  MapPin,
  Eye,
  Loader2,
  Bookmark,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { TenderDetailDialog } from "@/components/TenderDetailDialog";

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
}

export function SavedTenders({ companyId }: SavedTendersProps) {
  const { user } = useAuth();
  const [savedResults, setSavedResults] = useState<MatchingResult[]>([]);
  const [filteredResults, setFilteredResults] = useState<MatchingResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedResult, setSelectedResult] = useState<MatchingResult | null>(
    null
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [keyword, setKeyword] = useState("");

  useEffect(() => {
    if (user) {
      fetchSavedResults();
    }
  }, [user, companyId]);

  // Apply keyword filter whenever savedResults or keyword changes
  useEffect(() => {
    if (!keyword.trim()) {
      setFilteredResults(savedResults);
    } else {
      const lowerKeyword = keyword.toLowerCase().trim();
      const filtered = savedResults.filter(
        (result) =>
          result.tenders.title.toLowerCase().includes(lowerKeyword) ||
          result.tenders.description?.toLowerCase().includes(lowerKeyword) ||
          result.tenders.buyer.toLowerCase().includes(lowerKeyword) ||
          result.tenders.location?.toLowerCase().includes(lowerKeyword)
      );
      setFilteredResults(filtered);
    }
  }, [savedResults, keyword]);

  const fetchSavedResults = async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      let query = supabase
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
        .eq("is_bookmarked", true)
        .order("created_at", { ascending: false });

      // Filter by company if provided
      if (companyId) {
        query = query.eq("company_id", companyId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setSavedResults((data as unknown as MatchingResult[]) || []);
      setFilteredResults((data as unknown as MatchingResult[]) || []);
    } catch (error) {
      console.error("Error fetching saved results:", error);
      toast.error("Failed to fetch saved tenders");
    } finally {
      setLoading(false);
    }
  };

  const removeBookmark = async (resultId: string) => {
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("matching_results")
        .update({ is_bookmarked: false })
        .eq("id", resultId);

      if (error) throw error;

      setSavedResults((prev) => prev.filter((result) => result.id !== resultId));
      toast.success("Removed from saved tenders");
    } catch (error) {
      console.error("Error removing bookmark:", error);
      toast.error("Failed to remove bookmark");
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const formatBudget = (min?: number, max?: number): string => {
    if (!min && !max) return "Not specified";
    if (min && max && min !== max) {
      return `£${min.toLocaleString()} - £${max.toLocaleString()}`;
    }
    if (min) return `£${min.toLocaleString()}`;
    if (max) return `£${max.toLocaleString()}`;
    return "Not specified";
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const isDeadlineSoon = (deadline: string): boolean => {
    if (!deadline) return false;
    const deadlineDate = new Date(deadline);
    const today = new Date();
    const daysUntilDeadline = Math.ceil(
      (deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysUntilDeadline <= 7 && daysUntilDeadline >= 0;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Your Saved Tenders</h2>
        <p className="text-muted-foreground">
          Tenders you&apos;ve bookmarked for later review
          {keyword && filteredResults.length !== savedResults.length && (
            <span className="ml-2 text-primary font-medium">
              (Showing {filteredResults.length} of {savedResults.length} saved
              tenders)
            </span>
          )}
        </p>
      </div>

      {/* Keyword Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2">
            <Label htmlFor="savedKeyword" className="flex items-center gap-2">
              <Search className="w-4 h-4" />
              Search your saved tenders
            </Label>
            <Input
              id="savedKeyword"
              placeholder="Search by title, buyer, location, or description..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="w-full"
            />
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="min-h-[400px] flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Loading saved tenders...</p>
          </div>
        </div>
      ) : savedResults.length === 0 ? (
        <Card className="min-h-[300px]">
          <CardContent className="flex items-center justify-center h-full py-12">
            <div className="text-center">
              <Bookmark className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                No saved tenders yet
              </h3>
              <p className="text-muted-foreground">
                Go to &quot;Your Matches&quot; and click the bookmark icon to
                save tenders for later review.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : filteredResults.length === 0 ? (
        <Card className="min-h-[300px]">
          <CardContent className="flex items-center justify-center h-full py-12">
            <div className="text-center">
              <Search className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No matching results</h3>
              <p className="text-muted-foreground">
                No saved tenders match your search &quot;{keyword}&quot;. Try
                different keywords.
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setKeyword("")}
              >
                Clear Search
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {filteredResults.map((result) => (
            <Card key={result.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg mb-1">
                      {result.tenders.title}
                    </CardTitle>
                    <CardDescription className="flex items-center space-x-4 text-sm">
                      <span className="flex items-center">
                        <MapPin className="w-3 h-3 mr-1" />
                        {result.tenders.buyer}
                      </span>
                      <span>{result.tenders.location}</span>
                    </CardDescription>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge
                      variant={
                        result.overall_score >= 80
                          ? "default"
                          : result.overall_score >= 60
                            ? "secondary"
                            : "outline"
                      }
                      className="text-lg px-3 py-1"
                    >
                      <TrendingUp className="w-4 h-4 mr-1" />
                      {result.overall_score}%
                    </Badge>
                    {result.is_applied && (
                      <Badge variant="secondary">Applied</Badge>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                <div
                  className="grid grid-cols-4 gap-2 mb-3 cursor-pointer hover:bg-muted/50 p-2 rounded-lg transition-colors"
                  onClick={() => {
                    setSelectedResult(result);
                    setDialogOpen(true);
                  }}
                >
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground">
                      Capability
                    </div>
                    <div
                      className={`text-sm font-medium ${getScoreColor(result.capability_score)}`}
                    >
                      {result.capability_score}%
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground">
                      Experience
                    </div>
                    <div
                      className={`text-sm font-medium ${getScoreColor(result.experience_score)}`}
                    >
                      {result.experience_score}%
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground">Location</div>
                    <div
                      className={`text-sm font-medium ${getScoreColor(result.location_score)}`}
                    >
                      {result.location_score}%
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground">
                      Certification
                    </div>
                    <div
                      className={`text-sm font-medium ${getScoreColor(result.certification_score)}`}
                    >
                      {result.certification_score}%
                    </div>
                  </div>
                </div>

                <div
                  className="cursor-pointer hover:bg-muted/50 p-2 rounded-lg transition-colors"
                  onClick={() => {
                    setSelectedResult(result);
                    setDialogOpen(true);
                  }}
                >
                  <div className="grid grid-cols-2 gap-4 text-sm mb-2">
                    <div>
                      <span className="font-medium">Budget:</span>{" "}
                      {formatBudget(
                        result.tenders.budget_min,
                        result.tenders.budget_max
                      )}
                    </div>
                    <div>
                      <span className="font-medium">Deadline:</span>{" "}
                      <span
                        className={
                          isDeadlineSoon(result.tenders.deadline)
                            ? "text-red-600 font-medium"
                            : ""
                        }
                      >
                        {result.tenders.deadline
                          ? formatDate(result.tenders.deadline)
                          : "Not specified"}
                      </span>
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                    {result.tenders.description}
                  </p>

                  {result.match_reasons && result.match_reasons.length > 0 && (
                    <div className="mb-3">
                      <div className="text-xs font-medium text-muted-foreground mb-1">
                        Key Matches:
                      </div>
                      <div className="text-xs text-green-700 dark:text-green-400">
                        {result.match_reasons[0]}
                        {result.match_reasons.length > 1 &&
                          ` (+${result.match_reasons.length - 1} more)`}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-3 border-t">
                  <span className="text-xs text-muted-foreground">
                    Saved {formatDate(result.created_at)}
                  </span>
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedResult(result);
                        setDialogOpen(true);
                      }}
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      View Details
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeBookmark(result.id)}
                    >
                      <Bookmark className="w-4 h-4 fill-current" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {selectedResult && (
        <TenderDetailDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          result={selectedResult}
          companyId={selectedResult.company_id}
        />
      )}
    </div>
  );
}
